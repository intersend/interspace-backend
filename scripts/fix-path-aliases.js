#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

/**
 * Convert a path alias import to a relative import
 */
function convertPathAlias(importPath, currentFile) {
  // Remove @/ prefix
  const aliasPath = importPath.replace(/^@\//, '');
  
  // Get the directory of the current file
  const currentDir = path.dirname(currentFile);
  
  // Calculate the relative path from current file to src
  const srcPath = path.join(__dirname, '..', 'src');
  const relativePath = path.relative(currentDir, srcPath);
  
  // Construct the new import path
  let newPath = path.join(relativePath, aliasPath);
  
  // Normalize the path and ensure it starts with ./ or ../
  newPath = newPath.replace(/\\/g, '/');
  if (!newPath.startsWith('.')) {
    newPath = './' + newPath;
  }
  
  return newPath;
}

/**
 * Process a single file
 */
function processFile(filePath) {
  console.log(`Processing: ${filePath}`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Match import statements with @/ aliases
  const importRegex = /^import\s+(.+?)\s+from\s+['"](@\/[^'"]+)['"]/gm;
  content = content.replace(importRegex, (match, imports, importPath) => {
    const newPath = convertPathAlias(importPath, filePath);
    modified = true;
    return `import ${imports} from '${newPath}'`;
  });
  
  // Match require statements with @/ aliases
  const requireRegex = /require\(['"](@\/[^'"]+)['"]\)/g;
  content = content.replace(requireRegex, (match, importPath) => {
    const newPath = convertPathAlias(importPath, filePath);
    modified = true;
    return `require('${newPath}')`;
  });
  
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ Fixed imports in ${filePath}`);
  }
}

// Main execution
console.log('Fixing TypeScript path aliases...\n');

// Find all TypeScript and JavaScript files
const files = glob.sync('src/**/*.{ts,js}', {
  cwd: path.join(__dirname, '..'),
  absolute: true
});

let count = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('@/')) {
    processFile(file);
    count++;
  }
}

console.log(`\n✅ Fixed ${count} files with path aliases`);
console.log('\nNow run "npm run build" to rebuild the project');