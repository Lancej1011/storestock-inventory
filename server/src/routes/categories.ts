import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

router.get('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const categories = await prisma.category.findMany({
      include: { children: true, _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(categories);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { name, description, parentId } = req.body;
    const category = await prisma.category.create({
      data: { name, description, parentId },
    });
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
});

export default router;
