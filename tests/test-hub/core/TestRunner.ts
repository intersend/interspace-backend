import { EventEmitter } from 'events';
import chalk from 'chalk';
import ora from 'ora';
import pLimit from 'p-limit';
import { TestSuite, TestResult, TestOptions, TestStatus } from '../types';
import { TestContext } from './TestContext';
import { TestReporter } from './TestReporter';
import { logger } from '../utils/logger';
import { performance } from 'perf_hooks';

export class TestRunner extends EventEmitter {
  private suites: Map<string, TestSuite> = new Map();
  private context: TestContext;
  private reporter: TestReporter;
  private options: TestOptions;
  private results: TestResult[] = [];
  private startTime: number = 0;

  constructor(options: TestOptions = {}) {
    super();
    this.options = {
      parallel: true,
      maxConcurrency: 5,
      bail: false,
      timeout: 30000,
      retries: 0,
      ...options
    };
    this.context = new TestContext();
    this.reporter = new TestReporter(this.options);
  }

  /**
   * Register a test suite
   */
  addSuite(suite: TestSuite): void {
    if (this.suites.has(suite.name)) {
      throw new Error(`Suite ${suite.name} already registered`);
    }
    this.suites.set(suite.name, suite);
    logger.debug(`Registered suite: ${suite.name}`);
  }

  /**
   * Run pre-flight checks
   */
  private async runPreflightChecks(): Promise<void> {
    const spinner = ora('Running pre-flight checks...').start();
    
    try {
      // Check database connection
      await this.context.checkDatabaseConnection();
      
      // Check Redis connection if enabled
      if (process.env.REDIS_HOST) {
        await this.context.checkRedisConnection();
      }
      
      // Check external services
      await this.context.checkExternalServices();
      
      // Initialize test data
      await this.context.initializeTestData();
      
      spinner.succeed('Pre-flight checks passed');
    } catch (error) {
      spinner.fail('Pre-flight checks failed');
      throw error;
    }
  }

  /**
   * Execute test suites based on filters
   */
  async run(): Promise<TestResult[]> {
    this.startTime = performance.now();
    this.emit('start', { suites: Array.from(this.suites.values()) });

    try {
      // Run pre-flight checks
      await this.runPreflightChecks();

      // Filter suites based on options
      const suitesToRun = this.filterSuites();
      
      if (suitesToRun.length === 0) {
        console.log(chalk.yellow('No test suites match the filter criteria'));
        return [];
      }

      console.log(chalk.blue(`\nRunning ${suitesToRun.length} test suites...\n`));

      // Execute suites
      if (this.options.parallel) {
        await this.runParallel(suitesToRun);
      } else {
        await this.runSequential(suitesToRun);
      }

      // Generate report
      await this.reporter.generateReport(this.results);

      // Emit completion
      const duration = performance.now() - this.startTime;
      this.emit('complete', { results: this.results, duration });

      return this.results;

    } catch (error) {
      this.emit('error', error);
      throw error;
    } finally {
      // Cleanup
      await this.cleanup();
    }
  }

  /**
   * Filter suites based on options
   */
  private filterSuites(): TestSuite[] {
    let suites = Array.from(this.suites.values());

    // Filter by suite names
    if (this.options.suites && this.options.suites.length > 0) {
      suites = suites.filter(s => this.options.suites!.includes(s.name));
    }

    // Filter by tags
    if (this.options.tags && this.options.tags.length > 0) {
      suites = suites.filter(s => 
        s.tags.some(tag => this.options.tags!.includes(tag))
      );
    }

    // Filter by priority
    if (this.options.priority) {
      const priorityOrder = ['critical', 'high', 'medium', 'low'];
      const minPriority = priorityOrder.indexOf(this.options.priority);
      suites = suites.filter(s => 
        priorityOrder.indexOf(s.priority) <= minPriority
      );
    }

    // Filter by endpoints
    if (this.options.endpoints && this.options.endpoints.length > 0) {
      suites = suites.filter(s => 
        this.options.endpoints!.some(pattern => 
          s.endpoints?.some(endpoint => 
            new RegExp(pattern.replace('*', '.*')).test(endpoint)
          )
        )
      );
    }

    return suites;
  }

  /**
   * Run suites in parallel
   */
  private async runParallel(suites: TestSuite[]): Promise<void> {
    const limit = pLimit(this.options.maxConcurrency!);
    
    const tasks = suites.map(suite => 
      limit(() => this.runSuite(suite))
    );

    await Promise.all(tasks);
  }

  /**
   * Run suites sequentially
   */
  private async runSequential(suites: TestSuite[]): Promise<void> {
    for (const suite of suites) {
      const shouldContinue = await this.runSuite(suite);
      
      if (!shouldContinue && this.options.bail) {
        console.log(chalk.red('\nBailing out due to test failure'));
        break;
      }
    }
  }

