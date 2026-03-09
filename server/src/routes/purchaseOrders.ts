import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

router.get('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { storeId, status } = req.query;
    const where: Record<string, unknown> = {};
    if (storeId) where.storeId = storeId;
    if (status) where.status = status;
    
    const orders = await prisma.purchaseOrder.findMany({
      where,
      include: { supplier: true, store: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(orders);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req: Request, res: Response, next) => {
  try {
    const { supplierId, storeId, expectedDate, items } = req.body;
    const orderNumber = `PO-${Date.now()}`;
    const order = await prisma.purchaseOrder.create({
      data: {
        orderNumber,
        supplierId,
        storeId,
        expectedDate,
        createdById: req.headers['x-user-id'] as string,
        items: {
          create: items.map((item: { productId: string; quantity: number; unitCost: number }) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
        },
      },
      include: { items: true, supplier: true, store: true },
    });
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

export default router;
