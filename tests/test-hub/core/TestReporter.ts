import fs from 'fs/promises';
import path from 'path';
import { format } from 'date-fns';
import chalk from 'chalk';
import { 
  TestResult, 
  TestReport, 
  ReportSummary, 
  PerformanceMetrics,
  SecurityAudit,
  EndpointMetric,
  TestOptions,
  ReporterOptions
} from '../types';
import { generateHTMLReport } from '../utils/htmlReporter';
import { generatePDFReport } from '../utils/pdfReporter';
import { sendSlackNotification, sendEmailNotification } from '../utils/notifications';
import { logger } from '../utils/logger';

export class TestReporter {
  private options: ReporterOptions;
  private performanceData: Map<string, EndpointMetric> = new Map();
  private securityFindings: SecurityAudit = {
    vulnerabilities: [],
    passedChecks: [],
    failedChecks: [],
    riskScore: 0,
    compliance: {
      owasp: true,
      pci: true,
      gdpr: true,
      details: []
    }
  };

  constructor(testOptions: TestOptions) {
    this.options = testOptions.reporter || {
      formats: ['console', 'html', 'json'],
      outputDir: 'tests/test-hub/reports/generated',
      includeScreenshots: true,
      includeRequestLogs: true
    };
  }

  /**
   * Generate comprehensive test report
   */
  async generateReport(results: TestResult[]): Promise<TestReport> {
    const report = this.compileReport(results);
    
    // Ensure output directory exists
    await fs.mkdir(this.options.outputDir!, { recursive: true });

    // Generate reports in requested formats
    const formats = this.options.formats || ['console', 'html', 'json'];
    
    for (const format of formats) {
      try {
        await this.generateFormatReport(format, report);
      } catch (error) {
        logger.error(`Failed to generate ${format} report:`, error);
      }
    }

    // Send notifications if configured
    await this.sendNotifications(report);

    return report;
  }

  /**
   * Compile test results into a report
   */
  private compileReport(results: TestResult[]): TestReport {
    const summary = this.generateSummary(results);
    const metrics = this.calculatePerformanceMetrics(results);
    const security = this.compileSecurityAudit(results);
    const recommendations = this.generateRecommendations(results, metrics, security);

    return {
      summary,
      suites: results,
      metrics,
      security,
      recommendations,
      generatedAt: new Date()
    };
  }

  /**
   * Generate report summary
   */
  private generateSummary(results: TestResult[]): ReportSummary {
    let totalTests = 0;
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let totalDuration = 0;

    for (const suite of results) {
      totalTests += suite.tests.length;
      passed += suite.passed;
      failed += suite.failed;
      skipped += suite.skipped;
      totalDuration += suite.duration;
    }

    const passRate = totalTests > 0 
      ? ((passed / totalTests) * 100).toFixed(2)
      : '0.00';

    return {
      totalSuites: results.length,
      totalTests,
      passed,
      failed,
      skipped,
      duration: totalDuration,
      passRate,
      startTime: new Date(results[0]?.startTime || Date.now()),
      endTime: new Date(),
      environment: process.env.NODE_ENV || 'test'
    };
  }

  /**
   * Calculate performance metrics
   */
  private calculatePerformanceMetrics(results: TestResult[]): PerformanceMetrics {
    const responseTimes: number[] = [];
    const endpointMetrics = new Map<string, EndpointMetric>();
    let totalRequests = 0;
    let totalErrors = 0;

    // Extract performance data from test results
    for (const suite of results) {
      for (const test of suite.tests) {
        if (test.requests) {
          for (const request of test.requests) {
            totalRequests++;
            
            if (request.response) {
              responseTimes.push(request.response.duration);
              
              const key = `${request.method} ${request.url}`;
              const metric = endpointMetrics.get(key) || {
                endpoint: request.url,
                method: request.method,
                avgDuration: 0,
                callCount: 0,
                errorCount: 0
              };
              
              metric.callCount++;
              metric.avgDuration = ((metric.avgDuration * (metric.callCount - 1)) + request.response.duration) / metric.callCount;
              
              if (request.response.status >= 400) {
                metric.errorCount++;
                totalErrors++;
              }
              
              endpointMetrics.set(key, metric);
            } else if (request.error) {
              totalErrors++;
            }
          }
        }
      }
    }

    // Sort response times for percentile calculations
    responseTimes.sort((a, b) => a - b);

    // Calculate percentiles
    const p50 = this.percentile(responseTimes, 50);
    const p95 = this.percentile(responseTimes, 95);
    const p99 = this.percentile(responseTimes, 99);
    const avg = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    // Find slowest endpoints
    const slowestEndpoints = Array.from(endpointMetrics.values())
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);

