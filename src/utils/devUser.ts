import { prisma } from './database';

export async function getDevAccount() {
  const email = 'dev@example.com';
  return prisma.account.upsert({
    where: { 
      type_identifier: {
        type: 'email',
        identifier: email
      }
    },
    update: {},
    create: { 
      type: 'email',
      identifier: email,
      verified: true,
      metadata: {}
    }
  });
}
