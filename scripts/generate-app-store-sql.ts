import { readFileSync, writeFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Read the JSON file
const jsonPath = '/Users/ardaerturk/Downloads/web3-apps-extended.json';
const jsonData = JSON.parse(readFileSync(jsonPath, 'utf-8'));

// Category mapping
const CATEGORY_MAP: Record<string, { name: string; slug: string; icon: string; position: number }> = {
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
let sql = `-- App Store Data Import
-- Generated on ${new Date().toISOString()}

-- Clear existing data
DELETE FROM "AppStoreApp";
DELETE FROM "AppStoreCategory";

-- Insert categories
`;

// Generate category IDs
const categoryIds = new Map<string, string>();
Object.entries(CATEGORY_MAP).forEach(([jsonId, cat]) => {
  const id = uuidv4();
  categoryIds.set(jsonId, id);
  
  sql += `INSERT INTO "AppStoreCategory" ("id", "name", "slug", "description", "icon", "position", "isActive", "createdAt", "updatedAt") VALUES
('${id}', '${cat.name}', '${cat.slug}', '${cat.name} applications', '${cat.icon}', ${cat.position}, true, NOW(), NOW());
`;
});

sql += `
-- Insert apps
`;

// Generate apps
jsonData.apps.forEach((app: any) => {
  const categoryId = categoryIds.get(app.categoryId);
  if (!categoryId) {
    console.warn(`Unknown category: ${app.categoryId} for app: ${app.name}`);
    return;
  }
  
  const id = uuidv4();
  const shareableId = Math.random().toString(36).substring(2, 15);
  
  // Escape single quotes in text fields
  const escapeSql = (str: string) => str.replace(/'/g, "''");
  
  sql += `INSERT INTO "AppStoreApp" ("id", "name", "url", "iconUrl", "categoryId", "description", "detailedDescription", "tags", "popularity", "isNew", "isFeatured", "chainSupport", "screenshots", "developer", "version", "lastUpdated", "shareableId", "isActive", "createdAt", "updatedAt") VALUES
('${id}', '${escapeSql(app.name)}', '${app.url}', '${app.iconUrl}', '${categoryId}', '${escapeSql(app.description)}', '${escapeSql(app.detailedDescription)}', '{${app.tags.map((t: string) => `"${t}"`).join(',')}}', ${app.popularity}, ${app.isNew}, ${app.isFeatured}, '{"1"}', '{}', '${escapeSql(app.developer)}', '${app.version}', NOW(), '${shareableId}', ${app.isActive !== false}, NOW(), NOW());
`;
});

// Save to file
const outputPath = '/tmp/app-store-import.sql';
writeFileSync(outputPath, sql);

console.log(`✅ Generated SQL file: ${outputPath}`);
console.log(`📊 Categories: ${categoryIds.size}`);
console.log(`📱 Apps: ${jsonData.apps.length}`);
console.log(`\nNow run:`);
console.log(`gcloud sql import sql interspace-db-dev gs://YOUR_BUCKET/app-store-import.sql --database=interspace`);
console.log(`\nOr upload to Cloud Shell and run there.`);