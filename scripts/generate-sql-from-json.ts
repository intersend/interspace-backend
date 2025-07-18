import { readFileSync, writeFileSync } from 'fs';

interface AppData {
  name: string;
  url: string;
  iconUrl: string;
  categoryId: string;
  description: string;
  detailedDescription: string;
  tags: string[];
  popularity: number;
  isNew: boolean;
  isFeatured: boolean;
  developer: string;
  version: string;
  isActive: boolean;
}

// Category mapping
const CATEGORY_MAP: Record<string, { id: string, name: string }> = {
  'defi-category-id': { id: 'cat_defi', name: 'DeFi' },
  'nft-category-id': { id: 'cat_nft', name: 'NFT' },
  'gaming-category-id': { id: 'cat_gaming', name: 'Gaming' },
  'social-category-id': { id: 'cat_social', name: 'Social' },
  'tools-category-id': { id: 'cat_tools', name: 'Tools' },
  'dao-category-id': { id: 'cat_dao', name: 'DAO' },
  'bridge-category-id': { id: 'cat_bridge', name: 'Bridge' },
  'gambling-category-id': { id: 'cat_gambling', name: 'Gambling' },
  'charity-category-id': { id: 'cat_charity', name: 'Charity' },
  'utilities-category-id': { id: 'cat_utilities', name: 'Utilities' }
};

// Read JSON file
const jsonContent = readFileSync('/Users/ardaerturk/Downloads/web3-apps-extended.json', 'utf-8');
const { apps } = JSON.parse(jsonContent);

// SQL header
let sql = `-- App Store Data Import
-- Generated from web3-apps-extended.json

-- Clear existing data
DELETE FROM "AppStoreApp";
DELETE FROM "AppStoreCategory";

-- Insert categories
INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES
('cat_defi', 'DeFi', 'defi', 'Decentralized Finance applications', '💰', 1, true, NOW(), NOW()),
('cat_tools', 'Tools', 'tools', 'Utilities and productivity tools', '🛠️', 2, true, NOW(), NOW()),
('cat_gaming', 'Gaming', 'gaming', 'Web3 gaming and metaverse', '🎮', 3, true, NOW(), NOW()),
('cat_nft', 'NFT', 'nft', 'NFT marketplaces and tools', '🖼️', 4, true, NOW(), NOW()),
('cat_dao', 'DAO', 'dao', 'Decentralized Autonomous Organizations', '🏛️', 5, true, NOW(), NOW()),
('cat_social', 'Social', 'social', 'Social platforms and communities', '💬', 6, true, NOW(), NOW()),
('cat_bridge', 'Bridge', 'bridge', 'Cross-chain bridges', '🌉', 7, true, NOW(), NOW()),
('cat_gambling', 'Gambling', 'gambling', 'Gambling and prediction markets', '🎲', 8, true, NOW(), NOW()),
('cat_charity', 'Charity', 'charity', 'Charitable applications', '❤️', 9, true, NOW(), NOW()),
('cat_utilities', 'Utilities', 'utilities', 'Utility applications', '⚙️', 10, true, NOW(), NOW());

-- Insert apps
`;

// Process apps in batches
const BATCH_SIZE = 10;
for (let i = 0; i < apps.length; i += BATCH_SIZE) {
  const batch = apps.slice(i, i + BATCH_SIZE);
  
  sql += `INSERT INTO "AppStoreApp" (id, name, url, "iconUrl", "categoryId", description, "detailedDescription", tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, developer, version, "lastUpdated", "shareableId", "isActive", "createdAt", "updatedAt") VALUES\n`;
  
  const values = batch.map((app: AppData, index: number) => {
    const category = CATEGORY_MAP[app.categoryId];
    if (!category) {
      console.warn(`Unknown category: ${app.categoryId} for app: ${app.name}`);
      return null;
    }
    
    // Escape single quotes in strings
    const escape = (str: string) => str.replace(/'/g, "''");
    
    // Default chains based on tags
    const chains = ['1']; // Default to Ethereum
    if (app.tags.includes('polygon')) chains.push('137');
    if (app.tags.includes('bsc')) chains.push('56');
    if (app.tags.includes('arbitrum')) chains.push('42161');
    
    const isLast = index === batch.length - 1 && i + BATCH_SIZE >= apps.length;
    
    return `(gen_random_uuid(), '${escape(app.name)}', '${escape(app.url)}', '${escape(app.iconUrl)}', '${category.id}', '${escape(app.description)}', '${escape(app.detailedDescription)}', ARRAY[${app.tags.map(t => `'${escape(t)}'`).join(', ')}], ${app.popularity}, ${app.isNew}, ${app.isFeatured}, ARRAY[${chains.map(c => `'${c}'`).join(', ')}], ARRAY[]::text[], '${escape(app.developer)}', '${escape(app.version)}', NOW(), SUBSTR(MD5(RANDOM()::TEXT), 1, 13), ${app.isActive}, NOW(), NOW())${isLast ? ';' : ','}`;
  }).filter(Boolean).join('\n');
  
  sql += values + '\n\n';
}

// Add verification query
sql += `
-- Verify import
SELECT 
  c.name as category,
  COUNT(a.id) as app_count
FROM "AppStoreCategory" c
LEFT JOIN "AppStoreApp" a ON a."categoryId" = c.id
GROUP BY c.name
ORDER BY c.position;

-- Check specific apps
SELECT name, url FROM "AppStoreApp" WHERE name IN ('Fileverse', 'Uniswap', 'PancakeSwap');

-- Total count
SELECT COUNT(*) as total_apps FROM "AppStoreApp";
`;

// Write SQL file
writeFileSync('./scripts/app-store-complete.sql', sql);
console.log('✅ SQL file generated: scripts/app-store-complete.sql');
console.log(`📊 Total apps: ${apps.length}`);