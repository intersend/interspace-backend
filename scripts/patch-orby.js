#!/usr/bin/env node

/**
 * Patch script for @orb-labs/orby-ethers6 CommonJS build issue
 * 
 * This fixes the incorrect class extension in the CommonJS build where it tries to
 * extend ethers.ethers.JsonRpcProvider but JsonRpcProvider is not properly accessible
 * 
 * This script can be removed once the upstream package is fixed.
 */

const fs = require('fs');
const path = require('path');

const ORBY_PROVIDER_PATH = path.join(
  __dirname,
  '..',
  'node_modules',
  '@orb-labs',
  'orby-ethers6',
  'dist',
  'cjs',
  'orby_provider.js'
);

function patchOrbyProvider() {
  try {
    // Check if the file exists
    if (!fs.existsSync(ORBY_PROVIDER_PATH)) {
      console.log('⚠️  OrbyProvider file not found. Skipping patch.');
      console.log('   This is normal if @orb-labs/orby-ethers6 is not installed.');
      return;
    }

    // Read the file
    let content = fs.readFileSync(ORBY_PROVIDER_PATH, 'utf8');
    
    // Remove any existing patches first to start clean
    content = content.replace(/\/\/ Patch.*\n.*ethers_1\.ethers = ethers_1.*\n/g, '');
    content = content.replace(/\/\/ Patched:.*\n/g, '');
    
    // Check if already has the correct import pattern
    if (content.includes('class OrbyProvider extends ethers_1.JsonRpcProvider')) {
      console.log('✅ OrbyProvider already correctly extends ethers_1.JsonRpcProvider');
      return;
    }
    
    const originalContent = content;
    
    // Replace the problematic class extension
    // The issue is that ethers_1.ethers.JsonRpcProvider doesn't exist
    // We need to use ethers_1.JsonRpcProvider directly
    content = content.replace(
      /class OrbyProvider extends ethers_1\.ethers\.JsonRpcProvider/g,
      'class OrbyProvider extends ethers_1.JsonRpcProvider'
    );
    
    // Also fix any TypedDataEncoder references that might have the same issue
    // But TypedDataEncoder is actually at ethers.TypedDataEncoder, so we need to handle it differently
    if (content.includes('ethers_1.ethers.TypedDataEncoder')) {
      content = content.replace(
        /ethers_1\.ethers\.TypedDataEncoder/g,
        'ethers_1.TypedDataEncoder'
      );
    }
    
    // If TypedDataEncoder is used without the ethers namespace, we need to destructure it
    if (content.includes('ethers_1.TypedDataEncoder') && !content.includes('const { TypedDataEncoder }')) {
      // Add the destructuring after the ethers require
      content = content.replace(
        'const ethers_1 = require("ethers");',
        'const ethers_1 = require("ethers");\nconst { TypedDataEncoder } = ethers_1;'
      );
      
      // Now replace ethers_1.TypedDataEncoder with just TypedDataEncoder
      content = content.replace(
        /ethers_1\.TypedDataEncoder/g,
        'TypedDataEncoder'
      );
    }

    // Write the patched content back
    fs.writeFileSync(ORBY_PROVIDER_PATH, content, 'utf8');
    
    // Verify the patch was applied
    if (content !== originalContent) {
      console.log('✅ Successfully patched @orb-labs/orby-ethers6');
      console.log('   Fixed CommonJS ethers imports');
      
      // Show what was changed
      if (originalContent.includes('ethers_1.ethers.JsonRpcProvider')) {
        console.log('   - Changed: ethers_1.ethers.JsonRpcProvider → ethers_1.JsonRpcProvider');
      }
      if (originalContent.includes('ethers_1.ethers.TypedDataEncoder') || originalContent.includes('ethers_1.TypedDataEncoder')) {
        console.log('   - Fixed TypedDataEncoder imports');
      }
    } else {
      console.log('⚠️  No changes needed or file already fixed upstream.');
    }

  } catch (error) {
    console.error('❌ Error patching OrbyProvider:', error.message);
    console.error('   Stack:', error.stack);
    // Don't fail the build if patching fails
    process.exit(0);
  }
}

// Run the patch
console.log('🔧 Patching @orb-labs/orby-ethers6...');
patchOrbyProvider();