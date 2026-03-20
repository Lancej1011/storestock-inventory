import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const createTestUser = async () => {
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      passwordHash: hashedPassword,
      fullName: 'Test User',
      role: 'ADMIN',
      isActive: true,
    },
  });

  const secret = process.env.JWT_SECRET || 'test-secret-key';
  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn: '1h' }
  );

  return { user, token };
};

export const createTestStore = async () => {
  return await prisma.store.create({
    data: {
      name: 'Test Store',
      isActive: true,
    },
  });
};

export const createTestProduct = async (barcode: string) => {
  return await prisma.product.create({
    data: {
      barcode,
      sku: `SKU-${barcode}`,
      name: 'Test Product',
      costPrice: 10.0,
      retailPrice: 20.0,
      reorderLevel: 5,
    },
  });
};

export const cleanupDatabase = async () => {
  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE '_prisma_migrations';`;

  const tables = tablenames
    .map(({ tablename }) => `"${tablename}"`)
    .join(', ');

  try {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
  } catch (error) {
    console.log({ error });
  }
};
