import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
const prisma = new PrismaClient();

const productSchema = z.object({
  barcode: z.string(),
  sku: z.string(),
  name: z.string(),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  costPrice: z.number().positive(),
  retailPrice: z.number().positive(),
  reorderLevel: z.number().int().optional(),
  reorderQty: z.number().int().optional(),
  expiryDate: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

// List products with pagination
router.get('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { page = '1', limit = '20', search, categoryId, supplierId } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = Math.min(parseInt(limit as string), 100);

    const where: Record<string, unknown> = { isActive: true };

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { sku: { contains: search as string, mode: 'insensitive' } },
        { barcode: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (categoryId) where.categoryId = categoryId;
    if (supplierId) where.supplierId = supplierId;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        include: {
          category: true,
          supplier: true,
          images: { where: { isPrimary: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      data: products,
      pagination: {
        page: parseInt(page as string),
        limit: take,
        total,
        pages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get product by ID
router.get('/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        supplier: true,
        images: true,
        inventory: {
          include: { store: true, location: true },
        },
      },
    });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    res.json(product);
  } catch (error) {
    next(error);
  }
});

// Get product by barcode
router.get('/barcode/:code', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { code } = req.params;
    const product = await prisma.product.findUnique({
      where: { barcode: code },
      include: {
        category: true,
        supplier: true,
        images: { where: { isPrimary: true } },
        inventory: {
          include: { store: true, location: true },
        },
      },
    });

    if (!product) {
      throw new AppError('Product not found', 404);
    }

    res.json(product);
  } catch (error) {
    next(error);
  }
});

// Create product
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req: Request, res: Response, next) => {
  try {
    const data = productSchema.parse(req.body);

    const existing = await prisma.product.findFirst({
      where: { OR: [{ barcode: data.barcode }, { sku: data.sku }] },
    });

    if (existing) {
      throw new AppError('Product with this barcode or SKU already exists', 400);
    }

    const product = await prisma.product.create({
      data: {
        ...data,
        costPrice: data.costPrice,
        retailPrice: data.retailPrice,
      },
      include: { category: true, supplier: true },
    });

    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

// Update product
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const data = productSchema.partial().parse(req.body);

    const product = await prisma.product.update({
      where: { id },
      data: {
        ...data,
        costPrice: data.costPrice,
        retailPrice: data.retailPrice,
      },
      include: { category: true, supplier: true, images: true },
    });

    res.json(product);
  } catch (error) {
    next(error);
  }
});

// Delete (deactivate) product
router.delete('/:id', authenticate, authorize('ADMIN'), async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
