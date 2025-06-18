#!/usr/bin/env node
/**
 * Pre-build script to ensure production builds don't contain development-only features
 */

const fs = require('fs');
const path = require('path');

// Check if building for production
const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

if (isProduction) {
  console.log('🔒 Running production build security checks...\n');
  
  // Check 1: Ensure BYPASS_LOGIN is not set to true
  if (process.env.BYPASS_LOGIN === 'true') {
    console.error('❌ SECURITY ERROR: BYPASS_LOGIN cannot be true in production builds');
    console.error('   This feature is only for development and must be disabled in production');
    process.exit(1);
  }
  
  // Check 2: Ensure no development endpoints are exposed
  const indexPath = path.join(__dirname, '../src/index.ts');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  
  if (indexContent.includes('/dev/') && !indexContent.includes('NODE_ENV === \'development\'')) {
    console.error('❌ SECURITY ERROR: Development endpoints detected without proper guards');
    console.error('   All /dev/ endpoints must be wrapped in NODE_ENV checks');
    process.exit(1);
  }
  
  // Check 3: Ensure encryption secret is set
  if (!process.env.ENCRYPTION_SECRET || process.env.ENCRYPTION_SECRET.length < 64) {
    console.error('❌ SECURITY ERROR: ENCRYPTION_SECRET must be set and at least 64 characters');
    process.exit(1);
  }
  
  // Check 4: Ensure JWT secrets are strong
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('❌ SECURITY ERROR: JWT_SECRET must be at least 32 characters');
    process.exit(1);
  }
  
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
    console.error('❌ SECURITY ERROR: JWT_REFRESH_SECRET must be at least 32 characters');
    process.exit(1);
  }
  
  // Check 5: Ensure CORS is not set to wildcard
  if (process.env.CORS_ORIGINS === '*') {
    console.error('❌ SECURITY ERROR: CORS_ORIGINS cannot be * in production');
    process.exit(1);
  }
  
  // Check 6: Look for console.log statements (they should be using logger)
  const srcDir = path.join(__dirname, '../src');
  const checkForConsoleLogs = (dir) => {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !file.includes('node_modules') && !file.includes('test')) {
        checkForConsoleLogs(filePath);
      } else if (file.endsWith('.ts') && !file.includes('.test.') && !file.includes('.spec.')) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (line.includes('console.log') && !line.includes('//') && !line.includes('logger')) {
            console.warn(`⚠️  WARNING: console.log found in ${filePath}:${index + 1}`);
            console.warn('   Consider using the logger utility instead');
          }
        });
      }
    }
  };
  
  checkForConsoleLogs(srcDir);
  
  console.log('\n✅ Production build security checks passed!');
  console.log('🔒 Building secure production bundle...\n');
} else {
  console.log('🔧 Building for development environment...\n');
}