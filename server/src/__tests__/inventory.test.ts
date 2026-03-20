import request from 'supertest';
import { app } from '../app.js';
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { createTestUser, createTestStore, createTestProduct } from './helpers.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Inventory Resource', () => {
  let token: string;
  let user: any;
  let store: any;
  let product: any;

  beforeEach(async () => {
    // Clear relevant data
    await prisma.stockTransaction.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.product.deleteMany();
    await prisma.store.deleteMany();
    await prisma.user.deleteMany();

    const testUser = await createTestUser();
    user = testUser.user;
    token = testUser.token;
    store = await createTestStore();
    product = await createTestProduct('1234567890');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/inventory/stock-in', () => {
    it('should create new inventory record when none exists', async () => {
      const response = await request(app)
        .post('/api/inventory/stock-in')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product.id,
          storeId: store.id,
          quantity: 10,
          notes: 'Test stock in',
        });

      expect(response.status).toBe(200);
      expect(response.body.quantity).toBe(10);
      expect(response.body.productId).toBe(product.id);
      expect(response.body.storeId).toBe(store.id);

      // Verify transaction was created
      const transactions = await prisma.stockTransaction.findMany({
        where: { productId: product.id },
      });
      expect(transactions).toHaveLength(1);
      expect(transactions[0].type).toBe('STOCK_IN');
      expect(transactions[0].quantity).toBe(10);
    });

    it('should increment existing inventory record', async () => {
      // First stock in
      await prisma.inventory.create({
        data: {
          productId: product.id,
          storeId: store.id,
          quantity: 5,
        },
      });

      const response = await request(app)
        .post('/api/inventory/stock-in')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product.id,
          storeId: store.id,
          quantity: 10,
        });

      expect(response.status).toBe(200);
      expect(response.body.quantity).toBe(15);
    });
  });

  describe('POST /api/inventory/stock-out', () => {
    it('should decrement inventory and create transaction', async () => {
      await prisma.inventory.create({
        data: {
          productId: product.id,
          storeId: store.id,
          quantity: 20,
        },
      });

      const response = await request(app)
        .post('/api/inventory/stock-out')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product.id,
          storeId: store.id,
          quantity: 5,
          type: 'STOCK_OUT',
        });

      expect(response.status).toBe(200);
      expect(response.body.quantity).toBe(15);

      const transactions = await prisma.stockTransaction.findMany({
        where: { productId: product.id, type: 'STOCK_OUT' },
      });
      expect(transactions).toHaveLength(1);
    });

    it('should return 400 if insufficient stock', async () => {
      await prisma.inventory.create({
        data: {
          productId: product.id,
          storeId: store.id,
          quantity: 2,
        },
      });

      const response = await request(app)
        .post('/api/inventory/stock-out')
        .set('Authorization', `Bearer ${token}`)
        .send({
          productId: product.id,
          storeId: store.id,
          quantity: 5,
          type: 'STOCK_OUT',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Insufficient stock');
    });
  });
});
