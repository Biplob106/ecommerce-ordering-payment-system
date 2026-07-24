import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/lib/password';

/**
 * Database seed — the equivalent of `php artisan db:seed`.
 *
 * Creates the admin account and a handful of sample products so the API is
 * usable immediately after setup. Written to be idempotent: running it twice
 * does not create duplicates.
 *
 *   npm run db:seed
 */
const prisma = new PrismaClient();

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

const sampleProducts = [
  {
    name: 'Wireless Mouse',
    description: 'Ergonomic 2.4GHz wireless mouse with silent clicks.',
    priceAmount: 1999, // $19.99
    currency: 'usd',
    stock: 120,
  },
  {
    name: 'Mechanical Keyboard',
    description: 'Hot-swappable mechanical keyboard, tactile brown switches.',
    priceAmount: 7499,
    currency: 'usd',
    stock: 60,
  },
  {
    name: 'USB-C Hub',
    description: '7-in-1 USB-C hub with HDMI, card reader and 100W passthrough.',
    priceAmount: 3499,
    currency: 'usd',
    stock: 200,
  },
];

async function main(): Promise<void> {
  // Admin: create if absent, otherwise leave as-is.
  const passwordHash = await hashPassword(SEED_ADMIN_PASSWORD);
  const admin = await prisma.user.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    update: {},
    create: {
      email: SEED_ADMIN_EMAIL,
      name: 'Administrator',
      passwordHash,
      role: Role.ADMIN,
    },
  });
  console.log(`Admin ready: ${admin.email}`);

  // Products: only seed when the catalogue is empty, to stay idempotent.
  const existing = await prisma.product.count();
  if (existing === 0) {
    await prisma.product.createMany({ data: sampleProducts });
    console.log(`Seeded ${sampleProducts.length} products`);
  } else {
    console.log(`Products already present (${existing}) — skipping`);
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
