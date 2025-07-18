import { readFileSync } from 'fs';
import { writeFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Read the JSON file
const jsonPath = '/Users/ardaerturk/Downloads/web3-apps-extended.json';
const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));

// Category mapping
const CATEGORY_MAP: Record<string, { name: string, slug: string, icon: string, position: number }> = {
  'defi-category-id': { name: 'DeFi', slug: 'defi', icon: '💰', position: 1 },
  'nft-category-id': { name: 'NFT', slug: 'nft', icon: '🖼️', position: 4 },
  'gaming-category-id': { name: 'Gaming', slug: 'gaming', icon: '🎮', position: 3 },
  'social-category-id': { name: 'Social', slug: 'social', icon: '💬', position: 6 },
  'tools-category-id': { name: 'Tools', slug: 'tools', icon: '🛠️', position: 2 },
  'dao-category-id': { name: 'DAO', slug: 'dao', icon: '🏛️', position: 5 },
  'bridge-category-id': { name: 'Bridge', slug: 'bridge', icon: '🌉', position: 7 },
  'gambling-category-id': { name: 'Gambling', slug: 'gambling', icon: '🎲', position: 8 },
  'charity-category-id': { name: 'Charity', slug: 'charity', icon: '❤️', position: 9 },
  'utilities-category-id': { name: 'Utilities', slug: 'utilities', icon: '⚙️', position: 10 }
};

// Generate SQL
let sql = `-- App Store Import SQL
-- Generated from web3-apps-extended.json

-- First, clear existing data
DELETE FROM "AppStoreApp";
DELETE FROM "AppStoreCategory";

-- Insert categories with fixed UUIDs
`;

// Category ID mapping for apps
const categoryIdMap: Record<string, string> = {};

// Generate categories SQL
Object.entries(CATEGORY_MAP).forEach(([jsonId, cat]) => {
  const id = uuidv4();
  categoryIdMap[jsonId] = id;
  
  sql += `INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES ('${id}', '${cat.name}', '${cat.slug}', '${cat.name} applications', '${cat.icon}', ${cat.position}, true, NOW(), NOW());\n`;
});

sql += '\n-- Insert apps\n';

// Generate apps SQL
jsonData.apps.forEach((app: any) => {
  const categoryId = categoryIdMap[app.categoryId];
  if (!categoryId) {
    console.warn(`Skipping app ${app.name} - unknown category: ${app.categoryId}`);
    return;
  }
  
  const id = uuidv4();
  const shareableId = Math.random().toString(36).substring(2, 15);
  
  // Escape single quotes in text fields
  const name = app.name.replace(/'/g, "''");
  const description = app.description.replace(/'/g, "''");
  const detailedDescription = app.detailedDescription.replace(/'/g, "''");
  const developer = app.developer.replace(/'/g, "''");
  
  // Default chain support
  const chainSupport = app.tags.includes('polygon') ? "'{\"1\",\"137\"}'" :
                      app.tags.includes('bsc') ? "'{\"1\",\"56\"}'" :
                      "'{\"1\"}'";
  
  const tags = `'{${app.tags.map((t: string) => `"${t}"`).join(',')}}'`;
  
  sql += `INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '${id}', '${name}', '${app.url}', '${app.iconUrl}', '${categoryId}', 
  '${description}', '${detailedDescription}', 
  ${tags}::text[], ${app.popularity}, ${app.isNew}, ${app.isFeatured}, 
  ${chainSupport}::text[], '{}', '${developer}', '${app.version}', 
  NOW(), '${shareableId}', ${app.isActive !== false}, NOW(), NOW()
);\n`;
});

// Add verification queries
sql += `
-- Verify import
SELECT COUNT(*) as category_count FROM "AppStoreCategory";
SELECT COUNT(*) as app_count FROM "AppStoreApp";
SELECT name, url FROM "AppStoreApp" WHERE name = 'Fileverse';
`;

// Write SQL file
const outputPath = '/Users/ardaerturk/Documents/GitHub/interspace-codebase/interspace-backend/scripts/app-store-import.sql';
writeFileSync(outputPath, sql);

console.log(`✅ SQL file generated: ${outputPath}`);
console.log(`📊 Stats:`);
console.log(`  - Categories: ${Object.keys(CATEGORY_MAP).length}`);
console.log(`  - Apps: ${jsonData.apps.length}`);
console.log('\nNow run:');
console.log('gcloud sql connect interspace-db-dev --user=postgres --database=interspace < scripts/app-store-import.sql');