import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

router.get('/stock-levels', authenticate, authorize('ADMIN', 'MANAGER', 'VIEWER'), async (req: Request, res: Response, next) => {
  try {
    const { storeId } = req.query;
    const where = storeId ? { storeId: storeId as string } : {};
    
    const inventory = await prisma.inventory.findMany({
      where,
      include: { product: true, store: true, location: true },
      orderBy: { quantity: 'asc' },
    });
    
    res.json(inventory);
  } catch (error) {
    next(error);
  }
});

router.get('/movement', authenticate, authorize('ADMIN', 'MANAGER'), async (req: Request, res: Response, next) => {
  try {
    const { startDate, endDate, storeId, productId } = req.query;
    const where: Record<string, unknown> = {};
    
    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      };
    }
    if (storeId) where.storeId = storeId;
    if (productId) where.productId = productId;
    
    const transactions = await prisma.stockTransaction.findMany({
      where,
      include: { product: true, store: true, user: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    
    res.json(transactions);
  } catch (error) {
    next(error);
  }
});

router.get('/low-stock', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { storeId } = req.query;
    const where = storeId ? { storeId: storeId as string } : {};
    
    const inventory = await prisma.inventory.findMany({
      where,
      include: { product: true, store: true },
    });
    
    const lowStock = inventory.filter(inv => inv.quantity <= (inv.product.reorderLevel || 10));
    
    res.json(lowStock);
  } catch (error) {
    next(error);
  }
});

router.get('/valuation', authenticate, authorize('ADMIN', 'MANAGER'), async (req: Request, res: Response, next) => {
  try {
    const { storeId } = req.query;
    const where = storeId ? { storeId: storeId as string } : {};
    
    const inventory = await prisma.inventory.findMany({
      where,
      include: { product: true },
    });
    
    const totalValue = inventory.reduce((sum, inv) => {
      return sum + (Number(inv.product.costPrice) * inv.quantity);
    }, 0);
    
    const retailValue = inventory.reduce((sum, inv) => {
      return sum + (Number(inv.product.retailPrice) * inv.quantity);
    }, 0);
    
    res.json({
      totalCostValue: totalValue,
      totalRetailValue: retailValue,
      itemCount: inventory.length,
      inventory,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
