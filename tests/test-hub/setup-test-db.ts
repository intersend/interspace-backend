#!/usr/bin/env node

/**
 * Setup test database with proper schema and test data
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import chalk from 'chalk';
import { config } from 'dotenv';
import path from 'path';

// Load test environment
config({ path: path.join(__dirname, '../../.env.test') });

const prisma = new PrismaClient();

async function main() {
  console.log(chalk.bold.cyan('\n🔧 Setting up test database...\n'));

  try {
    // Check database connection
    console.log(chalk.blue('1. Checking database connection...'));
    await prisma.$queryRaw`SELECT 1`;
    console.log(chalk.green('✓ Database connected'));

    // Create test user
    console.log(chalk.blue('\n2. Creating test user...'));
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
    
    const user = await prisma.user.upsert({
      where: { email: 'app-test@example.com' },
      update: {},
      create: {
        email: 'app-test@example.com',
        hashedPassword,
        emailVerified: true,
        twoFactorEnabled: false
      }
    });
    
    console.log(chalk.green('✓ Test user created/updated'));
    console.log(chalk.gray(`  Email: app-test@example.com`));
    console.log(chalk.gray(`  Password: TestPassword123!`));
    console.log(chalk.gray(`  User ID: ${user.id}`));

    // Create test profile
    console.log(chalk.blue('\n3. Creating test profile...'));
    const profile = await prisma.smartProfile.upsert({
      where: { 
        id: 'test-profile-001' 
      },
      update: {},
      create: {
        id: 'test-profile-001',
        userId: user.id,
        name: 'Test Profile',
        sessionWalletAddress: '0x' + '0'.repeat(40),
        isActive: true
      }
    });
    
    console.log(chalk.green('✓ Test profile created/updated'));
    console.log(chalk.gray(`  Profile ID: ${profile.id}`));
    console.log(chalk.gray(`  Profile Name: ${profile.name}`));

    // Create a test folder
    console.log(chalk.blue('\n4. Creating test folder...'));
    const folder = await prisma.folder.upsert({
      where: { 
        id: 'test-folder-001' 
      },
      update: {},
      create: {
        id: 'test-folder-001',
        profileId: profile.id,
        name: 'Work Apps',
        color: '#FF6B6B'
      }
    });
    
    console.log(chalk.green('✓ Test folder created/updated'));
    console.log(chalk.gray(`  Folder ID: ${folder.id}`));
    console.log(chalk.gray(`  Folder Name: ${folder.name}`));

    // Summary
    console.log(chalk.bold.green('\n✅ Test database setup complete!\n'));
    console.log(chalk.cyan('Test Credentials:'));
    console.log(chalk.white('  Email: app-test@example.com'));
    console.log(chalk.white('  Password: TestPassword123!'));
    console.log(chalk.white(`  Profile ID: ${profile.id}`));
    console.log(chalk.white(`  Folder ID: ${folder.id}`));
    
    console.log(chalk.yellow('\nYou can now run:'));
    console.log(chalk.gray('  npm run test:hub:apps'));
    console.log(chalk.gray('  npm run test:hub:debug-app'));
    console.log(chalk.gray('  npx ts-node tests/test-hub/simple-app-test.ts'));

  } catch (error: any) {
    console.log(chalk.red('\n❌ Setup failed!'));
    console.error(error);
    
    if (error.code === 'P2002') {
      console.log(chalk.yellow('\n💡 Unique constraint violation - some test data may already exist'));
    } else if (error.code === 'P2025') {
      console.log(chalk.yellow('\n💡 Record not found - database may need migration'));
      console.log(chalk.gray('Run: NODE_ENV=test npm run prisma:migrate'));
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run setup
main().catch(console.error);