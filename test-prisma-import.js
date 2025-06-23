console.log('Testing prisma import...');

try {
  const database = require('@/utils/database');
  console.log('Database module:', Object.keys(database));
  console.log('Prisma defined?', database.prisma !== undefined);
  console.log('Prisma type:', typeof database.prisma);
} catch (error) {
  console.error('Error importing database:', error.message);
}

try {
  const { prisma } = require('@/utils/database');
  console.log('Direct prisma import:', prisma !== undefined);
} catch (error) {
  console.error('Error importing prisma directly:', error.message);
}