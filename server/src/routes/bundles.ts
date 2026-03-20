import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
const prisma = new PrismaClient();

const bundleSchema = z.object({
  parentProductId: z.string().uuid(),
  childProductId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const childInclude = {
  include: {
    inventory: { include: { store: true, location: true } },
    images: { where: { isPrimary: true } },
  },
};

const parentInclude = {
  include: {
    inventory: { include: { store: true, location: true } },
    images: { where: { isPrimary: true } },
  },
};

// Get all bundles for a product (as parent case and/or as child unit)
router.get('/product/:productId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { productId } = req.params;

    const [asParent, asChild] = await Promise.all([
      prisma.productBundle.findMany({
        where: { parentProductId: productId },
        include: { child: childInclude },
      }),
      prisma.productBundle.findMany({
        where: { childProductId: productId },
        include: { parent: parentInclude },
      }),
    ]);

    res.json({ asParent, asChild });
  } catch (error) {
    next(error);
  }
});

// Create a bundle (link a case/parent to its unit/child with a quantity)
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req: Request, res: Response, next) => {
  try {
    const data = bundleSchema.parse(req.body);

    if (data.parentProductId === data.childProductId) {
      throw new AppError('Parent and child products must be different', 400);
    }

    const bundle = await prisma.productBundle.create({
      data,
      include: { parent: true, child: true },
    });

    res.status(201).json(bundle);
  } catch (error) {
    next(error);
  }
});

// Update the quantity on an existing bundle
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const { quantity } = z.object({ quantity: z.number().int().positive() }).parse(req.body);

    const bundle = await prisma.productBundle.update({
      where: { id },
      data: { quantity },
      include: { parent: true, child: true },
    });

    res.json(bundle);
  } catch (error) {
    next(error);
  }
});

// Remove a bundle relationship
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    await prisma.productBundle.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
