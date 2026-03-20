import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

const importRowSchema = z.object({
  barcode: z.string().min(1),
  sku: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  costPrice: z.number().nonnegative(),
  retailPrice: z.number().nonnegative(),
  categoryName: z.string().optional(),
  supplierName: z.string().optional(),
});

// POST /import/csv
// Body: { rows: ImportRow[] }
// Returns: { created, skipped, errors }
router.post('/csv', authenticate, authorize('ADMIN', 'MANAGER'), async (req: Request, res: Response, next) => {
  try {
    const { rows } = req.body as { rows: unknown[] };

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'No rows provided' });
    }
    if (rows.length > 500) {
      return res.status(400).json({ message: 'Maximum 500 rows per import' });
    }

    let created = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const parsed = importRowSchema.safeParse(rows[i]);
      if (!parsed.success) {
        errors.push({ row: i + 1, message: parsed.error.errors[0]?.message ?? 'Invalid row' });
        continue;
      }
      const d = parsed.data;

      // Skip if barcode or SKU already exists
      const existing = await prisma.product.findFirst({
        where: { OR: [{ barcode: d.barcode }, { sku: d.sku }] },
      });
      if (existing) {
        skipped++;
        continue;
      }

      // Resolve category by name if provided
      let categoryId: string | undefined;
      if (d.categoryName) {
        const cat = await prisma.category.findFirst({
          where: { name: { contains: d.categoryName, mode: 'insensitive' }, isActive: true },
        });
        if (cat) categoryId = cat.id;
      }

      // Resolve supplier by name if provided
      let supplierId: string | undefined;
      if (d.supplierName) {
        const sup = await prisma.supplier.findFirst({
          where: { name: { contains: d.supplierName, mode: 'insensitive' }, isActive: true },
        });
        if (sup) supplierId = sup.id;
      }

      try {
        await prisma.product.create({
          data: {
            barcode: d.barcode,
            sku: d.sku,
            name: d.name,
            description: d.description,
            costPrice: d.costPrice,
            retailPrice: d.retailPrice,
            categoryId,
            supplierId,
          },
        });
        created++;
      } catch {
        errors.push({ row: i + 1, message: 'Failed to create product (possible duplicate)' });
      }
    }

    res.json({ created, skipped, errors });
  } catch (error) {
    next(error);
  }
});

export default router;
