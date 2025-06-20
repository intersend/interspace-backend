import { TestSuite, TestContext } from '../../types';
import { assertResponse, assertErrorResponse, getErrorMessage } from '../../utils/ApiClient';
import { faker } from '@faker-js/faker';
import { logger } from '../../utils/logger';

export const appManagementSuite: TestSuite = {
  name: 'App Management',
  description: 'Comprehensive testing of app/bookmark management in profiles',
  tags: ['apps', 'profiles', 'critical'],
  priority: 'critical',
  endpoints: ['/api/v1/profiles/*/apps/*', '/api/v1/apps/*'],
  
  async setup(context: TestContext) {
    // Will create test data as needed in each test
  },

  async teardown(context: TestContext) {
    // Cleanup handled by TestContext
  },

  tests: [
    {
      name: 'POST /profiles/:profileId/apps - Add app to profile (root level)',
      tags: ['create', 'critical'],
      async fn(context: TestContext) {
        // Create user and profile
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const profile = await context.createProfile(user.id, { 
          name: 'Test Profile',
          isActive: true 
        });
        
        const client = context.createApiClient(accessToken);
        
        // Test data
        const appData = {
          name: 'GitHub',
          url: 'https://github.com',
          iconUrl: 'https://github.com/favicon.ico'
        };
        
        // Add app to profile
        const response = await client.post(`/api/v1/profiles/${profile.id}/apps`, appData);
        
        assertResponse(response, 201);
        
        // Validate response
        const { data } = response.data;
        if (!data.id) throw new Error('App ID not returned');
        if (data.name !== appData.name) throw new Error('App name mismatch');
        if (data.url !== appData.url) throw new Error('App URL mismatch');
        if (data.iconUrl !== appData.iconUrl) throw new Error('App icon URL mismatch');
        if (data.profileId !== profile.id) throw new Error('Profile ID mismatch');
        if (data.folderId !== null) throw new Error('App should be at root level');
        if (typeof data.position !== 'number') throw new Error('Position not set');
        
        logger.info(`Successfully added app to profile: ${data.id}`);
        
        // Verify app exists by fetching it
        const getResponse = await client.get(`/api/v1/profiles/${profile.id}/apps`);
        assertResponse(getResponse, 200);
        
        const apps = getResponse.data.data;
        if (!Array.isArray(apps) || apps.length === 0) {
          throw new Error('App not found in profile apps list');
        }
        
        const createdApp = apps.find(app => app.id === data.id);
        if (!createdApp) {
          throw new Error('Created app not found in apps list');
        }
      }
    },

    {
      name: 'POST /profiles/:profileId/apps - Add multiple apps with auto-positioning',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const profile = await context.createProfile(user.id);
        const client = context.createApiClient(accessToken);
        
        // Add 3 apps without specifying position
        const apps = [
          { name: 'App 1', url: 'https://app1.com' },
          { name: 'App 2', url: 'https://app2.com' },
          { name: 'App 3', url: 'https://app3.com' }
        ];
        
        const createdApps = [];
        for (const app of apps) {
          const response = await client.post(`/api/v1/profiles/${profile.id}/apps`, app);
          assertResponse(response, 201);
          createdApps.push(response.data.data);
        }
        
        // Verify positions are auto-incremented
        if (createdApps[0].position !== 0) {
          throw new Error('First app should have position 0');
        }
        if (createdApps[1].position !== 1) {
          throw new Error('Second app should have position 1');
        }
        if (createdApps[2].position !== 2) {
          throw new Error('Third app should have position 2');
        }
      }
    },

    {
      name: 'POST /profiles/:profileId/apps - Add app to folder',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const profile = await context.createProfile(user.id);
        const client = context.createApiClient(accessToken);
        
        // First create a folder
        const folderResponse = await client.post(`/api/v1/profiles/${profile.id}/folders`, {
          name: 'Work Apps',
          color: '#FF0000'
        });
        assertResponse(folderResponse, 201);
        const folder = folderResponse.data.data;
        
        // Add app to folder
        const appData = {
          name: 'Slack',
          url: 'https://slack.com',
          folderId: folder.id
        };
        
        const response = await client.post(`/api/v1/profiles/${profile.id}/apps`, appData);
        assertResponse(response, 201);
        
        const app = response.data.data;
        if (app.folderId !== folder.id) {
          throw new Error('App not added to specified folder');
        }
        
        // Verify app appears in folder
        const folderAppsResponse = await client.get(
          `/api/v1/profiles/${profile.id}/folders/${folder.id}/apps`
        );
        assertResponse(folderAppsResponse, 200);
        
        const folderApps = folderAppsResponse.data.data;
        if (!folderApps.some((a: any) => a.id === app.id)) {
          throw new Error('App not found in folder apps list');
        }
      }
    },

    {
      name: 'POST /profiles/:profileId/apps - Validation errors',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const profile = await context.createProfile(user.id);
        const client = context.createApiClient(accessToken);
        
        // Test missing name
        try {
          await client.post(`/api/v1/profiles/${profile.id}/apps`, {
            url: 'https://example.com'
          });
          throw new Error('Should fail without name');
        } catch (error) {
          assertErrorResponse(error, 400);
        }
        
        // Test missing URL
        try {
          await client.post(`/api/v1/profiles/${profile.id}/apps`, {
            name: 'Test App'
          });
          throw new Error('Should fail without URL');
        } catch (error) {
          assertErrorResponse(error, 400);
        }
        
        // Test invalid URL
        try {
          await client.post(`/api/v1/profiles/${profile.id}/apps`, {
            name: 'Test App',
            url: 'not-a-valid-url'
          });
          throw new Error('Should fail with invalid URL');
        } catch (error) {
          assertErrorResponse(error, 400);
        }
        
        // Test empty name
        try {
          await client.post(`/api/v1/profiles/${profile.id}/apps`, {
            name: '',
            url: 'https://example.com'
          });
          throw new Error('Should fail with empty name');
        } catch (error) {
          assertErrorResponse(error, 400);
        }
        
        // Test name too long
        try {
          await client.post(`/api/v1/profiles/${profile.id}/apps`, {
            name: 'A'.repeat(256),
            url: 'https://example.com'
          });
          throw new Error('Should fail with name too long');
        } catch (error) {
          assertErrorResponse(error, 400);
        }
      }
    },

    {
      name: 'POST /profiles/:profileId/apps - Authorization checks',
      async fn(context: TestContext) {
        const user1 = await context.createUser();
        const user2 = await context.createUser();
        const { accessToken: token1 } = await context.authenticate(user1);
        const { accessToken: token2 } = await context.authenticate(user2);
        
        const profile1 = await context.createProfile(user1.id);
        const client2 = context.createApiClient(token2);
        
        // Try to add app to another user's profile
        try {
          await client2.post(`/api/v1/profiles/${profile1.id}/apps`, {
            name: 'Unauthorized App',
            url: 'https://example.com'
          });
          throw new Error('Should not allow adding app to another user\'s profile');
        } catch (error) {
          assertErrorResponse(error, 403);
        }
        
        // Try with non-existent profile
        const fakeProfileId = faker.string.uuid();
        try {
          await client2.post(`/api/v1/profiles/${fakeProfileId}/apps`, {
            name: 'Test App',
            url: 'https://example.com'
          });
          throw new Error('Should fail with non-existent profile');
        } catch (error) {
          assertErrorResponse(error, 403);
        }
      }
    },

    {
      name: 'GET /profiles/:profileId/apps - List apps in profile',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const profile = await context.createProfile(user.id);
        const client = context.createApiClient(accessToken);
        
        // Add multiple apps
        const apps = [
          { name: 'GitHub', url: 'https://github.com', position: 0 },
          { name: 'Twitter', url: 'https://twitter.com', position: 1 },
          { name: 'LinkedIn', url: 'https://linkedin.com', position: 2 }
        ];
        
        for (const app of apps) {
          await client.post(`/api/v1/profiles/${profile.id}/apps`, app);
        }
        
        // Get all apps
        const response = await client.get(`/api/v1/profiles/${profile.id}/apps`);
        assertResponse(response, 200);
        
        const retrievedApps = response.data.data;
        if (!Array.isArray(retrievedApps)) {
          throw new Error('Response should be an array');
        }
        if (retrievedApps.length !== 3) {
          throw new Error(`Expected 3 apps, got ${retrievedApps.length}`);
        }
        
        // Verify order
        if (retrievedApps[0].name !== 'GitHub') {
          throw new Error('Apps not returned in correct order');
        }
      }
    },

    {
      name: 'PUT /apps/:appId - Update app details',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const profile = await context.createProfile(user.id);
        const client = context.createApiClient(accessToken);
        
        // Create an app
        const createResponse = await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'Original Name',
          url: 'https://original.com'
        });
        const app = createResponse.data.data;
        
        // Update the app
        const updateData = {
          name: 'Updated Name',
          url: 'https://updated.com',
          iconUrl: 'https://updated.com/icon.png'
        };
        
        const updateResponse = await client.put(`/api/v1/apps/${app.id}`, updateData);
        assertResponse(updateResponse, 200);
        
        const updatedApp = updateResponse.data.data;
        if (updatedApp.name !== updateData.name) {
          throw new Error('Name not updated');
        }
        if (updatedApp.url !== updateData.url) {
          throw new Error('URL not updated');
        }
        if (updatedApp.iconUrl !== updateData.iconUrl) {
          throw new Error('Icon URL not updated');
        }
      }
    },

    {
      name: 'DELETE /apps/:appId - Delete app from profile',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const profile = await context.createProfile(user.id);
        const client = context.createApiClient(accessToken);
        
        // Create an app
        const createResponse = await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'To Be Deleted',
          url: 'https://delete.me'
        });
        const app = createResponse.data.data;
        
        // Delete the app
        const deleteResponse = await client.delete(`/api/v1/apps/${app.id}`);
        assertResponse(deleteResponse, 200);
        
        // Verify app is deleted
        const listResponse = await client.get(`/api/v1/profiles/${profile.id}/apps`);
        const apps = listResponse.data.data;
        
        if (apps.some((a: any) => a.id === app.id)) {
          throw new Error('App still exists after deletion');
        }
      }
    },

    {
      name: 'PUT /apps/:appId/move - Move app between folders',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const profile = await context.createProfile(user.id);
        const client = context.createApiClient(accessToken);
        
        // Create two folders
        const folder1Response = await client.post(`/api/v1/profiles/${profile.id}/folders`, {
          name: 'Folder 1'
        });
        const folder1 = folder1Response.data.data;
        
        const folder2Response = await client.post(`/api/v1/profiles/${profile.id}/folders`, {
          name: 'Folder 2'
        });
        const folder2 = folder2Response.data.data;
        
        // Create app in folder 1
        const appResponse = await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'Mobile App',
          url: 'https://mobile.app',
          folderId: folder1.id
        });
        const app = appResponse.data.data;
        
        // Move to folder 2
        const moveResponse = await client.put(`/api/v1/apps/${app.id}/move`, {
          folderId: folder2.id
        });
        assertResponse(moveResponse, 200);
        
        const movedApp = moveResponse.data.data;
        if (movedApp.folderId !== folder2.id) {
          throw new Error('App not moved to correct folder');
        }
        
        // Move to root (null folder)
        const moveToRootResponse = await client.put(`/api/v1/apps/${app.id}/move`, {
          folderId: null
        });
        assertResponse(moveToRootResponse, 200);
        
        const rootApp = moveToRootResponse.data.data;
        if (rootApp.folderId !== null) {
          throw new Error('App not moved to root');
        }
      }
    },

    {
      name: 'POST /profiles/:profileId/apps/reorder - Reorder apps',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const profile = await context.createProfile(user.id);
        const client = context.createApiClient(accessToken);
        
        // Create 3 apps
        const app1 = await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'App 1',
          url: 'https://app1.com'
        }).then(r => r.data.data);
        
        const app2 = await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'App 2',
          url: 'https://app2.com'
        }).then(r => r.data.data);
        
        const app3 = await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'App 3',
          url: 'https://app3.com'
        }).then(r => r.data.data);
        
        // Reorder: 3, 1, 2
        const reorderResponse = await client.post(`/api/v1/profiles/${profile.id}/apps/reorder`, {
          appIds: [app3.id, app1.id, app2.id]
        });
        assertResponse(reorderResponse, 200);
        
        // Verify new order
        const listResponse = await client.get(`/api/v1/profiles/${profile.id}/apps`);
        const reorderedApps = listResponse.data.data;
        
        if (reorderedApps[0].id !== app3.id) {
          throw new Error('First app should be App 3');
        }
        if (reorderedApps[1].id !== app1.id) {
          throw new Error('Second app should be App 1');
        }
        if (reorderedApps[2].id !== app2.id) {
          throw new Error('Third app should be App 2');
        }
      }
    },

    {
      name: 'GET /profiles/:profileId/apps/search - Search apps',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const profile = await context.createProfile(user.id);
        const client = context.createApiClient(accessToken);
        
        // Create apps with searchable content
        await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'GitHub Repository',
          url: 'https://github.com/user/repo'
        });
        
        await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'GitLab Project',
          url: 'https://gitlab.com/project'
        });
        
        await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'Slack Workspace',
          url: 'https://slack.com/workspace'
        });
        
        // Search by name
        const searchByName = await client.get(
          `/api/v1/profiles/${profile.id}/apps/search?q=git`
        );
        assertResponse(searchByName, 200);
        
        const gitApps = searchByName.data.data;
        if (gitApps.length !== 2) {
          throw new Error('Should find 2 apps with "git" in name');
        }
        
        // Search by URL
        const searchByUrl = await client.get(
          `/api/v1/profiles/${profile.id}/apps/search?q=.com`
        );
        assertResponse(searchByUrl, 200);
        
        const comApps = searchByUrl.data.data;
        if (comApps.length !== 3) {
          throw new Error('Should find all 3 apps with .com in URL');
        }
      }
    },

    {
      name: 'Edge case: Special characters in app data',
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const profile = await context.createProfile(user.id);
        const client = context.createApiClient(accessToken);
        
        // Test with special characters
        const specialApps = [
          {
            name: 'App with émojis 🚀 🎉',
            url: 'https://emoji-app.com'
          },
          {
            name: 'App with "quotes" and \'apostrophes\'',
            url: 'https://special-chars.com'
          },
          {
            name: 'App with <script>alert("XSS")</script>',
            url: 'https://xss-test.com'
          },
          {
            name: 'Multi\nLine\nApp Name',
            url: 'https://multiline.com'
          }
        ];
        
        for (const appData of specialApps) {
          const response = await client.post(`/api/v1/profiles/${profile.id}/apps`, appData);
          assertResponse(response, 201);
          
          const app = response.data.data;
          // Verify data is properly handled (e.g., sanitized or preserved)
          if (!app.name || !app.url) {
            throw new Error('Special characters caused data loss');
          }
        }
      }
    },

    {
      name: 'Performance: Add many apps to profile',
      tags: ['performance'],
      async fn(context: TestContext) {
        const user = await context.createUser();
        const { accessToken } = await context.authenticate(user);
        const profile = await context.createProfile(user.id);
        const client = context.createApiClient(accessToken);
        
        const startTime = Date.now();
        const appCount = 50;
        
        // Add many apps
        const promises = [];
        for (let i = 0; i < appCount; i++) {
          promises.push(
            client.post(`/api/v1/profiles/${profile.id}/apps`, {
              name: `App ${i}`,
              url: `https://app${i}.com`,
              position: i
            })
          );
        }
        
        const results = await Promise.all(promises);
        const duration = Date.now() - startTime;
        
        // Verify all succeeded
        if (results.some(r => r.status !== 201)) {
          throw new Error('Some app creations failed');
        }
        
        logger.info(`Created ${appCount} apps in ${duration}ms (${duration/appCount}ms per app)`);
        
        // Test retrieving many apps
        const listStartTime = Date.now();
        const listResponse = await client.get(`/api/v1/profiles/${profile.id}/apps`);
        const listDuration = Date.now() - listStartTime;
        
        assertResponse(listResponse, 200);
        if (listResponse.data.data.length !== appCount) {
          throw new Error(`Expected ${appCount} apps, got ${listResponse.data.data.length}`);
        }
        
        logger.info(`Listed ${appCount} apps in ${listDuration}ms`);
        
        // Performance thresholds
        if (duration > 10000) { // 10 seconds for 50 apps
          throw new Error('App creation too slow');
        }
        if (listDuration > 1000) { // 1 second to list 50 apps
          throw new Error('App listing too slow');
        }
      }
    },

    {
      name: 'Complete user journey: iOS app adding apps to profile',
      tags: ['integration', 'ios-simulation'],
      async fn(context: TestContext) {
        // Simulate complete iOS app flow
        const user = await context.createUser({
          email: faker.internet.email()
        });
        const { accessToken } = await context.authenticate(user);
        const client = context.createApiClient(accessToken);
        
        // 1. Create a profile (simulating profile creation in iOS)
        const profileResponse = await client.post('/api/v1/profiles', {
          name: 'My Work Profile'
        });
        assertResponse(profileResponse, 201);
        const profile = profileResponse.data.data;
        
        // 2. Create folders for organization
        const socialFolder = await client.post(`/api/v1/profiles/${profile.id}/folders`, {
          name: 'Social Media',
          color: '#1DA1F2'
        }).then(r => r.data.data);
        
        const workFolder = await client.post(`/api/v1/profiles/${profile.id}/folders`, {
          name: 'Work Tools',
          color: '#FF6B6B'
        }).then(r => r.data.data);
        
        // 3. Add apps to different locations (simulating iOS app actions)
        // Add social media apps to folder
        const twitter = await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'Twitter',
          url: 'https://twitter.com',
          iconUrl: 'https://twitter.com/favicon.ico',
          folderId: socialFolder.id
        }).then(r => r.data.data);
        
        const linkedin = await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'LinkedIn',
          url: 'https://linkedin.com',
          iconUrl: 'https://linkedin.com/favicon.ico',
          folderId: socialFolder.id
        }).then(r => r.data.data);
        
        // Add work apps to work folder
        const slack = await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'Slack',
          url: 'https://slack.com',
          iconUrl: 'https://slack.com/favicon.ico',
          folderId: workFolder.id
        }).then(r => r.data.data);
        
        // Add some apps at root level
        const github = await client.post(`/api/v1/profiles/${profile.id}/apps`, {
          name: 'GitHub',
          url: 'https://github.com',
          iconUrl: 'https://github.com/favicon.ico'
        }).then(r => r.data.data);
        
        // 4. Verify the complete profile structure
        const allApps = await client.get(`/api/v1/profiles/${profile.id}/apps`);
        assertResponse(allApps, 200);
        
        if (allApps.data.data.length !== 4) {
          throw new Error('Should have 4 apps total');
        }
        
        // 5. Test iOS-specific scenarios
        // Scenario: User reorganizes apps (drag and drop in iOS)
        await client.post(`/api/v1/profiles/${profile.id}/apps/reorder`, {
          appIds: [github.id],
          folderId: null
        });
        
        // Scenario: User moves app from folder to root
        await client.put(`/api/v1/apps/${slack.id}/move`, {
          folderId: null
        });
        
        // 6. Search functionality (iOS search bar)
        const searchResults = await client.get(
          `/api/v1/profiles/${profile.id}/apps/search?q=git`
        );
        assertResponse(searchResults, 200);
        
        logger.info('iOS app simulation completed successfully');
        
        // Log final state
        const finalApps = await client.get(`/api/v1/profiles/${profile.id}/apps`);
        logger.info(`Final app structure:
          - Root level: ${finalApps.data.data.filter((a: any) => !a.folderId).length} apps
          - In folders: ${finalApps.data.data.filter((a: any) => a.folderId).length} apps
        `);
      }
    }
  ]
};