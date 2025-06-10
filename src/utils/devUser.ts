import { prisma } from './database';

export async function getDevUser() {
  const email = 'dev@example.com';
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, emailVerified: true }
  });
}
