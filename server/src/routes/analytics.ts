import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

router.get('/sales', authenticate, authorize('ADMIN', 'MANAGER'), async (req: Request, res: Response, next) => {
  try {
    const { days = '30', storeId } = req.query;
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - parseInt(days as string));

    const where: any = {
      type: 'STOCK_OUT',
      createdAt: { gte: dateLimit }
    };
    if (storeId) where.storeId = storeId;

    const transactions = await prisma.stockTransaction.findMany({
      where,
      include: { product: true }
    });

    // Group by day
    const dailySales: Record<string, number> = {};
    transactions.forEach(t => {
      const date = t.createdAt.toISOString().split('T')[0];
      dailySales[date] = (dailySales[date] || 0) + (t.quantity * -1); // stock out is negative
    });

    res.json({
      totalItemsSold: transactions.reduce((sum, t) => sum + (t.quantity * -1), 0),
      dailySales
    });
  } catch (error) {
    next(error);
  }
});

router.get('/trends', authenticate, authorize('ADMIN', 'MANAGER'), async (req: Request, res: Response, next) => {
  try {
    const { storeId } = req.query;
    const inventory = await prisma.inventory.findMany({
      where: storeId ? { storeId: storeId as string } : undefined,
      include: { product: true }
    });

    const categoryDistribution: Record<string, number> = {};
    inventory.forEach(inv => {
      const cat = inv.product.categoryId || 'Uncategorized';
      categoryDistribution[cat] = (categoryDistribution[cat] || 0) + inv.quantity;
    });

    res.json({
      categoryDistribution
    });
  } catch (error) {
    next(error);
  }
});

export default router;
