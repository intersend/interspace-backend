#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to calculate relative path from source to target
function calculateRelativePath(fromFile, toFile) {
  const fromDir = path.dirname(fromFile);
  let relativePath = path.relative(fromDir, toFile);
  
  // Ensure it starts with './' if it doesn't go up directories
  if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
    relativePath = './' + relativePath;
  }
  
  return relativePath;
}

// Function to resolve @/ alias to actual path
function resolveAlias(importPath, currentFile) {
  if (importPath.startsWith('@/')) {
    // @/ maps to src/
    const actualPath = importPath.replace('@/', 'src/');
    const projectRoot = path.resolve(__dirname, '..');
    const targetFile = path.join(projectRoot, actualPath);
    const relativePath = calculateRelativePath(currentFile, targetFile);
    
    // Remove .ts extension if present in the calculated path
    return relativePath.replace(/\.ts$/, '');
  }
  return importPath;
}

// Function to fix imports in a file
function fixImportsInFile(filePath) {
  console.log(`Processing: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Match various import patterns
  const importPatterns = [
    // import { something } from '@/...'
    /import\s+{[^}]+}\s+from\s+['"](@\/[^'"]+)['"]/g,
    // import something from '@/...'
    /import\s+\w+\s+from\s+['"](@\/[^'"]+)['"]/g,
    // import * as something from '@/...'
    /import\s+\*\s+as\s+\w+\s+from\s+['"](@\/[^'"]+)['"]/g,
    // export { something } from '@/...'
    /export\s+{[^}]+}\s+from\s+['"](@\/[^'"]+)['"]/g,
    // export * from '@/...'
    /export\s+\*\s+from\s+['"](@\/[^'"]+)['"]/g,
    // const something = require('@/...')
    /require\(['"](@\/[^'"]+)['"]\)/g,
  ];
  
  for (const pattern of importPatterns) {
    content = content.replace(pattern, (match, importPath) => {
      const resolvedPath = resolveAlias(importPath, filePath);
      if (resolvedPath !== importPath) {
        modified = true;
        console.log(`  ${importPath} -> ${resolvedPath}`);
        return match.replace(importPath, resolvedPath);
      }
      return match;
    });
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  ✓ Fixed imports in ${path.basename(filePath)}`);
  } else {
    console.log(`  ✓ No @/ imports found in ${path.basename(filePath)}`);
  }
}

// Function to recursively find all TypeScript files
function findTypeScriptFiles(dir) {
  const files = [];
  
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory() && entry.name !== 'node_modules') {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

// Main execution
const testHubDir = path.resolve(__dirname, '..', 'tests', 'test-hub');

console.log('Fixing TypeScript path aliases in test-hub directory...\n');

const tsFiles = findTypeScriptFiles(testHubDir);
console.log(`Found ${tsFiles.length} TypeScript files\n`);

for (const file of tsFiles) {
  fixImportsInFile(file);
}

console.log('\n✅ All TypeScript path aliases have been fixed in test-hub!');