    // Calculate requests per second
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0) / 1000; // Convert to seconds
    const requestsPerSecond = totalDuration > 0 ? totalRequests / totalDuration : 0;

    return {
      avgResponseTime: Math.round(avg),
      p50ResponseTime: Math.round(p50),
      p95ResponseTime: Math.round(p95),
      p99ResponseTime: Math.round(p99),
      slowestEndpoints,
      requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
      errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * values.length) - 1;
    return values[Math.max(0, Math.min(index, values.length - 1))] || 0;
  }

  /**
   * Compile security audit results
   */
  private compileSecurityAudit(results: TestResult[]): SecurityAudit {
    // This would be populated by security-specific tests
    // For now, returning the accumulated security findings
    
    // Calculate risk score based on vulnerabilities
    let riskScore = 0;
    for (const vuln of this.securityFindings.vulnerabilities) {
      switch (vuln.severity) {
        case 'critical': riskScore += 40; break;
        case 'high': riskScore += 25; break;
        case 'medium': riskScore += 15; break;
        case 'low': riskScore += 5; break;
      }
    }
    
    this.securityFindings.riskScore = Math.min(100, riskScore);
    
    return this.securityFindings;
  }

  /**
   * Generate recommendations based on test results
   */
  private generateRecommendations(
    results: TestResult[], 
    metrics: PerformanceMetrics,
    security: SecurityAudit
  ): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    if (metrics.avgResponseTime > 1000) {
      recommendations.push('Consider optimizing slow endpoints - average response time exceeds 1 second');
    }

    if (metrics.p95ResponseTime > 3000) {
      recommendations.push('95th percentile response time is high (>3s) - investigate performance bottlenecks');
    }

    if (metrics.errorRate > 5) {
      recommendations.push(`High error rate detected (${metrics.errorRate.toFixed(2)}%) - review error handling`);
    }

    // Security recommendations
    if (security.riskScore > 50) {
      recommendations.push('High security risk score - immediate attention required for critical vulnerabilities');
    }

    if (security.vulnerabilities.filter(v => v.severity === 'critical').length > 0) {
      recommendations.push('Critical security vulnerabilities found - patch immediately');
    }

    // Test coverage recommendations
    const failureRate = results.filter(r => r.status === 'failed').length / results.length;
    if (failureRate > 0.1) {
      recommendations.push('High test failure rate (>10%) - review test stability and application bugs');
    }

    // Add specific endpoint recommendations
    for (const endpoint of metrics.slowestEndpoints.slice(0, 3)) {
      if (endpoint.avgDuration > 2000) {
        recommendations.push(`Optimize ${endpoint.method} ${endpoint.endpoint} - avg response time: ${endpoint.avgDuration}ms`);
      }
    }

    return recommendations;
  }

  /**
   * Generate report in specific format
   */
  private async generateFormatReport(reportFormat: string, report: TestReport): Promise<void> {
    const timestamp = format(new Date(), 'yyyy-MM-dd-HHmmss');
    const baseFilename = `test-report-${timestamp}`;

    switch (reportFormat) {
      case 'console':
        this.generateConsoleReport(report);
        break;

      case 'html':
        const htmlPath = path.join(this.options.outputDir!, `${baseFilename}.html`);
        const htmlContent = await generateHTMLReport(report);
        await fs.writeFile(htmlPath, htmlContent);
        logger.info(`HTML report generated: ${htmlPath}`);
        break;

      case 'json':
        const jsonPath = path.join(this.options.outputDir!, `${baseFilename}.json`);
        await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
        logger.info(`JSON report generated: ${jsonPath}`);
        break;

      case 'junit':
        const junitPath = path.join(this.options.outputDir!, `${baseFilename}.xml`);
        const junitContent = this.generateJUnitReport(report);
        await fs.writeFile(junitPath, junitContent);
        logger.info(`JUnit report generated: ${junitPath}`);
        break;

      case 'pdf':
        const pdfPath = path.join(this.options.outputDir || './reports', `${baseFilename}.pdf`);
        await generatePDFReport(report, pdfPath);
        logger.info(`PDF report generated: ${pdfPath}`);
        break;
    }
  }

  /**
   * Generate console report
   */
  private generateConsoleReport(report: TestReport): void {
    console.log('\n' + chalk.bold.blue('═'.repeat(80)));
    console.log(chalk.bold.white(' TEST EXECUTION REPORT '));
    console.log(chalk.bold.blue('═'.repeat(80)) + '\n');

    // Summary
    const { summary } = report;
    console.log(chalk.bold('SUMMARY'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`Total Suites: ${summary.totalSuites}`);
    console.log(`Total Tests: ${summary.totalTests}`);
    console.log(`Passed: ${chalk.green(summary.passed)}`);
    console.log(`Failed: ${chalk.red(summary.failed)}`);
    console.log(`Skipped: ${chalk.yellow(summary.skipped)}`);
    console.log(`Pass Rate: ${summary.passRate}%`);
    console.log(`Duration: ${(summary.duration / 1000).toFixed(2)}s`);
    console.log();

    // Performance Metrics
    console.log(chalk.bold('PERFORMANCE METRICS'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(`Average Response Time: ${report.metrics.avgResponseTime}ms`);
    console.log(`P50 Response Time: ${report.metrics.p50ResponseTime}ms`);
    console.log(`P95 Response Time: ${report.metrics.p95ResponseTime}ms`);
    console.log(`P99 Response Time: ${report.metrics.p99ResponseTime}ms`);
    console.log(`Requests/Second: ${report.metrics.requestsPerSecond}`);
    console.log(`Error Rate: ${report.metrics.errorRate.toFixed(2)}%`);
    console.log();

    // Security Summary
    if (report.security.vulnerabilities.length > 0 || report.security.failedChecks.length > 0) {
      console.log(chalk.bold('SECURITY FINDINGS'));
      console.log(chalk.gray('─'.repeat(40)));
      console.log(`Risk Score: ${report.security.riskScore}/100`);
      console.log(`Vulnerabilities: ${report.security.vulnerabilities.length}`);
      
      const criticalCount = report.security.vulnerabilities.filter(v => v.severity === 'critical').length;
      const highCount = report.security.vulnerabilities.filter(v => v.severity === 'high').length;
      
      if (criticalCount > 0) {
        console.log(chalk.red(`  Critical: ${criticalCount}`));
      }
      if (highCount > 0) {
        console.log(chalk.yellow(`  High: ${highCount}`));
      }
      console.log();
    }

    // Failed Tests
    const failedSuites = report.suites.filter(s => s.status === 'failed');
    if (failedSuites.length > 0) {
      console.log(chalk.bold.red('FAILED TESTS'));
      console.log(chalk.gray('─'.repeat(40)));
      
      for (const suite of failedSuites) {
        console.log(chalk.red(`\n${suite.suite}:`));
        for (const test of suite.tests.filter(t => t.status === 'failed')) {
          console.log(chalk.red(`  ✗ ${test.name}`));
          if (test.error) {
            console.log(chalk.gray(`    ${test.error.message}`));
          }
        }
      }
      console.log();
    }

    // Recommendations
    if (report.recommendations.length > 0) {
      console.log(chalk.bold('RECOMMENDATIONS'));
      console.log(chalk.gray('─'.repeat(40)));
      report.recommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
      console.log();
    }

    console.log(chalk.bold.blue('═'.repeat(80)) + '\n');
  }

  /**
   * Generate JUnit XML report
   */
  private generateJUnitReport(report: TestReport): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<testsuites name="Test Hub" tests="${report.summary.totalTests}" failures="${report.summary.failed}" time="${report.summary.duration / 1000}">\n`;

    for (const suite of report.suites) {
      xml += `  <testsuite name="${suite.suite}" tests="${suite.tests.length}" failures="${suite.failed}" time="${suite.duration / 1000}">\n`;
      
      for (const test of suite.tests) {
        xml += `    <testcase name="${test.name}" classname="${suite.suite}" time="${test.duration / 1000}">\n`;
        
        if (test.status === 'failed' && test.error) {
          xml += `      <failure message="${this.escapeXml(test.error.message)}" type="AssertionError">\n`;
          xml += `        ${this.escapeXml(test.error.stack || test.error.message)}\n`;
          xml += `      </failure>\n`;
        } else if (test.status === 'skipped') {
          xml += `      <skipped/>\n`;
        }
        
        xml += `    </testcase>\n`;
      }
      
      xml += `  </testsuite>\n`;
    }

    xml += '</testsuites>';
    return xml;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Send notifications
   */
  private async sendNotifications(report: TestReport): Promise<void> {
    const hasFailures = report.summary.failed > 0;
    const hasCriticalSecurity = report.security.vulnerabilities.some(v => v.severity === 'critical');

    if (hasFailures || hasCriticalSecurity) {
      // Send Slack notification
      if (this.options.slackWebhook) {
        await sendSlackNotification(this.options.slackWebhook, report);
      }

      // Send email notifications
      if (this.options.emailOnFailure && this.options.emailOnFailure.length > 0) {
        await sendEmailNotification(this.options.emailOnFailure, report);
      }
    }
  }

  /**
   * Add security finding
   */
  addSecurityFinding(finding: any): void {
    if (finding.type === 'vulnerability') {
      this.securityFindings.vulnerabilities.push(finding);
    } else if (finding.type === 'passed') {
      this.securityFindings.passedChecks.push(finding.check);
    } else if (finding.type === 'failed') {
      this.securityFindings.failedChecks.push(finding.check);
    }
  }

  /**
   * Update performance data
   */
  updatePerformanceData(endpoint: string, method: string, duration: number, error?: boolean): void {
    const key = `${method} ${endpoint}`;
    const metric = this.performanceData.get(key) || {
      endpoint,
      method,
      avgDuration: 0,
      callCount: 0,
      errorCount: 0
    };

    metric.callCount++;
    metric.avgDuration = ((metric.avgDuration * (metric.callCount - 1)) + duration) / metric.callCount;
    
    if (error) {
      metric.errorCount++;
    }

    this.performanceData.set(key, metric);
  }
}