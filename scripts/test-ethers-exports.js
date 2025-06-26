#!/usr/bin/env node

/**
 * Test script to verify ethers v6 CommonJS exports
 */

const ethers = require('ethers');

console.log('Testing ethers v6 CommonJS exports...\n');

// Test direct exports
const providers = [
  'JsonRpcProvider',
  'JsonRpcApiProvider',
  'AbstractProvider',
  'BrowserProvider',
  'AlchemyProvider'
];

console.log('Provider exports:');
providers.forEach(provider => {
  const exists = typeof ethers[provider] === 'function';
  console.log(`  ${provider}: ${exists ? '✅' : '❌'}`);
});

// Test other important exports
console.log('\nOther exports:');
const otherExports = [
  'TypedDataEncoder',
  'Contract',
  'Wallet',
  'utils',
  'ethers'
];

otherExports.forEach(exp => {
  const type = typeof ethers[exp];
  const exists = type !== 'undefined';
  console.log(`  ${exp}: ${exists ? '✅' : '❌'} (${type})`);
});

// Test instantiation
console.log('\nInstantiation test:');
try {
  const provider = new ethers.JsonRpcProvider('https://example.com');
  console.log('  JsonRpcProvider: ✅ Created successfully');
} catch (error) {
  console.log('  JsonRpcProvider: ❌', error.message);
}

// Test ethers.ethers namespace (for backward compatibility)
console.log('\nethers.ethers namespace:');
if (ethers.ethers) {
  console.log('  Exists: ✅');
  console.log('  Contains JsonRpcProvider:', typeof ethers.ethers.JsonRpcProvider === 'function' ? '✅' : '❌');
} else {
  console.log('  Exists: ❌');
}