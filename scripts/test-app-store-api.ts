import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3001/api/v2';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'pass' | 'fail';
  statusCode?: number;
  message?: string;
  data?: any;
}

const results: TestResult[] = [];

async function testEndpoint(
  method: string,
  endpoint: string,
  data?: any,
  expectedStatus = 200
): Promise<void> {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log(`\nTesting ${method} ${endpoint}...`);

  try {
    const response = await axios({
      method,
      url,
      data,
      validateStatus: () => true // Don't throw on any status
    });

    const passed = response.status === expectedStatus;
    
    results.push({
      endpoint,
      method,
      status: passed ? 'pass' : 'fail',
      statusCode: response.status,
      message: passed ? 'Success' : `Expected ${expectedStatus}, got ${response.status}`,
      data: response.data
    });

    if (passed) {
      console.log(`✅ ${method} ${endpoint} - Status: ${response.status}`);
      if (response.data?.data) {
        console.log(`   Data: ${JSON.stringify(response.data.data).substring(0, 100)}...`);
      }
    } else {
      console.log(`❌ ${method} ${endpoint} - Status: ${response.status} (expected ${expectedStatus})`);
    }
  } catch (error: any) {
    results.push({
      endpoint,
      method,
      status: 'fail',
      message: error.message
    });
    console.log(`❌ ${method} ${endpoint} - Error: ${error.message}`);
  }
}

async function runTests() {
  console.log('🧪 Testing App Store API Endpoints');
  console.log(`📍 Base URL: ${API_BASE_URL}`);
  console.log('=====================================\n');

  // Test Categories
  await testEndpoint('GET', '/app-store/categories');

  // Test Apps - Various queries
  await testEndpoint('GET', '/app-store/apps');
  await testEndpoint('GET', '/app-store/apps?category=defi');
  await testEndpoint('GET', '/app-store/apps?tags=swap&tags=dex');
  await testEndpoint('GET', '/app-store/apps?chains=1&chains=137');
  await testEndpoint('GET', '/app-store/apps?sortBy=newest');
  await testEndpoint('GET', '/app-store/apps?page=1&limit=5');

  // Test Featured Apps
  await testEndpoint('GET', '/app-store/featured');

  // Test Search
  await testEndpoint('GET', '/app-store/search?q=uni');
  await testEndpoint('GET', '/app-store/search?q=defi');
  await testEndpoint('GET', '/app-store/search', undefined, 400); // Should fail - no query

  // Test individual app (need to get an ID first)
  try {
    const appsResponse = await axios.get(`${API_BASE_URL}/app-store/apps?limit=1`);
    if (appsResponse.data?.data?.[0]?.id) {
      const appId = appsResponse.data.data[0].id;
      await testEndpoint('GET', `/app-store/apps/${appId}`);
      
      // Test shareable ID if available
      if (appsResponse.data.data[0].shareableId) {
        await testEndpoint('GET', `/app-store/apps/share/${appsResponse.data.data[0].shareableId}`);
      }
    }
  } catch (e) {
    console.log('⚠️  Could not test individual app endpoints - no apps found');
  }

  // Test Admin Endpoints (without auth for now)
  console.log('\n📋 Testing Admin Endpoints (No Auth)');
  console.log('=====================================\n');

  // Create a test category
  const testCategory = {
    name: 'Test Category',
    slug: 'test-category',
    description: 'Test category for API testing',
    icon: '🧪',
    position: 99
  };
  
  let categoryId: string | undefined;
  const createCategoryResult = await axios.post(`${API_BASE_URL}/app-store/categories`, testCategory).catch(e => e.response);
  if (createCategoryResult?.data?.data?.id) {
    categoryId = createCategoryResult.data.data.id;
    results.push({
      endpoint: '/app-store/categories',
      method: 'POST',
      status: 'pass',
      statusCode: createCategoryResult.status,
      data: createCategoryResult.data
    });
    console.log(`✅ POST /app-store/categories - Created category with ID: ${categoryId}`);
  }

  // Create a test app
  if (categoryId) {
    const testApp = {
      name: 'Test App',
      url: 'https://testapp.example.com',
      iconUrl: 'https://testapp.example.com/icon.png',
      categoryId,
      description: 'Test app for API testing',
      detailedDescription: 'This is a test app created by the API test script',
      tags: ['test', 'demo'],
      chainSupport: ['1', '137'],
      developer: 'Test Developer',
      version: '1.0.0',
      isNew: true
    };

    const createAppResult = await axios.post(`${API_BASE_URL}/app-store/apps`, testApp).catch(e => e.response);
    if (createAppResult?.data?.data?.id) {
      const appId = createAppResult.data.data.id;
      results.push({
        endpoint: '/app-store/apps',
        method: 'POST',
        status: 'pass',
        statusCode: createAppResult.status,
        data: createAppResult.data
      });
      console.log(`✅ POST /app-store/apps - Created app with ID: ${appId}`);

      // Update the app
      await testEndpoint('PUT', `/app-store/apps/${appId}`, { description: 'Updated description' });

      // Delete the app
      await testEndpoint('DELETE', `/app-store/apps/${appId}`);
    }

    // Update the category
    await testEndpoint('PUT', `/app-store/categories/${categoryId}`, { description: 'Updated description' });

    // Delete the category
    await testEndpoint('DELETE', `/app-store/categories/${categoryId}`);
  }

  // Summary
  console.log('\n📊 Test Summary');
  console.log('=====================================');
  
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📋 Total: ${results.length}`);
  
  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`   - ${r.method} ${r.endpoint}: ${r.message}`);
    });
  }
  
  console.log('\n✨ App Store API testing completed!');
}

// Run the tests
runTests().catch(console.error);