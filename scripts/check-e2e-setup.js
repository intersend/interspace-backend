#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking E2E Test Setup...\n');

// Check required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_SECRET',
  'ORBY_INSTANCE_PRIVATE_API_KEY',
  'ORBY_INSTANCE_PUBLIC_API_KEY',
  'ORBY_PRIVATE_INSTANCE_URL',
  'SILENCE_NODE_URL',
  'SILENCE_ADMIN_TOKEN',
  'DUO_NODE_URL',
  'DUO_NODE_AUDIENCE_URL'
];

// Load environment variables
const envFile = process.env.NODE_ENV === 'test' ? '.env.e2e' : '.env.local';
const envPath = path.join(__dirname, '..', envFile);

if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
  console.log(`✅ Loaded environment from ${envFile}\n`);
} else {
  console.error(`❌ ${envFile} not found\n`);
  process.exit(1);
}

// Check each required variable
let missingVars = [];
let emptyVars = [];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    missingVars.push(varName);
  } else if (process.env[varName].trim() === '') {
    emptyVars.push(varName);
  }
});

// Check Docker
const { execSync } = require('child_process');
let dockerAvailable = false;
try {
  execSync('docker --version', { stdio: 'ignore' });
  dockerAvailable = true;
  console.log('✅ Docker is available');
} catch (error) {
  console.log('❌ Docker is not available');
}

// Check duo node repository
const duoNodePath = path.join(__dirname, '../../../interspace-duo-node');
if (fs.existsSync(duoNodePath)) {
  console.log('✅ interspace-duo-node repository found');
} else {
  console.log('❌ interspace-duo-node repository not found at', duoNodePath);
}

// Check database connection
console.log('\n📊 Database Configuration:');
console.log(`   URL: ${process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':***@') || 'NOT SET'}`);

// Check Orby configuration
console.log('\n🌐 Orby Configuration:');
console.log(`   Private API Key: ${process.env.ORBY_INSTANCE_PRIVATE_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   Public API Key: ${process.env.ORBY_INSTANCE_PUBLIC_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   Instance URL: ${process.env.ORBY_PRIVATE_INSTANCE_URL || 'NOT SET'}`);

// Check MPC configuration
console.log('\n🔐 MPC Configuration:');
console.log(`   DISABLE_MPC: ${process.env.DISABLE_MPC || 'false'}`);
console.log(`   Silence Node URL: ${process.env.SILENCE_NODE_URL || 'NOT SET'}`);
console.log(`   Duo Node URL: ${process.env.DUO_NODE_URL || 'NOT SET'}`);

// Summary
console.log('\n📋 Summary:');
if (missingVars.length > 0) {
  console.log(`❌ Missing variables: ${missingVars.join(', ')}`);
}
if (emptyVars.length > 0) {
  console.log(`⚠️  Empty variables: ${emptyVars.join(', ')}`);
}

if (missingVars.length === 0 && dockerAvailable) {
  console.log('✅ Environment is ready for E2E tests!');
  process.exit(0);
} else {
  console.log('\n❌ Environment is not ready for E2E tests.');
  console.log('\nTo fix:');
  if (missingVars.length > 0) {
    console.log('1. Add missing environment variables to', envFile);
  }
  if (!dockerAvailable) {
    console.log('2. Install and start Docker');
  }
  process.exit(1);
}