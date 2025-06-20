#!/usr/bin/env node

// Load environment variables first
import { config } from 'dotenv';
import path from 'path';
config({ path: path.join(__dirname, '../../.env.test') });

// Set NODE_ENV
process.env.NODE_ENV = 'test';

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { TestRunner } from './core/TestRunner';
import { TestOptions, TestMode } from './types';
import { logger } from './utils/logger';
import { authenticationSuite } from './suites/auth/authenticationSuite';
import { authenticationV2Suite } from './suites/auth/authenticationV2Suite';
import { securitySuite } from './suites/security/securitySuite';
import { flatIdentitySecuritySuite } from './suites/security/flatIdentitySecuritySuite';
import { appManagementSuite } from './suites/apps/appManagementSuite';
import { accountLinkingSuite } from './suites/identity/accountLinkingSuite';
import { profileManagementV2Suite } from './suites/profiles/profileManagementV2Suite';
import { sessionManagementSuite } from './suites/sessions/sessionManagementSuite';
// Import other suites as they are created
// import { userSuite } from './suites/users/userSuite';
// import { migrationSuite } from './suites/migration/v1ToV2Suite';

const program = new Command();

program
  .name('test-hub')
  .description('Military-grade API testing hub for comprehensive endpoint validation')
  .version('1.0.0');

program
  .option('-m, --mode <mode>', 'Test execution mode (quick, standard, comprehensive)', 'standard')
  .option('-s, --suites <suites...>', 'Specific test suites to run')
  .option('-t, --tags <tags...>', 'Run tests with specific tags')
  .option('-e, --endpoints <endpoints...>', 'Test specific endpoint patterns')
  .option('-p, --priority <priority>', 'Minimum priority level (critical, high, medium, low)')
  .option('--parallel', 'Run tests in parallel (default)', true)
  .option('--sequential', 'Run tests sequentially')
  .option('--bail', 'Stop on first test failure')
  .option('--timeout <ms>', 'Test timeout in milliseconds', '30000')
  .option('--retries <count>', 'Number of retries for failed tests', '0')
  .option('--max-concurrency <count>', 'Maximum parallel test execution', '5')
  .option('--reporter <formats...>', 'Report formats (console, html, json, junit, pdf)', ['console', 'html', 'json'])
  .option('--output-dir <path>', 'Report output directory', 'tests/test-hub/reports/generated')
  .option('--verbose', 'Verbose logging')
  .option('--dry-run', 'Show what would be executed without running tests')
  .option('--no-colors', 'Disable colored output')
  .option('--slack-webhook <url>', 'Slack webhook for notifications')
  .option('--email <addresses...>', 'Email addresses for failure notifications');

program
  .command('list')
  .description('List available test suites and tags')
  .action(listSuites);

program
  .command('run')
  .description('Run test suites (default command)')
  .action(() => runTests(program.opts()));

// Default action
program.action(() => runTests(program.opts()));

async function runTests(options: any) {
  console.log(chalk.bold.blue('\n🚀 Interspace API Test Hub\n'));

  // Configure logger
  if (options.verbose) {
    logger.level = 'debug';
  }

  // Build test options
  const testOptions: TestOptions = {
    mode: options.mode as TestMode,
    parallel: !options.sequential,
    maxConcurrency: parseInt(options.maxConcurrency),
    bail: options.bail,
    timeout: parseInt(options.timeout),
    retries: parseInt(options.retries),
    suites: options.suites,
    tags: options.tags,
    endpoints: options.endpoints,
    priority: options.priority,
    verbose: options.verbose,
    dryRun: options.dryRun,
    reporter: {
      formats: options.reporter,
      outputDir: options.outputDir,
      includeScreenshots: true,
      includeRequestLogs: true,
      slackWebhook: options.slackWebhook,
      emailOnFailure: options.email
    }
  };

  // Apply mode presets
  applyModePresets(testOptions);

  if (options.dryRun) {
    console.log(chalk.yellow('DRY RUN MODE - No tests will be executed\n'));
    console.log('Test configuration:');
    console.log(JSON.stringify(testOptions, null, 2));
    return;
  }

  // Create test runner
  const runner = new TestRunner(testOptions);

  // Register all test suites
  registerSuites(runner, testOptions);

  // Setup event listeners
  setupEventListeners(runner);

  // Run tests
  try {
    const spinner = ora('Initializing test environment...').start();
    
    // Add slight delay for spinner visibility
    await new Promise(resolve => setTimeout(resolve, 500));
    spinner.stop();

    const results = await runner.run();
    
    // Display summary
    displaySummary(runner);
    
    // Exit with appropriate code
    const failureCount = results.reduce((sum, r) => sum + r.failed, 0);
    process.exit(failureCount > 0 ? 1 : 0);

  } catch (error) {
    console.error(chalk.red('\n❌ Test execution failed:'), error);
    process.exit(1);
  }
}

