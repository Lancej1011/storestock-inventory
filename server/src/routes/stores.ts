import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

router.get('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(stores);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const { name, address, phone, email } = req.body;
    const store = await prisma.store.create({
      data: { name, address, phone, email },
    });
    res.status(201).json(store);
  } catch (error) {
    next(error);
  }
});

export default router;
