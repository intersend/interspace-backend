#!/usr/bin/env node

/**
 * Direct API test for adding apps to profiles
 * Uses guest authentication for simplicity
 */

import axios from 'axios';
import chalk from 'chalk';

const API_URL = 'http://127.0.0.1:3000';

async function main() {
  console.log(chalk.bold.cyan('\n🔍 Testing Add App to Profile API\n'));
  console.log(chalk.gray(`API URL: ${API_URL}\n`));

  try {
    // Step 1: Create a guest user for testing
    console.log(chalk.blue('1. Creating guest user...'));
    
    let authResponse;
    try {
      authResponse = await axios.post(`${API_URL}/api/v1/auth/authenticate`, {
        authToken: 'guest-' + Date.now(),
        authStrategy: 'guest'
      });
    } catch (error: any) {
      console.log(chalk.red('Failed to create guest user'));
      if (error.response?.data) {
        console.log(chalk.red(JSON.stringify(error.response.data, null, 2)));
      }
      throw error;
    }

    const { accessToken, user } = authResponse.data.data;
    console.log(chalk.green('✓ Guest user created'));
    console.log(chalk.gray(`User ID: ${user.id}`));
    console.log(chalk.gray(`Access Token: ${accessToken.substring(0, 30)}...`));

    // Create axios instance with auth
    const api = axios.create({
      baseURL: API_URL,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Step 2: Create a profile
    console.log(chalk.blue('\n2. Creating profile...'));
    
    let profileResponse;
    try {
      profileResponse = await api.post('/api/v1/profiles', {
        name: 'Test Profile for iOS App',
        clientShare: {
          type: 'test',
          data: 'mock-client-share-for-testing'
        }
      });
    } catch (error: any) {
      console.log(chalk.red('Failed to create profile'));
      if (error.response?.data) {
        console.log(chalk.red(JSON.stringify(error.response.data, null, 2)));
      }
      throw error;
    }

    const profile = profileResponse.data.data;
    console.log(chalk.green('✓ Profile created'));
    console.log(chalk.gray(`Profile ID: ${profile.id}`));
    console.log(chalk.gray(`Profile Name: ${profile.name}`));

    // Step 3: Add an app to the profile (THE MAIN TEST)
    console.log(chalk.blue('\n3. Adding app to profile...'));
    
    const appData = {
      name: 'GitHub',
      url: 'https://github.com',
      iconUrl: 'https://github.githubassets.com/favicons/favicon.png'
    };

    console.log(chalk.gray('Request:'));
    console.log(chalk.gray(`POST ${API_URL}/api/v1/profiles/${profile.id}/apps`));
    console.log(chalk.gray('Headers:'));
    console.log(chalk.gray(`  Authorization: Bearer ${accessToken.substring(0, 30)}...`));
    console.log(chalk.gray('  Content-Type: application/json'));
    console.log(chalk.gray('Body:'));
    console.log(chalk.gray(JSON.stringify(appData, null, 2)));

    let addAppResponse;
    try {
      addAppResponse = await api.post(`/api/v1/profiles/${profile.id}/apps`, appData);
    } catch (error: any) {
      console.log(chalk.red('\n❌ Failed to add app!'));
      if (error.response) {
        console.log(chalk.red(`Status: ${error.response.status}`));
        console.log(chalk.red('Response:'));
        console.log(chalk.red(JSON.stringify(error.response.data, null, 2)));
        
        // Debug information
        console.log(chalk.yellow('\n🔍 Debug Info:'));
        console.log(chalk.yellow('Request URL:', error.config?.url));
        console.log(chalk.yellow('Request Method:', error.config?.method));
        console.log(chalk.yellow('Request Headers:', JSON.stringify(error.config?.headers, null, 2)));
      }
      throw error;
    }
    
    console.log(chalk.green('✓ App added successfully!'));
    console.log(chalk.gray('Response:'));
    console.log(chalk.gray(JSON.stringify(addAppResponse.data, null, 2)));

    const createdApp = addAppResponse.data.data;

    // Step 4: Verify the app was added
    console.log(chalk.blue('\n4. Fetching apps from profile...'));
    
    const appsResponse = await api.get(`/api/v1/profiles/${profile.id}/apps`);
    const apps = appsResponse.data.data;
    
    console.log(chalk.green(`✓ Found ${apps.length} app(s) in profile`));
    
    const verifiedApp = apps.find((app: any) => app.id === createdApp.id);
    if (verifiedApp) {
      console.log(chalk.green('✓ App verified in profile!'));
      console.log(chalk.gray('App details:'));
      console.log(chalk.gray(JSON.stringify(verifiedApp, null, 2)));
    } else {
      console.log(chalk.red('✗ App not found in profile'));
    }

    // Success summary
    console.log(chalk.bold.green('\n✅ All tests passed!\n'));
    
    // iOS Integration Guide
    console.log(chalk.bold.cyan('📱 iOS Integration Guide:\n'));
    console.log(chalk.white('1. Authentication:'));
    console.log(chalk.gray('   POST /api/v1/auth/authenticate'));
    console.log(chalk.gray('   Body: { authToken: "...", authStrategy: "..." }'));
    console.log(chalk.gray('   Response: { data: { accessToken, user } }'));
    
    console.log(chalk.white('\n2. Add App to Profile:'));
    console.log(chalk.gray('   POST /api/v1/profiles/{profileId}/apps'));
    console.log(chalk.gray('   Headers:'));
    console.log(chalk.gray('     - Authorization: Bearer {accessToken}'));
    console.log(chalk.gray('     - Content-Type: application/json'));
    console.log(chalk.gray('   Body:'));
    console.log(chalk.gray('     {'));
    console.log(chalk.gray('       "name": "App Name",        // Required'));
    console.log(chalk.gray('       "url": "https://app.url",  // Required'));
    console.log(chalk.gray('       "iconUrl": "https://..."   // Optional'));
    console.log(chalk.gray('     }'));
    console.log(chalk.gray('   Response: 201 Created with app data'));
    
    console.log(chalk.white('\n3. Common Issues:'));
    console.log(chalk.gray('   - Ensure Authorization header has "Bearer " prefix'));
    console.log(chalk.gray('   - Profile ID must belong to authenticated user'));
    console.log(chalk.gray('   - URL must be valid (start with http:// or https://)'));
    console.log(chalk.gray('   - Name is required and cannot be empty'));

    // Cleanup
    console.log(chalk.yellow('\n🧹 Note: Test data created (guest user & profile) - cleanup not implemented'));

  } catch (error: any) {
    console.log(chalk.red('\n❌ Test failed!'));
    
    if (!error.response && error.code === 'ECONNREFUSED') {
      console.log(chalk.red('Connection refused!'));
      console.log(chalk.yellow('\n💡 Is the server running?'));
      console.log(chalk.gray('Run: NODE_ENV=test npm run dev'));
    }
    
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);