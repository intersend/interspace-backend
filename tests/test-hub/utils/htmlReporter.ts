import { TestReport } from '../types';
import { format } from 'date-fns';

export async function generateHTMLReport(report: TestReport): Promise<string> {
  const { summary, metrics, security, recommendations } = report;
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Report - ${format(report.generatedAt, 'yyyy-MM-dd HH:mm:ss')}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 0;
            text-align: center;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        
        .subtitle {
            font-size: 1.2em;
            opacity: 0.9;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 30px 0;
        }
        
        .card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: transform 0.2s;
        }
        
        .card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        
        .card-title {
            font-size: 0.9em;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }
        
        .card-value {
            font-size: 2.5em;
            font-weight: bold;
            color: #333;
        }
        
        .card-subtitle {
            font-size: 0.9em;
            color: #888;
            margin-top: 5px;
        }
        
        .status-passed { color: #10b981; }
        .status-failed { color: #ef4444; }
        .status-skipped { color: #f59e0b; }
        
        .section {
            background: white;
            border-radius: 8px;
            padding: 30px;
            margin: 20px 0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .section-title {
            font-size: 1.8em;
            margin-bottom: 20px;
            color: #333;
            border-bottom: 2px solid #e5e5e5;
            padding-bottom: 10px;
        }
        
        .progress-bar {
            width: 100%;
            height: 30px;
            background: #e5e5e5;
            border-radius: 15px;
            overflow: hidden;
            margin: 20px 0;
        }
        
        .progress-fill {
            height: 100%;
            background: linear-gradient(to right, #10b981, #34d399);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            transition: width 0.5s ease;
        }
        
        .progress-fill.warning {
            background: linear-gradient(to right, #f59e0b, #fbbf24);
        }
        
        .progress-fill.danger {
            background: linear-gradient(to right, #ef4444, #f87171);
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        
        th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #e5e5e5;
        }
        
        th {
            background: #f9fafb;
            font-weight: 600;
            color: #374151;
        }
        
        tr:hover {
            background: #f9fafb;
        }
        
        .badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.85em;
            font-weight: 500;
        }
        
        .badge-success { background: #d1fae5; color: #065f46; }
        .badge-danger { background: #fee2e2; color: #991b1b; }
        .badge-warning { background: #fef3c7; color: #92400e; }
        .badge-info { background: #dbeafe; color: #1e40af; }
        
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin: 20px 0;
        }
        
        .metric-item {
            background: #f9fafb;
            padding: 15px;
            border-radius: 6px;
            border-left: 4px solid #667eea;
        }
        
        .metric-label {
            font-size: 0.9em;
            color: #666;
            margin-bottom: 5px;
        }
        
        .metric-value {
            font-size: 1.5em;
            font-weight: bold;
            color: #333;
        }
        
        .recommendations {
            background: #fef3c7;
            border: 1px solid #fbbf24;
            border-radius: 6px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .recommendations h3 {
            color: #92400e;
            margin-bottom: 15px;
        }
        
        .recommendations ul {
            list-style: none;
            padding-left: 0;
        }
        
        .recommendations li {
            padding: 8px 0;
            padding-left: 25px;
            position: relative;
        }
        
        .recommendations li:before {
            content: "⚠️";
            position: absolute;
            left: 0;
        }
        
        .suite-details {
            margin-top: 30px;
        }
        
        .suite-header {
            background: #f3f4f6;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 10px;
            cursor: pointer;
            transition: background 0.2s;
        }
        
        .suite-header:hover {
            background: #e5e7eb;
        }
        
        .suite-name {
            font-weight: bold;
            font-size: 1.1em;
        }
        
        .suite-stats {
            display: flex;
            gap: 20px;
            margin-top: 5px;
            font-size: 0.9em;
        }
        
        .test-list {
            padding-left: 20px;
            margin-top: 10px;
        }
        
        .test-item {
            padding: 8px 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .test-name {
            flex: 1;
        }
        
        .test-duration {
            color: #666;
            font-size: 0.9em;
            margin-left: 10px;
        }
        
        .chart-container {
            margin: 20px 0;
            height: 300px;
            position: relative;
        }
        
        @media (max-width: 768px) {
            .summary-grid {
                grid-template-columns: 1fr;
            }
            
            .metric-grid {
                grid-template-columns: 1fr;
            }
            
            table {
                font-size: 0.9em;
            }
        }
    </style>
</head>
<body>
    <header>
        <div class="container">
            <h1>API Test Report</h1>
            <div class="subtitle">Generated on ${format(report.generatedAt, 'PPP')}</div>
        </div>
    </header>
    
    <div class="container">
        <!-- Summary Cards -->
        <div class="summary-grid">
            <div class="card">
                <div class="card-title">Total Tests</div>
                <div class="card-value">${summary.totalTests}</div>
                <div class="card-subtitle">${summary.totalSuites} suites</div>
            </div>
            
            <div class="card">
                <div class="card-title">Passed</div>
                <div class="card-value status-passed">${summary.passed}</div>
                <div class="card-subtitle">${summary.passRate}% pass rate</div>
            </div>
            
            <div class="card">
                <div class="card-title">Failed</div>
                <div class="card-value status-failed">${summary.failed}</div>
                <div class="card-subtitle">${((summary.failed / summary.totalTests) * 100).toFixed(1)}% failure rate</div>
            </div>
            
            <div class="card">
                <div class="card-title">Duration</div>
                <div class="card-value">${(summary.duration / 1000).toFixed(1)}s</div>
                <div class="card-subtitle">${Math.round(summary.duration / summary.totalTests)}ms avg/test</div>
            </div>
        </div>
        
        <!-- Progress Bar -->
        <div class="progress-bar">
            <div class="progress-fill ${getProgressClass(parseFloat(summary.passRate))}" style="width: ${summary.passRate}%">
                ${summary.passRate}% Pass Rate
            </div>
        </div>
        
        <!-- Performance Metrics -->
        <div class="section">
            <h2 class="section-title">Performance Metrics</h2>
            
            <div class="metric-grid">
                <div class="metric-item">
                    <div class="metric-label">Avg Response Time</div>
                    <div class="metric-value">${metrics.avgResponseTime}ms</div>
                </div>
                
                <div class="metric-item">
                    <div class="metric-label">P50 Response Time</div>
                    <div class="metric-value">${metrics.p50ResponseTime}ms</div>
                </div>
                
                <div class="metric-item">
                    <div class="metric-label">P95 Response Time</div>
                    <div class="metric-value">${metrics.p95ResponseTime}ms</div>
                </div>
                
                <div class="metric-item">
                    <div class="metric-label">P99 Response Time</div>
                    <div class="metric-value">${metrics.p99ResponseTime}ms</div>
                </div>
                
                <div class="metric-item">
                    <div class="metric-label">Requests/Second</div>
                    <div class="metric-value">${metrics.requestsPerSecond}</div>
                </div>
                
                <div class="metric-item">
                    <div class="metric-label">Error Rate</div>
                    <div class="metric-value">${metrics.errorRate.toFixed(2)}%</div>
                </div>
            </div>
            
            ${metrics.slowestEndpoints.length > 0 ? `
            <h3 style="margin-top: 30px; margin-bottom: 15px;">Slowest Endpoints</h3>
            <table>
                <thead>
                    <tr>
                        <th>Endpoint</th>
                        <th>Method</th>
                        <th>Avg Duration</th>
                        <th>Calls</th>
                        <th>Errors</th>
                    </tr>
                </thead>
                <tbody>
                    ${metrics.slowestEndpoints.map(endpoint => `
                    <tr>
                        <td>${endpoint.endpoint}</td>
                        <td><span class="badge badge-info">${endpoint.method}</span></td>
                        <td>${endpoint.avgDuration.toFixed(0)}ms</td>
                        <td>${endpoint.callCount}</td>
                        <td>${endpoint.errorCount > 0 ? `<span class="status-failed">${endpoint.errorCount}</span>` : '0'}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : ''}
        </div>
        
        <!-- Security Audit -->
        ${(security.vulnerabilities.length > 0 || security.failedChecks.length > 0) ? `
        <div class="section">
            <h2 class="section-title">Security Audit</h2>
            
            <div class="metric-grid">
                <div class="metric-item">
                    <div class="metric-label">Risk Score</div>
                    <div class="metric-value" style="color: ${getRiskColor(security.riskScore)}">${security.riskScore}/100</div>
                </div>
                
                <div class="metric-item">
                    <div class="metric-label">Vulnerabilities</div>
                    <div class="metric-value">${security.vulnerabilities.length}</div>
                </div>
                
                <div class="metric-item">
                    <div class="metric-label">Passed Checks</div>
                    <div class="metric-value status-passed">${security.passedChecks.length}</div>
                </div>
                
                <div class="metric-item">
                    <div class="metric-label">Failed Checks</div>
                    <div class="metric-value status-failed">${security.failedChecks.length}</div>
                </div>
            </div>
            
            ${security.vulnerabilities.length > 0 ? `
            <h3 style="margin-top: 30px; margin-bottom: 15px;">Vulnerabilities Found</h3>
            <table>
                <thead>
                    <tr>
                        <th>Severity</th>
                        <th>Type</th>
                        <th>Description</th>
                        <th>Recommendation</th>
                    </tr>
                </thead>
                <tbody>
                    ${security.vulnerabilities.map(vuln => `
                    <tr>
                        <td><span class="badge badge-${getSeverityClass(vuln.severity)}">${vuln.severity.toUpperCase()}</span></td>
                        <td>${vuln.type}</td>
                        <td>${vuln.description}</td>
                        <td>${vuln.recommendation}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : ''}
        </div>
        ` : ''}
        
        <!-- Recommendations -->
        ${recommendations.length > 0 ? `
        <div class="recommendations">
            <h3>📋 Recommendations</h3>
            <ul>
                ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
        ` : ''}
        
        <!-- Suite Details -->
        <div class="section">
            <h2 class="section-title">Test Suite Details</h2>
            
            <div class="suite-details">
                ${report.suites.map(suite => `
                <div class="suite-header">
                    <div class="suite-name">${suite.suite}</div>
                    <div class="suite-stats">
                        <span class="status-passed">✓ ${suite.passed} passed</span>
                        <span class="status-failed">✗ ${suite.failed} failed</span>
                        <span class="status-skipped">⊘ ${suite.skipped} skipped</span>
                        <span>⏱ ${(suite.duration / 1000).toFixed(2)}s</span>
                    </div>
                    
                    ${suite.failed > 0 ? `
                    <div class="test-list">
                        ${suite.tests.filter(t => t.status === 'failed').map(test => `
                        <div class="test-item">
                            <span class="test-name status-failed">✗ ${test.name}</span>
                            <span class="test-duration">${test.duration}ms</span>
                        </div>
                        ${test.error ? `<div style="padding-left: 20px; color: #666; font-size: 0.9em; font-family: monospace;">${test.error.message}</div>` : ''}
                        `).join('')}
                    </div>
                    ` : ''}
                </div>
                `).join('')}
            </div>
        </div>
    </div>
    
    <script>
        // Add interactivity
        document.querySelectorAll('.suite-header').forEach(header => {
            header.addEventListener('click', () => {
                const testList = header.querySelector('.test-list');
                if (testList) {
                    testList.style.display = testList.style.display === 'none' ? 'block' : 'none';
                }
            });
        });
    </script>
</body>
</html>
  `;
  
  return html;
}

function getProgressClass(passRate: number): string {
  if (passRate >= 90) return '';
  if (passRate >= 70) return 'warning';
  return 'danger';
}

function getRiskColor(score: number): string {
  if (score <= 25) return '#10b981';
  if (score <= 50) return '#f59e0b';
  if (score <= 75) return '#ef4444';
  return '#991b1b';
}

function getSeverityClass(severity: string): string {
  switch (severity) {
    case 'critical': return 'danger';
    case 'high': return 'warning';
    case 'medium': return 'info';
    case 'low': return 'success';
    default: return 'info';
  }
}