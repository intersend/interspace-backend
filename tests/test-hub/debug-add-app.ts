#!/usr/bin/env node

/**
 * Debug script to test adding apps to profiles
 * This helps diagnose iOS app integration issues
 */

import { config } from 'dotenv';
import path from 'path';
import axios from 'axios';
import chalk from 'chalk';

// Load test environment
config({ path: path.join(__dirname, '../../.env.test') });

const API_URL = process.env.TEST_API_URL || 'http://127.0.0.1:3000';
const TEST_EMAIL = 'ios-test@example.com';
const TEST_PASSWORD = 'TestPassword123!';

interface TestResult {
  step: string;
  success: boolean;
  data?: any;
  error?: any;
  duration?: number;
}

const results: TestResult[] = [];

async function log(message: string, data?: any) {
  console.log(chalk.blue(`\n${message}`));
  if (data) {
    console.log(chalk.gray(JSON.stringify(data, null, 2)));
  }
}

async function error(message: string, err?: any) {
  console.log(chalk.red(`\n❌ ${message}`));
  if (err?.response?.data) {
    console.log(chalk.red(JSON.stringify(err.response.data, null, 2)));
  } else if (err) {
    console.log(chalk.red(err.message));
  }
}

async function success(message: string) {
  console.log(chalk.green(`\n✅ ${message}`));
}

async function runTest(
  stepName: string, 
  testFn: () => Promise<any>
): Promise<any> {
  const start = Date.now();
  try {
    const result = await testFn();
    const duration = Date.now() - start;
    results.push({ step: stepName, success: true, data: result, duration });
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    results.push({ step: stepName, success: false, error: err, duration });
    throw err;
  }
}