  /**
   * Run a single test suite
   */
  private async runSuite(suite: TestSuite): Promise<boolean> {
    const suiteResult: TestResult = {
      suite: suite.name,
      status: 'running',
      tests: [],
      startTime: Date.now(),
      duration: 0,
      passed: 0,
      failed: 0,
      skipped: 0
    };

    this.emit('suite:start', suite);
    console.log(chalk.cyan(`\nRunning suite: ${suite.name}`));

    try {
      // Setup suite
      if (suite.setup) {
        await suite.setup(this.context);
      }

      // Run tests
      for (const test of suite.tests) {
        if (test.skip) {
          suiteResult.tests.push({
            name: test.name,
            status: 'skipped',
            duration: 0
          });
          suiteResult.skipped++;
          continue;
        }

        const testResult = await this.runTest(test, suite);
        suiteResult.tests.push(testResult);

        if (testResult.status === 'passed') {
          suiteResult.passed++;
        } else {
          suiteResult.failed++;
          
          if (this.options.bail) {
            break;
          }
        }
      }

      // Teardown suite
      if (suite.teardown) {
        await suite.teardown(this.context);
      }

      // Calculate final status
      suiteResult.status = suiteResult.failed > 0 ? 'failed' : 'passed';
      suiteResult.duration = Date.now() - suiteResult.startTime;
      
      this.results.push(suiteResult);
      this.emit('suite:complete', suiteResult);

      // Log suite results
      const statusIcon = suiteResult.status === 'passed' ? '✓' : '✗';
      const statusColor = suiteResult.status === 'passed' ? chalk.green : chalk.red;
      console.log(
        statusColor(`${statusIcon} ${suite.name}: ${suiteResult.passed}/${suite.tests.length} passed (${suiteResult.duration}ms)`)
      );

      return suiteResult.status === 'passed';

    } catch (error) {
      suiteResult.status = 'failed';
      suiteResult.error = error as Error;
      suiteResult.duration = Date.now() - suiteResult.startTime;
      
      this.results.push(suiteResult);
      this.emit('suite:error', { suite, error });
      
      console.log(chalk.red(`✗ ${suite.name}: Suite error - ${(error as Error).message}`));
      return false;
    }
  }

  /**
   * Run a single test
   */
  private async runTest(test: any, suite: TestSuite): Promise<any> {
    const testResult = {
      name: test.name,
      status: 'running' as TestStatus,
      duration: 0,
      retries: 0,
      error: undefined as Error | undefined
    };

    const startTime = performance.now();
    let attempts = 0;
    const maxAttempts = (test.retries ?? this.options.retries ?? 0) + 1;

    while (attempts < maxAttempts) {
      try {
        attempts++;
        
        // Create test-specific context
        const testContext = this.context.createTestContext(suite.name, test.name);
        
        // Run test with timeout
        await this.runWithTimeout(
          test.fn(testContext),
          test.timeout || this.options.timeout!
        );

        testResult.status = 'passed';
        testResult.duration = performance.now() - startTime;
        
        // Log success
        console.log(chalk.green(`  ✓ ${test.name} (${Math.round(testResult.duration)}ms)`));
        
        break;

      } catch (error) {
        testResult.error = error as Error;
        testResult.retries = attempts - 1;

        if (attempts >= maxAttempts) {
          testResult.status = 'failed';
          testResult.duration = performance.now() - startTime;
          
          // Log failure
          console.log(chalk.red(`  ✗ ${test.name} (${Math.round(testResult.duration)}ms)`));
          console.log(chalk.gray(`    ${(error as Error).message}`));
          
          break;
        } else {
          // Log retry
          console.log(chalk.yellow(`  ⟲ ${test.name} - Retry ${attempts}/${maxAttempts - 1}`));
        }
      }
    }

    this.emit('test:complete', { suite, test, result: testResult });
    return testResult;
  }

  /**
   * Run function with timeout
   */
  private async runWithTimeout(fn: Promise<any>, timeout: number): Promise<any> {
    return Promise.race([
      fn,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout)
      )
    ]);
  }

  /**
   * Cleanup after test run
   */
  private async cleanup(): Promise<void> {
    try {
      await this.context.cleanup();
      logger.debug('Test cleanup completed');
    } catch (error) {
      logger.error('Cleanup error:', error);
    }
  }

  /**
   * Get test statistics
   */
  getStats() {
    const totalTests = this.results.reduce((sum, r) => sum + r.tests.length, 0);
    const passedTests = this.results.reduce((sum, r) => sum + r.passed, 0);
    const failedTests = this.results.reduce((sum, r) => sum + r.failed, 0);
    const skippedTests = this.results.reduce((sum, r) => sum + r.skipped, 0);
    const duration = performance.now() - this.startTime;

    return {
      suites: {
        total: this.results.length,
        passed: this.results.filter(r => r.status === 'passed').length,
        failed: this.results.filter(r => r.status === 'failed').length
      },
      tests: {
        total: totalTests,
        passed: passedTests,
        failed: failedTests,
        skipped: skippedTests
      },
      duration: Math.round(duration),
      passRate: totalTests > 0 ? (passedTests / totalTests * 100).toFixed(2) : '0.00'
    };
  }
}