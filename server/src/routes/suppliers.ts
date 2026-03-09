import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

router.get('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(suppliers);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: { products: true }
    });
    if (!supplier) throw new Error('Supplier not found');
    res.json(supplier);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { name, contactName, email, phone, address } = req.body;
    const supplier = await prisma.supplier.create({
      data: { name, contactName, email, phone, address },
    });
    res.status(201).json(supplier);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const { name, contactName, email, phone, address, isActive } = req.body;
    const supplier = await prisma.supplier.update({
      where: { id },
      data: { name, contactName, email, phone, address, isActive },
    });
    res.json(supplier);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    await prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
