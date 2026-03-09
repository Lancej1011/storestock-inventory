import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

router.get('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { storeId } = req.query;
    const where = storeId ? { storeId: storeId as string, isActive: true } : { isActive: true };
    const locations = await prisma.location.findMany({
      where,
      include: { store: true },
      orderBy: [{ aisle: 'asc' }, { shelf: 'asc' }],
    });
    res.json(locations);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { storeId, aisle, shelf, bin, description } = req.body;
    const location = await prisma.location.create({
      data: { storeId, aisle, shelf, bin, description },
      include: { store: true },
    });
    res.status(201).json(location);
  } catch (error) {
    next(error);
  }
});

export default router;
