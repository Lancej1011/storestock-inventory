import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { enrichBarcode } from '../services/barcodeEnrichment.js';

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

// Get product by barcode — checks local DB first, then enrichBarcode() (auto-creates),
// then falls back to external BARCODE_LOOKUP_API_KEY if configured (isExternalResult).
router.get('/barcode/:code', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { code } = req.params;

    const productInclude = {
      category: true,
      supplier: true,
      images: { where: { isPrimary: true } },
      inventory: {
        include: { store: true, location: true },
      },
    };

    // 1. Check local DB first
    const existing = await prisma.product.findUnique({
      where: { barcode: code },
      include: productInclude,
    });

    if (existing) {
      return res.json(existing);
    }

    // 2. Not in local DB — try enrichBarcode() (Open Food Facts / UPC Item DB)
    const enriched = await enrichBarcode(code);

    if (enriched) {
      // Auto-create the product so future scans hit the local DB
      const sku = `AUTO-${code}`;

      // Try to match category hint against existing categories in the DB
      let categoryId: string | undefined;
      if (enriched.categoryHint) {
        const matchedCategory = await prisma.category.findFirst({
          where: { name: { contains: enriched.categoryHint, mode: 'insensitive' }, isActive: true },
        });
        if (matchedCategory) categoryId = matchedCategory.id;
      }

      let autoProduct;
      try {
        autoProduct = await prisma.product.create({
          data: {
            barcode: code,
            sku,
            name: enriched.name,
            description: enriched.description,
            imageUrl: enriched.imageUrl,
            categoryId,
            costPrice: 0,
            retailPrice: 0,
          },
          include: productInclude,
        });
      } catch {
        // Race condition: another request may have just created it
        const race = await prisma.product.findUnique({
          where: { barcode: code },
          include: productInclude,
        });
        if (!race) throw new AppError('Product not found', 404);
        autoProduct = race;
      }

      // Return with enrichment metadata so the client can show a confirmation banner
      return res.json({
        ...autoProduct,
        autoPopulated: true,
        dataSource: enriched.dataSource,
      });
    }

    // 3. enrichBarcode returned nothing — try BARCODE_LOOKUP_API_KEY as last resort
    const apiKey = process.env.BARCODE_LOOKUP_API_KEY;
    if (apiKey) {
      try {
        const lookupRes = await fetch(
          `https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(code)}&formatted=y&key=${apiKey}`
        );

        if (lookupRes.ok) {
          const data = await lookupRes.json() as { products?: any[] };
          const p = data.products?.[0];

          if (p) {
            // Return external result pre-formatted for the client — not yet saved to DB
            return res.status(200).json({
              isExternalResult: true,
              barcode: code,
              name: p.title || p.product_name || null,
              brand: p.brand || null,
              description: p.description || null,
              category: p.category || null,
              imageUrl: p.images?.[0] || null,
              retailPrice: null,
              costPrice: null,
              sku: null,
            });
          }
        }
      } catch (lookupError) {
        console.error('Barcode lookup API error:', lookupError);
      }
    }

    // 4. Genuinely unknown barcode
    throw new AppError('Product not found', 404);
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

// Upload product image from snapshot
router.post('/image', authenticate, authorize('ADMIN', 'MANAGER', 'EMPLOYEE'), async (req: Request, res: Response, next) => {
  try {
    const { productId, barcode, image } = req.body;

    if (!image) {
      throw new AppError('No image data provided', 400);
    }

    // For now, store as base64 data URL (in production, upload to S3/GCS)
    const imageUrl = `data:image/jpeg;base64,${image}`;

    // Update product's primary image
    if (productId) {
      // Check if product already has images
      const existingImages = await prisma.productImage.findMany({
        where: { productId }
      });

      if (existingImages.length > 0) {
        // Update existing primary image
        await prisma.productImage.updateMany({
          where: { productId, isPrimary: true },
          data: { imageUrl }
        });
      } else {
        // Create new primary image
        await prisma.productImage.create({
          data: {
            productId,
            imageUrl,
            isPrimary: true
          }
        });
      }

      // Also update the product's imageUrl field
      await prisma.product.update({
        where: { id: productId },
        data: { imageUrl }
      });
    }

    res.json({ success: true, imageUrl });
  } catch (error) {
    next(error);
  }
});

export default router;