async function main() {
  console.log(chalk.bold.cyan('\n🔍 iOS App Debug: Add App to Profile Test\n'));
  console.log(chalk.gray(`API URL: ${API_URL}`));
  console.log(chalk.gray(`Test Email: ${TEST_EMAIL}\n`));

  let accessToken: string;
  let userId: string;
  let profileId: string;
  let appId: string;

  try {
    // Step 1: Create test user
    await log('Step 1: Creating test user...');
    const userResponse = await runTest('Create User', async () => {
      // First try to authenticate in case user exists
      try {
        const authResponse = await axios.post(`${API_URL}/api/v1/auth/authenticate`, {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          type: 'email'
        });
        return authResponse.data;
      } catch (err) {
        // User doesn't exist, create it
        // Note: In real scenario, you'd have a user registration endpoint
        throw new Error('User registration endpoint needed');
      }
    }).catch(async () => {
      // For this test, we'll use a different approach
      // You might need to create the user manually or use existing test user
      log('Using alternative authentication method...');
      return null;
    });

    // Step 2: Authenticate using guest auth for simplicity
    await log('Step 2: Authenticating as guest user...');
    const authData = await runTest('Authenticate', async () => {
      const response = await axios.post(`${API_URL}/api/v1/auth/authenticate`, {
        authToken: `guest-test-${Date.now()}`,
        authStrategy: 'guest'
      });
      return response.data;
    });

    accessToken = authData.data.accessToken;
    userId = authData.data.user.id;
    await success('Authentication successful');
    await log('Access Token:', accessToken.substring(0, 20) + '...');

    // Create axios instance with auth
    const api = axios.create({
      baseURL: API_URL,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Step 3: Get or create a profile
    await log('Step 3: Getting user profiles...');
    const profilesData = await runTest('Get Profiles', async () => {
      const response = await api.get('/api/v1/profiles');
      return response.data;
    });

    if (profilesData.data.length === 0) {
      await log('No profiles found, creating one...');
      const createProfileData = await runTest('Create Profile', async () => {
        const response = await api.post('/api/v1/profiles', {
          name: 'iOS Test Profile',
          clientShare: {
            type: 'test',
            data: 'mock-client-share-for-testing'
          }
        });
        return response.data;
      });
      profileId = createProfileData.data.id;
    } else {
      profileId = profilesData.data[0].id;
      await log('Using existing profile:', profileId);
    }

    // Step 4: Test adding an app (THE MAIN TEST)
    await log('Step 4: Adding app to profile...');
    await log('Request payload:', {
      name: 'GitHub',
      url: 'https://github.com',
      iconUrl: 'https://github.com/favicon.ico'
    });

    const addAppData = await runTest('Add App to Profile', async () => {
      const response = await api.post(`/api/v1/profiles/${profileId}/apps`, {
        name: 'GitHub',
        url: 'https://github.com',
        iconUrl: 'https://github.com/favicon.ico'
      });
      return response.data;
    });

    appId = addAppData.data.id;
    await success('App added successfully!');
    await log('Created app:', addAppData.data);

    // Step 5: Verify app was added
    await log('Step 5: Verifying app was added...');
    const verifyData = await runTest('Verify App Exists', async () => {
      const response = await api.get(`/api/v1/profiles/${profileId}/apps`);
      return response.data;
    });

    const addedApp = verifyData.data.find((app: any) => app.id === appId);
    if (addedApp) {
      await success('App verified in profile!');
      await log('App details:', addedApp);
    } else {
      throw new Error('App not found in profile after creation');
    }

    // Step 6: Test edge cases
    await log('\nStep 6: Testing edge cases...');

    // Test 6.1: Add app without optional fields
    await log('Test 6.1: Adding app without icon URL...');
    await runTest('Add App Without Icon', async () => {
      const response = await api.post(`/api/v1/profiles/${profileId}/apps`, {
        name: 'Simple App',
        url: 'https://example.com'
      });
      return response.data;
    });
    await success('App added without icon URL');

    // Test 6.2: Add app with special characters
    await log('Test 6.2: Adding app with special characters...');
    await runTest('Add App With Special Chars', async () => {
      const response = await api.post(`/api/v1/profiles/${profileId}/apps`, {
        name: 'App with émoji 🚀',
        url: 'https://special-chars.com'
      });
      return response.data;
    });
    await success('App with special characters added');

    // Test 6.3: Test validation
    await log('Test 6.3: Testing validation (missing name)...');
    await runTest('Test Validation', async () => {
      try {
        await api.post(`/api/v1/profiles/${profileId}/apps`, {
          url: 'https://no-name.com'
        });
        throw new Error('Should have failed validation');
      } catch (err: any) {
        if (err.response?.status === 400) {
          await success('Validation working correctly');
          return { validation: 'working' };
        }
        throw err;
      }
    });

    // Summary
    console.log(chalk.bold.green('\n✅ All tests passed!\n'));
    console.log(chalk.cyan('Summary:'));
    results.forEach(result => {
      const status = result.success ? chalk.green('✓') : chalk.red('✗');
      const duration = result.duration ? chalk.gray(` (${result.duration}ms)`) : '';
      console.log(`  ${status} ${result.step}${duration}`);
    });

    // Provide debugging info for iOS
    console.log(chalk.bold.yellow('\n📱 iOS Integration Guide:\n'));
    console.log(chalk.white('AUTHENTICATION:'));
    console.log(chalk.gray('POST /api/v1/auth/authenticate'));
    console.log(chalk.gray('Body: { authToken: "guest-123", authStrategy: "guest" }'));
    console.log(chalk.gray('Response: { data: { accessToken, user } }'));
    
    console.log(chalk.white('\nCREATE PROFILE (if needed):'));
    console.log(chalk.gray('POST /api/v1/profiles'));
    console.log(chalk.gray('Headers: Authorization: Bearer {accessToken}'));
    console.log(chalk.gray('Body: { name: "Profile Name", clientShare: { type: "test", data: "mock-data" } }'));
    
    console.log(chalk.white('\nADD APP TO PROFILE:'));
    console.log(chalk.white('1. Endpoint: POST /api/v1/profiles/{profileId}/apps'));
    console.log(chalk.white('2. Headers:'));
    console.log(chalk.gray('   - Authorization: Bearer {accessToken}'));
    console.log(chalk.gray('   - Content-Type: application/json'));
    console.log(chalk.white('3. Request body:'));
    console.log(chalk.gray(JSON.stringify({
      name: 'App Name (required)',
      url: 'https://app.url (required)',
      iconUrl: 'https://icon.url (optional)',
      folderId: 'folder-id or null (optional)',
      position: 0 // optional
    }, null, 2)));
    console.log(chalk.white('\n4. Common issues:'));
    console.log(chalk.gray('   - Missing Authorization header'));
    console.log(chalk.gray('   - Invalid profile ID'));
    console.log(chalk.gray('   - Missing required fields (name, url)'));
    console.log(chalk.gray('   - Invalid URL format'));
    console.log(chalk.gray('   - Profile creation requires clientShare field'));

  } catch (err: any) {
    error('Test failed', err);
    
    // Provide debugging information
    if (err.response) {
      console.log(chalk.yellow('\n🔍 Debug Information:'));
      console.log(chalk.gray('Status:', err.response.status));
      console.log(chalk.gray('Status Text:', err.response.statusText));
      console.log(chalk.gray('Headers:', JSON.stringify(err.response.headers, null, 2)));
      console.log(chalk.gray('Data:', JSON.stringify(err.response.data, null, 2)));
    }

    // Failed tests summary
    const failedTests = results.filter(r => !r.success);
    if (failedTests.length > 0) {
      console.log(chalk.red('\n❌ Failed tests:'));
      failedTests.forEach(test => {
        console.log(chalk.red(`  - ${test.step}`));
        if (test.error?.response?.data) {
          console.log(chalk.gray(`    ${JSON.stringify(test.error.response.data)}`));
        }
      });
    }

    process.exit(1);
  }
}

// Run the test
main().catch(console.error);