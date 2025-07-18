-- App Store Import SQL
-- Generated from web3-apps-extended.json

-- First, clear existing data
DELETE FROM "AppStoreApp";
DELETE FROM "AppStoreCategory";

-- Insert categories with fixed UUIDs
INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES ('4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 'DeFi', 'defi', 'DeFi applications', '💰', 1, true, NOW(), NOW());
INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES ('c5ec7050-6aeb-432f-95d0-74227403a495', 'NFT', 'nft', 'NFT applications', '🖼️', 4, true, NOW(), NOW());
INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES ('85af3145-99ae-4882-af58-a6433c2b9d0c', 'Gaming', 'gaming', 'Gaming applications', '🎮', 3, true, NOW(), NOW());
INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES ('830bbdf6-0c2b-4f46-a4da-a2a881742002', 'Social', 'social', 'Social applications', '💬', 6, true, NOW(), NOW());
INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES ('ffea6c55-4295-4047-ae2c-13aae0767237', 'Tools', 'tools', 'Tools applications', '🛠️', 2, true, NOW(), NOW());
INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES ('4ee01855-2971-4f2b-876d-488b5a2f3c4b', 'DAO', 'dao', 'DAO applications', '🏛️', 5, true, NOW(), NOW());
INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES ('71d895f4-6cfb-4b50-ba07-b8da1ec35547', 'Bridge', 'bridge', 'Bridge applications', '🌉', 7, true, NOW(), NOW());
INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES ('9d6da9a9-e5cf-488a-bad3-60cd8f8f3705', 'Gambling', 'gambling', 'Gambling applications', '🎲', 8, true, NOW(), NOW());
INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES ('05d8be2e-b558-439f-85b6-cb91a4aafe20', 'Charity', 'charity', 'Charity applications', '❤️', 9, true, NOW(), NOW());
INSERT INTO "AppStoreCategory" (id, name, slug, description, icon, position, "isActive", "createdAt", "updatedAt") VALUES ('3d271fe2-007d-4659-a353-b739ed80f2e3', 'Utilities', 'utilities', 'Utilities applications', '⚙️', 10, true, NOW(), NOW());

-- Insert apps
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'a9d2ffcf-3bc6-4e2c-a7a8-9b65622fb244', 'Uniswap', 'https://app.uniswap.org', 'https://cdn.brandfetch.io/idoYtBNi2C/w/800/h/868/theme/dark/idCjO30I1a.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Leading DEX for token swaps', 'Uniswap is the leading decentralized exchange protocol that allows users to swap ERC-20 tokens on Ethereum, Base, Arbitrum, Polygon, and other chains. Trusted by millions with the highest liquidity and best rates.', 
  '{"dex","swap","defi","ethereum"}'::text[], 950, false, true, 
  '{"1"}'::text[], '{}', 'Uniswap Labs', '4.0', 
  NOW(), 'pys1s4f9di', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '65535f8b-f906-454e-acb5-671f5626f43c', 'PancakeSwap', 'https://pancakeswap.finance', 'https://cdn.brandfetch.io/id-xm27CRB/w/512/h/512/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Leading BSC DEX with yield farming', 'PancakeSwap is the top decentralized exchange on BNB Smart Chain, offering trading, yield farming, staking, and lottery features. Trade, earn, and win crypto on the all-in-one multichain DEX.', 
  '{"dex","bsc","yield farming","defi"}'::text[], 850, false, true, 
  '{"1","56"}'::text[], '{}', 'PancakeSwap', '3.0', 
  NOW(), '0wwd374885xq', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'c344a877-0c0f-40e0-adf0-c729481b61ef', 'OpenSea', 'https://opensea.io', 'https://assets.coingecko.com/coins/images/12271/large/512x512_Logo_no_chop.png', 'c5ec7050-6aeb-432f-95d0-74227403a495', 
  'Leading NFT marketplace', 'OpenSea is a major NFT marketplace where you can discover, buy, sell, and trade NFTs. From art and music to domain names and virtual worlds, explore a vast collection of NFTs.', 
  '{"nft","marketplace","ethereum","polygon"}'::text[], 900, false, true, 
  '{"1","137"}'::text[], '{}', 'OpenSea', '2.0', 
  NOW(), '9k47eiev01a', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '8b11472f-834b-4248-9731-3c9d023d6c31', 'Aave', 'https://app.aave.com', 'https://assets.coingecko.com/coins/images/12645/large/AAVE.png', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Decentralized lending and borrowing protocol', 'Aave is a decentralized non-custodial liquidity market protocol where users can participate as depositors or borrowers. Earn interest on deposits and borrow assets at variable or stable rates.', 
  '{"lending","borrowing","defi","ethereum"}'::text[], 820, false, true, 
  '{"1"}'::text[], '{}', 'Aave Labs', '3.0', 
  NOW(), 't4212y9dcco', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '30da7032-9f64-41c5-87ef-de61a79bc9c6', 'Lido', 'https://lido.fi', 'https://cdn.brandfetch.io/idUE_o4e-p/w/820/h/217/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Liquid staking protocol', 'Lido is a liquid staking solution for Ethereum 2.0. Stake your ETH with no minimum amount and receive stETH while retaining liquidity for DeFi activities.', 
  '{"staking","ethereum","liquid","steth"}'::text[], 840, false, true, 
  '{"1"}'::text[], '{}', 'Lido DAO', '2.0', 
  NOW(), '5rkscnk6s6s', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'd66c1fef-d883-4f3c-b459-c14939366d01', 'Balancer', 'https://balancer.fi/pools', 'https://cdn.brandfetch.io/idwHnOTmw2/w/820/h/155/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Automated portfolio manager and DEX', 'Balancer is a decentralized automated market maker that allows users to create custom liquidity pools with multiple tokens and earn fees while maintaining exposure to their assets.', 
  '{"dex","amm","portfolio","liquidity"}'::text[], 460, false, false, 
  '{"1"}'::text[], '{}', 'Balancer Labs', '2.0', 
  NOW(), 'outwv8clq3', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'bda66dc5-015b-48dc-82f8-9f65b7fad83c', 'Yearn Finance', 'https://yearn.fi/v3', 'https://cdn.brandfetch.io/id6rYjTMh6/w/640/h/640/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'DeFi yield optimization protocol', 'Yearn Finance is a decentralized ecosystem of aggregators for lending services such as Aave, Compound, and others. It automatically moves funds between protocols to maximize yields.', 
  '{"yield","farming","optimization","defi"}'::text[], 420, false, false, 
  '{"1"}'::text[], '{}', 'Yearn Finance', '3.0', 
  NOW(), 'tuv7togmlch', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '6780bc99-a355-4c04-8824-58eab6caac54', 'Velora', 'https://app.velora.xyz', 'https://cdn.brandfetch.io/iduqoSolxG/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Multi-chain DEX aggregator', 'Velora (formerly ParaSwap) aggregates decentralized exchanges and other DeFi services to offer users the best prices and liquidity across multiple blockchains.', 
  '{"aggregator","multichain","dex","swap"}'::text[], 300, false, false, 
  '{"1"}'::text[], '{}', 'Velora', '1.0', 
  NOW(), 'hsr5tuupn5o', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '2dec0db9-62e8-4d6d-bd6e-1dbf194fb664', 'Cowswap', 'https://swap.cow.fi', 'https://cdn.brandfetch.io/idLSPiiIbP/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'MEV protection trading protocol', 'CoW Swap is a DEX aggregator that protects traders from MEV by batching orders and finding better prices through coincidence of wants and DEX liquidity.', 
  '{"dex","mev protection","aggregator","ethereum"}'::text[], 380, false, false, 
  '{"1"}'::text[], '{}', 'CoW Protocol', '2.0', 
  NOW(), 'gpehuxm1vhb', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '825fda50-8d35-4b47-b18d-08748254ffff', 'GMX', 'https://app.gmx.io', 'https://cdn.brandfetch.io/id27qr88zw/w/57/h/57/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Decentralized perpetual exchange', 'GMX is a decentralized spot and perpetual exchange that supports low swap fees and zero price impact trades. Trade with up to 50x leverage directly from your wallet.', 
  '{"perpetuals","leverage","trading","arbitrum"}'::text[], 580, false, true, 
  '{"1"}'::text[], '{}', 'GMX DAO', '2.0', 
  NOW(), 'y1179edxhla', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '241568a0-1ee9-4266-8eae-e2a1764a7a42', 'Spark', 'https://app.spark.fi', 'https://cdn.brandfetch.io/idI9wH6gDn/w/820/h/248/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Decentralized credit platform', 'Spark Protocol enables the generation of DAI and other stablecoins. Borrow against collateral and participate in governance of the protocol.', 
  '{"lending","dai","credit","governance"}'::text[], 480, false, false, 
  '{"1"}'::text[], '{}', 'Spark Protocol', '1.0', 
  NOW(), 'bkdhe58ixvq', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'bd50e082-b42c-4f3f-a6de-1215108645c2', 'Aura Finance', 'https://app.aura.finance', 'https://cdn.brandfetch.io/idNwEcOpon/w/64/h/64/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Balancer yield farming optimization', 'Aura Finance is a protocol built on top of Balancer that allows BAL and veBAL holders to maximize their yields through vlAURA tokenomics.', 
  '{"yield","balancer","optimization","voting"}'::text[], 320, false, false, 
  '{"1"}'::text[], '{}', 'Aura Finance', '1.0', 
  NOW(), 'g9qfjp6c8fg', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '383a1eac-0ece-4448-8410-87a01096e0cd', 'Aerodrome', 'https://aerodrome.finance', 'https://cdn.brandfetch.io/idWHg9Zf5A/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Base chain DEX and liquidity hub', 'Aerodrome is the central trading and liquidity marketplace on Base, featuring next-generation AMM and ve(3,3) tokenomics for sustainable yields.', 
  '{"dex","base","ve33","liquidity"}'::text[], 340, false, false, 
  '{"1"}'::text[], '{}', 'Aerodrome Finance', '1.0', 
  NOW(), 'y8mqqjz7d2', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'ea8d70db-d6a6-4159-86c7-eded155f0736', 'Frax', 'https://app.frax.finance', 'https://cdn.brandfetch.io/idD__GqZkx/w/57/h/57/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Fractional-algorithmic stablecoin protocol', 'Frax is the first fractional-algorithmic stablecoin system featuring FRAX (stablecoin), FXS (governance), and Frax Ether (liquid staking).', 
  '{"stablecoin","algorithmic","governance","staking"}'::text[], 360, false, false, 
  '{"1"}'::text[], '{}', 'Frax Finance', '2.0', 
  NOW(), '89w0dmig5q4', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '05ae7eb0-b4dc-40ac-914f-2212bd9dd5b9', 'Syrup Finance', 'https://syrup.fi/lend', 'https://cdn.brandfetch.io/idPS3K0-pC/w/820/h/820/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Cross-chain lending protocol', 'Syrup Finance is a decentralized lending protocol that enables users to lend and borrow crypto assets across multiple blockchains.', 
  '{"lending","cross-chain","borrowing","yield"}'::text[], 200, false, false, 
  '{"1"}'::text[], '{}', 'Syrup Finance', '1.0', 
  NOW(), 'v3rx828giij', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '5e9a39e0-8a25-47ac-a45f-e9d0c663a659', 'Liquity', 'https://app.lqty.io', 'https://cdn.brandfetch.io/idGun0wZQA/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Zero-interest borrowing protocol', 'Liquity is a decentralized borrowing protocol that allows you to draw 0% interest loans against Ether used as collateral with LUSD stablecoin.', 
  '{"borrowing","zero interest","lusd","ethereum"}'::text[], 280, false, false, 
  '{"1"}'::text[], '{}', 'Liquity AG', '1.0', 
  NOW(), 'blnj8kp5h4', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'b5dd79ae-5b30-45ea-be08-9bb502e7f9d6', 'LlamaSwap', 'https://swap.defillama.com', 'https://cdn.brandfetch.io/idcbO3xegp/w/160/h/53/theme/light/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'DEX aggregator by DeFiLlama', 'LlamaSwap aggregates liquidity from major DEXs to provide users with the best swap rates across multiple chains with minimal slippage.', 
  '{"aggregator","dex","multichain","defillama"}'::text[], 250, false, false, 
  '{"1"}'::text[], '{}', 'DeFiLlama', '1.0', 
  NOW(), 's4l0dlsxfyl', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'd75ea6bd-82fe-4e8a-b63f-39a072af8350', 'Hitdex', 'https://www.hitdex.com', 'https://cdn.brandfetch.io/idvCUZmny-/w/192/h/192/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Advanced trading platform', 'HitDEX is a professional trading platform offering advanced features for cryptocurrency trading with institutional-grade tools and analytics.', 
  '{"trading","professional","analytics","dex"}'::text[], 180, false, false, 
  '{"1"}'::text[], '{}', 'HitDEX', '1.0', 
  NOW(), 't57h4fold2', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'a0309049-1647-41c0-bc74-32319bdf40fa', 'Jumper Exchange', 'https://jumper.exchange', 'https://cdn.brandfetch.io/idPUz-VrHQ/w/57/h/57/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '71d895f4-6cfb-4b50-ba07-b8da1ec35547', 
  'Cross-chain bridge and swap', 'Jumper Exchange provides seamless cross-chain swaps and bridging services, connecting multiple blockchains for efficient asset transfers.', 
  '{"bridge","cross-chain","swap","multichain"}'::text[], 320, false, false, 
  '{"1"}'::text[], '{}', 'Li.Fi', '2.0', 
  NOW(), 't28anum6cyk', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'd44b0a4b-6946-4546-a8cf-a5354da7d266', 'Cabana (PoolTogether)', 'https://app.cabana.fi', 'https://cdn.brandfetch.io/idmb-jvDfQ/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '9d6da9a9-e5cf-488a-bad3-60cd8f8f3705', 
  'No-loss prize savings protocol', 'Cabana is the interface for PoolTogether, a no-loss prize game where you can win by saving. Deposit crypto to earn yield and have chances to win prizes.', 
  '{"savings","prizes","no-loss","yield"}'::text[], 240, false, false, 
  '{"1"}'::text[], '{}', 'PoolTogether', '5.0', 
  NOW(), 'sw6rtyqqx39', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '48beabfe-85cd-4ed3-978c-06ce0d9bb6a9', 'ETHFollow', 'https://www.ethfollow.xyz', 'https://cdn.brandfetch.io/idMO87zWK_/w/820/h/376/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '830bbdf6-0c2b-4f46-a4da-a2a881742002', 
  'Ethereum-based social following', 'ETHFollow is a decentralized social platform that enables users to follow and connect with Ethereum addresses and their on-chain activities.', 
  '{"social","ethereum","following","onchain"}'::text[], 150, false, false, 
  '{"1"}'::text[], '{}', 'ETHFollow', '1.0', 
  NOW(), 'zrzyi3igz9', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'ed62b996-2852-4cb6-86f1-311aef27ada9', 'Veil', 'https://www.veil.cash/app', 'https://cdn.brandfetch.io/idPSRvRDfm/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '3d271fe2-007d-4659-a353-b739ed80f2e3', 
  'Privacy-focused cryptocurrency platform', 'Veil provides privacy-focused tools and services for cryptocurrency users, enabling anonymous transactions and enhanced privacy features.', 
  '{"privacy","anonymous","transactions","security"}'::text[], 160, false, false, 
  '{"1"}'::text[], '{}', 'Veil', '1.0', 
  NOW(), '67vtvrblo1f', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '0a68a111-f8e7-4a4c-b2d4-06ef595e47c1', 'Smol', 'https://smold.app', 'https://cdn.brandfetch.io/idmhSsWOIR/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '3d271fe2-007d-4659-a353-b739ed80f2e3', 
  'Simple DeFi portfolio tracker', 'Smol is a minimalist DeFi portfolio tracker that helps users monitor their positions across various protocols with a clean, simple interface.', 
  '{"portfolio","tracker","defi","simple"}'::text[], 140, false, false, 
  '{"1"}'::text[], '{}', 'Smol', '1.0', 
  NOW(), '0dua713dnffk', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'fbe0b26f-edfb-4d40-bc3e-4d0dbdb6c7e0', 'Revoke Cash', 'https://revoke.cash', 'https://cdn.brandfetch.io/idHz8grwuM/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '3d271fe2-007d-4659-a353-b739ed80f2e3', 
  'Token approval management tool', 'Revoke.cash helps users manage and revoke token approvals to protect against smart contract risks and unauthorized spending of tokens.', 
  '{"security","approvals","revoke","protection"}'::text[], 300, false, false, 
  '{"1"}'::text[], '{}', 'Revoke.cash', '2.0', 
  NOW(), 'duxtz25c1cs', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '778659c6-2e89-43a6-ae38-0bf5357967ec', 'Peanut', 'https://peanut.to', 'https://cdn.brandfetch.io/idcHSKYYLd/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '3d271fe2-007d-4659-a353-b739ed80f2e3', 
  'Send crypto via links', 'Peanut Protocol allows users to send cryptocurrency to anyone via shareable links, making crypto transfers as easy as sending a message.', 
  '{"payments","links","send","crypto"}'::text[], 220, false, false, 
  '{"1"}'::text[], '{}', 'Peanut Protocol', '1.0', 
  NOW(), 'dr3bahznc0c', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '02ce13dc-fceb-4b58-9432-6d5e88c15010', 'Dump Services', 'https://dump.services', 'https://cdn.brandfetch.io/idKxhPUm-F/w/192/h/192/theme/light/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '3d271fe2-007d-4659-a353-b739ed80f2e3', 
  'Crypto data and analytics platform', 'Dump Services provides comprehensive crypto market data, analytics, and tools for traders and investors to make informed decisions.', 
  '{"analytics","data","trading","tools"}'::text[], 120, false, false, 
  '{"1"}'::text[], '{}', 'Dump Services', '1.0', 
  NOW(), '9zqi38kcg8', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'e95e11b9-6caa-46be-8f6e-a011c321380c', 'Convex Finance', 'https://www.convexfinance.com', 'https://cdn.brandfetch.io/idwBaTaxSd/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Curve yield optimization platform', 'Convex Finance allows Curve liquidity providers to earn boosted CRV rewards and additional yield through simplified staking mechanisms.', 
  '{"curve","yield","optimization","crv"}'::text[], 400, false, false, 
  '{"1"}'::text[], '{}', 'Convex Finance', '1.0', 
  NOW(), '4zevuw96jb', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'bbf12aab-dff3-460c-a54c-811eb9c16b51', 'Polymarket', 'https://polymarket.com', 'https://cdn.brandfetch.io/idnft8znqj/w/223/h/223/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '9d6da9a9-e5cf-488a-bad3-60cd8f8f3705', 
  'Information markets platform', 'Polymarket is a decentralized information markets platform where users can trade on the outcome of future events and access crowd-sourced predictions.', 
  '{"prediction markets","betting","information","events"}'::text[], 450, false, true, 
  '{"1"}'::text[], '{}', 'Polymarket', '2.0', 
  NOW(), 'jpwp9w125z', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '59116e68-f705-42df-97bb-7d3bed5301cd', 'Hyperliquid', 'https://app.hyperliquid.xyz', 'https://cdn.brandfetch.io/idGSMNVeGY/theme/dark/logo.svg?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'High-performance perpetuals DEX', 'Hyperliquid is a performant on-chain perpetuals DEX with a fully on-chain order book, offering institutional-grade trading with decentralized infrastructure.', 
  '{"perpetuals","orderbook","high-performance","dex"}'::text[], 380, false, true, 
  '{"1"}'::text[], '{}', 'Hyperliquid', '1.0', 
  NOW(), 'b6kd7ts5snp', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'df4c76c0-d869-4f47-a684-9655b8076492', 'Aevo', 'https://www.aevo.xyz', 'https://cdn.brandfetch.io/idA8ZwkgIE/w/32/h/32/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Options and perpetuals trading', 'Aevo is a decentralized derivatives exchange focusing on options and perpetuals, built on Ethereum with high-performance order matching.', 
  '{"options","perpetuals","derivatives","ethereum"}'::text[], 280, false, false, 
  '{"1"}'::text[], '{}', 'Aevo', '2.0', 
  NOW(), 'knatkf338in', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '8b99daea-c25f-4b0e-bb95-5fc45225089e', 'Rango Exchange', 'https://rango.exchange', 'https://cdn.brandfetch.io/idosqq83r6/w/256/h/256/theme/dark/icon.png?c=1bxidt_pGEUfCWkOXrVZ3', '71d895f4-6cfb-4b50-ba07-b8da1ec35547', 
  'Cross-chain DEX aggregator', 'Rango Exchange is a cross-chain DEX aggregator that finds the best routes for swapping tokens across different blockchains with optimal prices.', 
  '{"cross-chain","aggregator","swap","bridge"}'::text[], 200, false, false, 
  '{"1"}'::text[], '{}', 'Rango Exchange', '1.0', 
  NOW(), 'pcustucfqs9', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '5c5ce328-0006-4e0e-ac00-01ff3855115e', 'DexScreener', 'https://dexscreener.com', 'https://cdn.brandfetch.io/idCmqPr_mu/w/180/h/180/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '3d271fe2-007d-4659-a353-b739ed80f2e3', 
  'Real-time DEX trading data', 'DexScreener provides real-time trading data, charts, and analytics for tokens across multiple DEXs and blockchains.', 
  '{"analytics","dex","charts","trading"}'::text[], 380, false, false, 
  '{"1"}'::text[], '{}', 'DexScreener', '1.0', 
  NOW(), '455mvfneoqm', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'c209eca1-370a-4fb5-8311-406b4f2da256', 'Gas.zip', 'https://www.gas.zip', 'https://cdn.brandfetch.io/idd60CX8aD/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '3d271fe2-007d-4659-a353-b739ed80f2e3', 
  'Cross-chain gas fee management', 'Gas.zip provides tools for managing and optimizing gas fees across different blockchains, helping users save on transaction costs.', 
  '{"gas","optimization","cross-chain","fees"}'::text[], 160, false, false, 
  '{"1"}'::text[], '{}', 'Gas.zip', '1.0', 
  NOW(), '7j430lisfa3', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '133c5a61-70c5-4c47-99a3-0aef6d812609', 'Sideshift', 'https://sideshift.ai', 'https://cdn.brandfetch.io/idEcImrimn/w/400/h/400/theme/dark/icon.png?c=1bxidt_pGEUfCWkOXrVZ3', '71d895f4-6cfb-4b50-ba07-b8da1ec35547', 
  'No-registration crypto exchange', 'SideShift AI is a cryptocurrency exchange service that requires no registration, allowing users to swap between different cryptocurrencies quickly and privately.', 
  '{"exchange","no-kyc","privacy","swap"}'::text[], 220, false, false, 
  '{"1"}'::text[], '{}', 'SideShift AI', '1.0', 
  NOW(), 'hpqpo6z4ey5', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '850e7080-0ccc-42ed-a2ff-a396cde33344', 'DeFiSaver', 'https://app.defisaver.com', 'https://cdn.brandfetch.io/id1SQOByUt/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'DeFi position management platform', 'DeFiSaver is a management platform for DeFi positions, offering automation, leverage management, and advanced features for protocols like MakerDAO and Aave.', 
  '{"management","automation","leverage","defi"}'::text[], 260, false, false, 
  '{"1"}'::text[], '{}', 'DeFiSaver', '2.0', 
  NOW(), 'hpvtgea4mf', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '4ef4f512-cb4f-474f-80a0-4a389c960470', 'Definitive Fi', 'https://app.definitive.fi', 'https://cdn.brandfetch.io/idlhMnovwo/w/1361/h/155/theme/light/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'DeFi yield farming automation', 'Definitive Fi provides automated yield farming strategies and DeFi portfolio management tools to maximize returns across multiple protocols.', 
  '{"automation","yield farming","portfolio","optimization"}'::text[], 140, false, false, 
  '{"1"}'::text[], '{}', 'Definitive Fi', '1.0', 
  NOW(), '6iqr5zpmo2u', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '514e798f-8216-45ac-90c6-729fac7d57a8', 'Endaoment', 'https://app.endaoment.org', 'https://cdn.brandfetch.io/idRqYgbk3m/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '05d8be2e-b558-439f-85b6-cb91a4aafe20', 
  'Crypto donation platform', 'Endaoment is a community-driven platform that facilitates cryptocurrency donations to nonprofits and charitable causes with full transparency.', 
  '{"charity","donations","nonprofit","transparency"}'::text[], 100, false, false, 
  '{"1"}'::text[], '{}', 'Endaoment', '1.0', 
  NOW(), 'wyd7owhc8ic', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'f3dded58-5095-4cb4-a2c4-67729555687c', 'Catalog', 'https://catalog.works', 'https://cdn.brandfetch.io/idCbC54awX/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '3d271fe2-007d-4659-a353-b739ed80f2e3', 
  'Creator economy platform', 'Catalog is a decentralized platform for creators to monetize their work through NFTs and direct fan support with built-in creator tools.', 
  '{"creator","nft","monetization","platform"}'::text[], 120, false, false, 
  '{"1"}'::text[], '{}', 'Catalog', '1.0', 
  NOW(), 'xk8ucyyor8', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '1f853619-747e-4ed2-afd8-0ef7353133f5', 'Crosscurve', 'https://app.crosscurve.fi', 'https://app.crosscurve.fi/favicon.ico', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Cross-chain yield farming', 'Crosscurve provides cross-chain yield farming opportunities and liquidity mining across multiple blockchains with optimized strategies.', 
  '{"cross-chain","yield farming","liquidity","optimization"}'::text[], 110, false, false, 
  '{"1"}'::text[], '{}', 'Crosscurve', '1.0', 
  NOW(), 'zdywzwq0vys', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'c33426b3-9318-4e3f-ba84-1ee3c398c29d', 'Gains Trade', 'https://gains.trade', 'https://cdn.brandfetch.io/idxEDB9FTt/w/820/h/876/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Leveraged trading platform', 'Gains Trade offers leveraged trading for cryptocurrencies, forex, and stocks with decentralized infrastructure and competitive spreads.', 
  '{"leverage","trading","forex","stocks"}'::text[], 200, false, false, 
  '{"1"}'::text[], '{}', 'Gains Network', '1.0', 
  NOW(), 'l8xg0q2frd', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'a6d41560-9405-4a22-98fc-bf61e0ec45b7', 'LlamaPay', 'https://llamapay.io', 'https://cdn.brandfetch.io/id8ra3JLsn/w/400/h/400/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '3d271fe2-007d-4659-a353-b739ed80f2e3', 
  'Money streaming protocol', 'LlamaPay enables continuous money streaming, allowing users to stream payments in real-time rather than traditional lump-sum transfers.', 
  '{"streaming","payments","continuous","salary"}'::text[], 130, false, false, 
  '{"1"}'::text[], '{}', 'LlamaPay', '1.0', 
  NOW(), 'vjkw0pykax8', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  'd117e6a9-79bc-46a4-b813-1f78ac24134b', 'Superform', 'https://www.superform.xyz', 'https://cdn.brandfetch.io/idDhEUA3wl/w/400/h/400/theme/dark/icon.png?c=1bxidt_pGEUfCWkOXrVZ3', '4a97b4b4-45a7-4554-baa0-b80a47c7efb0', 
  'Cross-chain yield infrastructure', 'Superform provides infrastructure for accessing yield opportunities across multiple chains through a unified interface and smart routing.', 
  '{"cross-chain","yield","infrastructure","routing"}'::text[], 150, false, false, 
  '{"1"}'::text[], '{}', 'Superform Labs', '1.0', 
  NOW(), '6bx4fegg08b', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '5b9705ab-9bd4-46da-8deb-75d31e786478', 'Courtyard', 'https://courtyard.io', 'https://cdn.brandfetch.io/idz3oLXqc4/w/180/h/180/theme/dark/logo.png?c=1bxidt_pGEUfCWkOXrVZ3', 'c5ec7050-6aeb-432f-95d0-74227403a495', 
  'Physical collectibles NFT platform', 'Courtyard bridges physical collectibles with NFTs, allowing users to trade authenticated physical items as digital tokens with real-world backing.', 
  '{"physical","collectibles","nft","authentication"}'::text[], 140, false, false, 
  '{"1"}'::text[], '{}', 'Courtyard', '1.0', 
  NOW(), 'h1gpgimmfir', true, NOW(), NOW()
);
INSERT INTO "AppStoreApp" (
  id, name, url, "iconUrl", "categoryId", description, "detailedDescription", 
  tags, popularity, "isNew", "isFeatured", "chainSupport", screenshots, 
  developer, version, "lastUpdated", "shareableId", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  '78ce55d2-778e-46c5-98c9-d276f5a28292', 'Fileverse', 'https://ddocs.new', 'https://cdn.brandfetch.io/idzwCJ2oi9/w/370/h/370/theme/dark/icon.jpeg?c=1bxidt_pGEUfCWkOXrVZ3', '3d271fe2-007d-4659-a353-b739ed80f2e3', 
  'Decentralized document collaboration', 'Fileverse provides decentralized document creation and collaboration tools, enabling secure and private document sharing on blockchain infrastructure.', 
  '{"documents","collaboration","decentralized","privacy"}'::text[], 90, false, false, 
  '{"1"}'::text[], '{}', 'Fileverse', '1.0', 
  NOW(), 'nvt179rppk', true, NOW(), NOW()
);

-- Verify import
SELECT COUNT(*) as category_count FROM "AppStoreCategory";
SELECT COUNT(*) as app_count FROM "AppStoreApp";
SELECT name, url FROM "AppStoreApp" WHERE name = 'Fileverse';