function registerSuites(runner: TestRunner, options: TestOptions) {
  // Register all available suites
  const allSuites = [
    // V1 Suites
    authenticationSuite,
    securitySuite,
    appManagementSuite,
    // V2 Flat Identity Suites
    authenticationV2Suite,
    accountLinkingSuite,
    profileManagementV2Suite,
    sessionManagementSuite,
    flatIdentitySecuritySuite,
    // Future suites
    // userSuite,
    // migrationSuite,
    // performanceSuite
  ];

  // Filter suites based on mode
  let suitesToRegister = allSuites;

  if (options.mode === 'quick') {
    // Quick mode: Only critical tests
    suitesToRegister = allSuites.filter(s => 
      s.priority === 'critical' || s.tags.includes('smoke')
    );
  } else if (options.mode === 'comprehensive') {
    // Comprehensive mode: All tests including performance and security
    suitesToRegister = allSuites;
  }

  // Register filtered suites
  for (const suite of suitesToRegister) {
    runner.addSuite(suite);
  }

  console.log(chalk.gray(`Registered ${suitesToRegister.length} test suites\n`));
}

function applyModePresets(options: TestOptions) {
  switch (options.mode) {
    case 'quick':
      options.timeout = options.timeout || 10000;
      options.parallel = true;
      options.maxConcurrency = 10;
      if (!options.tags) {
        options.tags = ['smoke', 'critical'];
      }
      break;
      
    case 'comprehensive':
      options.timeout = options.timeout || 60000;
      options.retries = options.retries || 1;
      break;
      
    case 'standard':
    default:
      // Use default options
      break;
  }
}

function setupEventListeners(runner: TestRunner) {
  runner.on('suite:start', (suite) => {
    logger.debug(`Starting suite: ${suite.name}`);
  });

  runner.on('suite:complete', (result) => {
    if (result.status === 'failed') {
      logger.warn(`Suite failed: ${result.suite}`);
    }
  });

  runner.on('test:complete', ({ test, result }) => {
    if (result.status === 'failed') {
      logger.error(`Test failed: ${test.name}`, result.error);
    }
  });
}

function displaySummary(runner: TestRunner) {
  const stats = runner.getStats();
  
  console.log('\n' + chalk.bold('Test Summary'));
  console.log(chalk.gray('─'.repeat(50)));
  
  console.log(`Suites:  ${chalk.green(stats.suites.passed)} passed, ${chalk.red(stats.suites.failed)} failed, ${stats.suites.total} total`);
  console.log(`Tests:   ${chalk.green(stats.tests.passed)} passed, ${chalk.red(stats.tests.failed)} failed, ${chalk.yellow(stats.tests.skipped)} skipped, ${stats.tests.total} total`);
  console.log(`Time:    ${(stats.duration / 1000).toFixed(2)}s`);
  console.log(`Pass Rate: ${stats.passRate}%`);
  
  if (stats.tests.failed > 0) {
    console.log('\n' + chalk.red('✗ Some tests failed. Check the reports for details.'));
  } else {
    console.log('\n' + chalk.green('✓ All tests passed!'));
  }
}

function listSuites() {
  console.log(chalk.bold('\nAvailable Test Suites:\n'));
  
  const suites = [
    { name: 'Authentication', tags: ['auth', 'critical', 'security'], endpoints: '/api/v1/auth/*' },
    { name: 'Users', tags: ['users', 'critical'], endpoints: '/api/v1/users/*' },
    { name: 'SmartProfiles', tags: ['profiles', 'critical'], endpoints: '/api/v1/profiles/*' },
    { name: 'MPC', tags: ['mpc', 'high', 'security'], endpoints: '/api/v1/mpc/*' },
    { name: 'Security', tags: ['security', 'critical'], endpoints: '*' },
    { name: 'Performance', tags: ['performance', 'load'], endpoints: '*' }
  ];
  
  for (const suite of suites) {
    console.log(chalk.cyan(suite.name));
    console.log(`  Tags: ${suite.tags.join(', ')}`);
    console.log(`  Endpoints: ${suite.endpoints}`);
    console.log();
  }
  
  console.log(chalk.bold('\nAvailable Tags:\n'));
  console.log('  critical   - Must-pass tests for core functionality');
  console.log('  high       - Important tests for major features');
  console.log('  medium     - Standard feature tests');
  console.log('  low        - Nice-to-have tests');
  console.log('  security   - Security-focused tests');
  console.log('  performance - Performance and load tests');
  console.log('  smoke      - Quick smoke tests');
  console.log('  integration - Integration tests');
  console.log('  regression - Regression tests');
  
  console.log(chalk.bold('\n\nExecution Modes:\n'));
  console.log('  quick        - Critical tests only (~2 minutes)');
  console.log('  standard     - Full test suite (~15 minutes)');
  console.log('  comprehensive - All tests including performance (~45 minutes)');
  
  console.log(chalk.bold('\n\nExample Commands:\n'));
  console.log('  test-hub --mode quick                    # Run critical tests only');
  console.log('  test-hub --suites Authentication Users   # Run specific suites');
  console.log('  test-hub --tags security critical        # Run security and critical tests');
  console.log('  test-hub --endpoints "/api/v1/auth/*"    # Test auth endpoints');
  console.log('  test-hub --sequential --bail             # Run sequentially, stop on failure');
}

// Parse command line arguments
program.parse(process.argv);

// Handle no command specified
if (!process.argv.slice(2).length) {
  program.outputHelp();
}