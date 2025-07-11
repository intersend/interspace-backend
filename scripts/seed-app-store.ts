import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding app store data...');

  // Create categories
  const categories = await Promise.all([
    prisma.appStoreCategory.upsert({
      where: { slug: 'defi' },
      update: {},
      create: {
        name: 'DeFi',
        slug: 'defi',
        description: 'Decentralized Finance applications',
        icon: '💰',
        position: 1,
        isActive: true
      }
    }),
    prisma.appStoreCategory.upsert({
      where: { slug: 'gaming' },
      update: {},
      create: {
        name: 'Gaming',
        slug: 'gaming',
        description: 'Web3 gaming and metaverse',
        icon: '🎮',
        position: 2
      }
    }),
    prisma.appStoreCategory.upsert({
      where: { slug: 'nft' },
      update: {},
      create: {
        name: 'NFT',
        slug: 'nft',
        description: 'NFT marketplaces and tools',
        icon: '🖼️',
        position: 3
      }
    }),
    prisma.appStoreCategory.upsert({
      where: { slug: 'social' },
      update: {},
      create: {
        name: 'Social',
        slug: 'social',
        description: 'Social platforms and communities',
        icon: '💬',
        position: 4
      }
    }),
    prisma.appStoreCategory.upsert({
      where: { slug: 'tools' },
      update: {},
      create: {
        name: 'Tools',
        slug: 'tools',
        description: 'Utilities and productivity tools',
        icon: '🛠️',
        position: 5
      }
    }),
    prisma.appStoreCategory.upsert({
      where: { slug: 'dao' },
      update: {},
      create: {
        name: 'DAO',
        slug: 'dao',
        description: 'Decentralized Autonomous Organizations',
        icon: '🏛️',
        position: 6
      }
    })
  ]);

  console.log(`✅ Created ${categories.length} categories`);

  // Create sample apps
  const apps = [
    // DeFi Apps
    {
      name: 'Uniswap',
      url: 'https://app.uniswap.org',
      iconUrl: 'https://app.uniswap.org/favicon.ico',
      categoryId: categories[0].id, // DeFi
      description: 'Trade crypto tokens on the leading decentralized exchange',
      detailedDescription: 'Uniswap is a decentralized trading protocol, known for its role in facilitating automated trading of decentralized finance (DeFi) tokens.',
      tags: ['swap', 'dex', 'liquidity', 'amm'],
      popularity: 1000,
      isNew: false,
      isFeatured: true,
      chainSupport: ['1', '137', '42161', '10', '8453'],
      screenshots: [],
      developer: 'Uniswap Labs',
      version: '4.0'
    },
    {
      name: 'Aave',
      url: 'https://app.aave.com',
      iconUrl: 'https://app.aave.com/favicon.ico',
      categoryId: categories[0].id, // DeFi
      description: 'Earn interest, borrow assets, and build applications',
      detailedDescription: 'Aave is a decentralized non-custodial liquidity protocol where users can participate as depositors or borrowers.',
      tags: ['lending', 'borrowing', 'yield', 'defi'],
      popularity: 800,
      isNew: false,
      isFeatured: true,
      chainSupport: ['1', '137', '42161', '10', '43114'],
      screenshots: [],
      developer: 'Aave',
      version: '3.0'
    },
    {
      name: 'Compound',
      url: 'https://app.compound.finance',
      iconUrl: 'https://compound.finance/favicon.ico',
      categoryId: categories[0].id, // DeFi
      description: 'Supply crypto assets to earn interest',
      detailedDescription: 'Compound is an algorithmic, autonomous interest rate protocol built for developers, to unlock a universe of open financial applications.',
      tags: ['lending', 'borrowing', 'compound', 'defi'],
      popularity: 600,
      isNew: false,
      isFeatured: false,
      chainSupport: ['1', '137', '42161'],
      screenshots: [],
      developer: 'Compound Labs',
      version: '3.0'
    },

    // Gaming Apps
    {
      name: 'Axie Infinity',
      url: 'https://app.axieinfinity.com',
      iconUrl: 'https://app.axieinfinity.com/favicon.ico',
      categoryId: categories[1].id, // Gaming
      description: 'Battle, collect, and trade cute digital pets',
      detailedDescription: 'Axie Infinity is a blockchain-based trading and battling game that is partially owned and operated by its players.',
      tags: ['gaming', 'nft', 'play-to-earn', 'pets'],
      popularity: 700,
      isNew: false,
      isFeatured: true,
      chainSupport: ['1', '2020'],
      screenshots: [],
      developer: 'Sky Mavis',
      version: '2.0'
    },
    {
      name: 'The Sandbox',
      url: 'https://www.sandbox.game',
      iconUrl: 'https://www.sandbox.game/favicon.ico',
      categoryId: categories[1].id, // Gaming
      description: 'Create, play, own, and monetize your gaming experiences',
      detailedDescription: 'The Sandbox is a virtual world where players can build, own, and monetize their gaming experiences in the Ethereum blockchain.',
      tags: ['metaverse', 'gaming', 'voxel', 'create'],
      popularity: 500,
      isNew: false,
      isFeatured: false,
      chainSupport: ['1', '137'],
      screenshots: [],
      developer: 'The Sandbox',
      version: '1.0'
    },

    // NFT Apps
    {
      name: 'OpenSea',
      url: 'https://opensea.io',
      iconUrl: 'https://opensea.io/static/images/logos/opensea-logo.svg',
      categoryId: categories[2].id, // NFT
      description: 'The largest NFT marketplace',
      detailedDescription: 'OpenSea is the world\'s first and largest web3 marketplace for NFTs and crypto collectibles.',
      tags: ['nft', 'marketplace', 'art', 'collectibles'],
      popularity: 900,
      isNew: false,
      isFeatured: true,
      chainSupport: ['1', '137', '42161', '10', '8453', '324'],
      screenshots: [],
      developer: 'OpenSea',
      version: '2.0'
    },
    {
      name: 'Blur',
      url: 'https://blur.io',
      iconUrl: 'https://blur.io/favicon.ico',
      categoryId: categories[2].id, // NFT
      description: 'The NFT marketplace for pro traders',
      detailedDescription: 'Blur is the NFT marketplace for pro traders. Trade NFTs faster and make more money with advanced analytics.',
      tags: ['nft', 'marketplace', 'trading', 'analytics'],
      popularity: 400,
      isNew: true,
      isFeatured: false,
      chainSupport: ['1'],
      screenshots: [],
      developer: 'Blur',
      version: '1.0'
    },

    // Social Apps
    {
      name: 'Lens Protocol',
      url: 'https://lens.xyz',
      iconUrl: 'https://lens.xyz/favicon.ico',
      categoryId: categories[3].id, // Social
      description: 'Decentralized social graph',
      detailedDescription: 'Lens Protocol is a composable and decentralized social graph, ready for you to build on so you can focus on creating a great experience, not scaling your users.',
      tags: ['social', 'decentralized', 'web3', 'graph'],
      popularity: 300,
      isNew: true,
      isFeatured: true,
      chainSupport: ['137'],
      screenshots: [],
      developer: 'Lens Protocol',
      version: '2.0'
    },
    {
      name: 'Farcaster',
      url: 'https://warpcast.com',
      iconUrl: 'https://warpcast.com/favicon.ico',
      categoryId: categories[3].id, // Social
      description: 'Sufficiently decentralized social network',
      detailedDescription: 'Farcaster is a sufficiently decentralized social network. It is an open protocol that can support many clients, just like email.',
      tags: ['social', 'farcaster', 'decentralized', 'protocol'],
      popularity: 250,
      isNew: true,
      isFeatured: false,
      chainSupport: ['1', '10'],
      screenshots: [],
      developer: 'Merkle Manufactory',
      version: '1.0'
    },

    // Tools
    {
      name: 'Etherscan',
      url: 'https://etherscan.io',
      iconUrl: 'https://etherscan.io/favicon.ico',
      categoryId: categories[4].id, // Tools
      description: 'Ethereum blockchain explorer',
      detailedDescription: 'Etherscan is the leading blockchain explorer, search, API and analytics platform for Ethereum.',
      tags: ['explorer', 'analytics', 'ethereum', 'tools'],
      popularity: 1200,
      isNew: false,
      isFeatured: true,
      chainSupport: ['1'],
      screenshots: [],
      developer: 'Etherscan',
      version: '1.0'
    },
    {
      name: 'Zapper',
      url: 'https://zapper.fi',
      iconUrl: 'https://zapper.fi/favicon.ico',
      categoryId: categories[4].id, // Tools
      description: 'Track and manage your DeFi portfolio',
      detailedDescription: 'Zapper is your home to Web3. Track your portfolio, discover new opportunities, and manage your DeFi positions.',
      tags: ['portfolio', 'defi', 'tracking', 'management'],
      popularity: 600,
      isNew: false,
      isFeatured: false,
      chainSupport: ['1', '137', '42161', '10', '250', '43114', '56'],
      screenshots: [],
      developer: 'Zapper',
      version: '2.0'
    },

    // DAO Apps
    {
      name: 'Snapshot',
      url: 'https://snapshot.org',
      iconUrl: 'https://snapshot.org/favicon.ico',
      categoryId: categories[5].id, // DAO
      description: 'Decentralized voting platform',
      detailedDescription: 'Snapshot is a decentralized voting system. It provides flexibility on how voting power is calculated for a vote.',
      tags: ['dao', 'voting', 'governance', 'decentralized'],
      popularity: 500,
      isNew: false,
      isFeatured: true,
      chainSupport: ['1', '137', '42161', '10', '56', '43114'],
      screenshots: [],
      developer: 'Snapshot Labs',
      version: '1.0'
    },
    {
      name: 'Aragon',
      url: 'https://app.aragon.org',
      iconUrl: 'https://aragon.org/favicon.ico',
      categoryId: categories[5].id, // DAO
      description: 'Create and manage decentralized organizations',
      detailedDescription: 'Aragon gives internet communities unprecedented power to organize around shared values and resources.',
      tags: ['dao', 'organization', 'governance', 'management'],
      popularity: 300,
      isNew: false,
      isFeatured: false,
      chainSupport: ['1', '137'],
      screenshots: [],
      developer: 'Aragon',
      version: '2.0'
    }
  ];

  // Create apps
  for (const appData of apps) {
    const app = await prisma.appStoreApp.create({
      data: appData
    });
    console.log(`✅ Created app: ${app.name}`);
  }

  console.log(`\n✅ App store seeding completed!`);
  console.log(`   - ${categories.length} categories`);
  console.log(`   - ${apps.length} apps`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding app store:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });