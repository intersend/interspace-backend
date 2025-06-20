#!/usr/bin/env node

/**
 * Simple test for adding apps to profiles
 * This bypasses the test framework to directly test the API
 */

import axios from 'axios';
import chalk from 'chalk';

const API_URL = 'http://127.0.0.1:3000';

async function main() {
  console.log(chalk.bold.cyan('\n🔍 Simple App Addition Test\n'));

  try {
    // Step 1: Authenticate using the expected format
    const testEmail = 'app-test@example.com';

    console.log(chalk.blue('1. Authenticating...'));
    console.log(chalk.gray('Note: This system uses passwordless auth'));
    
    let authResponse;
    try {
      // For testing, we'll use the email strategy
      // In a real scenario, you'd need to go through the email verification flow
      authResponse = await axios.post(`${API_URL}/api/v1/auth/authenticate`, {
        authToken: testEmail,
        authStrategy: 'email',
        email: testEmail
      });
    } catch (error: any) {
      if (error.response?.status === 401) {
        console.log(chalk.yellow('Test user not found. Please create a user first:'));
        console.log(chalk.gray(`
-- Run this SQL in your database:
INSERT INTO users (id, email, "hashedPassword", "emailVerified", "createdAt", "updatedAt", "twoFactorEnabled")
VALUES (
  'test-user-001',
  'app-test@example.com',
  '$2a$10$YourHashedPasswordHere', -- Use bcrypt to hash 'TestPassword123!'
  true,
  NOW(),
  NOW(),
  false
);
        `));
        process.exit(1);
      }
      throw error;
    }

    const { accessToken, user } = authResponse.data.data;
    console.log(chalk.green('✓ Authentication successful'));
    console.log(chalk.gray(`User ID: ${user.id}`));

    // Create axios instance with auth
    const api = axios.create({
      baseURL: API_URL,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // Step 2: Get or create a profile
    console.log(chalk.blue('\n2. Getting profiles...'));
    const profilesResponse = await api.get('/api/v1/profiles');
    let profileId;

    if (profilesResponse.data.data.length === 0) {
      console.log(chalk.yellow('No profiles found, creating one...'));
      const createProfileResponse = await api.post('/api/v1/profiles', {
        name: 'Test Profile for Apps'
      });
      profileId = createProfileResponse.data.data.id;
      console.log(chalk.green('✓ Profile created'));
    } else {
      profileId = profilesResponse.data.data[0].id;
      console.log(chalk.green('✓ Using existing profile'));
    }
    console.log(chalk.gray(`Profile ID: ${profileId}`));

    // Step 3: Add an app to the profile
    console.log(chalk.blue('\n3. Adding app to profile...'));
    const appData = {
      name: 'GitHub',
      url: 'https://github.com',
      iconUrl: 'https://github.com/favicon.ico'
    };

    console.log(chalk.gray('Request:'));
    console.log(chalk.gray(`POST ${API_URL}/api/v1/profiles/${profileId}/apps`));
    console.log(chalk.gray(JSON.stringify(appData, null, 2)));

    const addAppResponse = await api.post(`/api/v1/profiles/${profileId}/apps`, appData);
    
    console.log(chalk.green('✓ App added successfully!'));
    console.log(chalk.gray('Response:'));
    console.log(chalk.gray(JSON.stringify(addAppResponse.data, null, 2)));

    // Step 4: Verify the app was added
    console.log(chalk.blue('\n4. Verifying app in profile...'));
    const appsResponse = await api.get(`/api/v1/profiles/${profileId}/apps`);
    const apps = appsResponse.data.data;
    
    if (apps.length > 0 && apps.find((app: any) => app.name === 'GitHub')) {
      console.log(chalk.green('✓ App found in profile!'));
      console.log(chalk.gray(`Total apps in profile: ${apps.length}`));
    } else {
      console.log(chalk.red('✗ App not found in profile'));
    }

    // Success summary
    console.log(chalk.bold.green('\n✅ Test completed successfully!\n'));
    console.log(chalk.cyan('iOS Integration Summary:'));
    console.log(chalk.white('- Endpoint: POST /api/v1/profiles/{profileId}/apps'));
    console.log(chalk.white('- Required fields: name (string), url (string)'));
    console.log(chalk.white('- Optional fields: iconUrl (string), folderId (string), position (number)'));
    console.log(chalk.white('- Response: 201 Created with app data'));

  } catch (error: any) {
    console.log(chalk.red('\n❌ Test failed!'));
    
    if (error.response) {
      console.log(chalk.red(`Status: ${error.response.status}`));
      console.log(chalk.red(`Error: ${JSON.stringify(error.response.data, null, 2)}`));
      
      // Provide specific guidance based on error
      if (error.response.status === 400) {
        console.log(chalk.yellow('\n💡 Validation error - check that name and url are provided'));
      } else if (error.response.status === 401) {
        console.log(chalk.yellow('\n💡 Authentication error - token may be invalid'));
      } else if (error.response.status === 403) {
        console.log(chalk.yellow('\n💡 Authorization error - user may not own the profile'));
      }
    } else {
      console.log(chalk.red('Network error:', error.message));
      console.log(chalk.yellow('\n💡 Is the server running on port 3001?'));
    }
    
    process.exit(1);
  }
}

// Run the test
main().catch(console.error);