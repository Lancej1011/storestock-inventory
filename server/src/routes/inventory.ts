import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { fetchProductByBarcode } from '../utils/upcService.js';

const router = Router();
const prisma = new PrismaClient();

const stockInSchema = z.object({
  productId: z.string().uuid(),
  storeId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
  referenceId: z.string().uuid().optional(),
  referenceType: z.string().optional(),
});

const stockOutSchema = z.object({
  productId: z.string().uuid(),
  storeId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  type: z.enum(['STOCK_OUT', 'DAMAGED', 'RETURN']),
  notes: z.string().optional(),
  referenceId: z.string().uuid().optional(),
  referenceType: z.string().optional(),
});

const transferSchema = z.object({
  productId: z.string().uuid(),
  fromStoreId: z.string().uuid(),
  toStoreId: z.string().uuid(),
  fromLocationId: z.string().uuid().optional(),
  toLocationId: z.string().uuid().optional(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
});

// List inventory with filters
router.get('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { 
      page = '1', 
      limit = '20', 
      storeId, 
      productId, 
      lowStock 
    } = req.query;
    
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = Math.min(parseInt(limit as string), 100);

    const where: Record<string, unknown> = {};

    if (storeId) where.storeId = storeId;
    if (productId) where.productId = productId;

    let products;
    let total;

    if (lowStock === 'true') {
      // Improved query: only fetch products where quantity is below their reorderLevel
      // Note: Prisma doesn't support field-to-field comparison in 'where' easily,
      // so we use a more efficient approach by fetching only necessary data or using raw SQL if needed.
      // For now, let's at least add pagination to the low-stock view.
      
      const totalCount = await prisma.inventory.count({
        where: {
          storeId: storeId ? (storeId as string) : undefined,
          quantity: { lt: 20 } // Approximate threshold for initial DB filtering
        }
      });

      const inventories = await prisma.inventory.findMany({
        where: {
          storeId: storeId ? (storeId as string) : undefined,
          quantity: { lt: 50 } // Fetch a reasonable candidate set
        },
        include: {
          product: { include: { images: { where: { isPrimary: true } } } },
          store: true,
          location: true,
        },
        skip,
        take,
        orderBy: { quantity: 'asc' }
      });
      
      products = inventories.filter(i => i.product && i.quantity < (i.product.reorderLevel || 10));
      total = totalCount;
    } else {
      [products, total] = await Promise.all([
        prisma.inventory.findMany({
          where,
          skip,
          take,
          include: {
            product: { include: { images: { where: { isPrimary: true } } } },
            store: true,
            location: true,
          },
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.inventory.count({ where }),
      ]);
    }

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

// Get inventory stats
router.get('/stats', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { storeId } = req.query;
    const where: any = { isActive: true };
    if (storeId) where.storeId = storeId as string;

    const [sumRes, countRes] = await Promise.all([
      prisma.inventory.aggregate({
        where,
        _sum: { quantity: true },
      }),
      prisma.inventory.count({ where }),
    ]);

    res.json({
      totalUnits: sumRes._sum.quantity || 0,
      totalRecords: countRes,
    });
  } catch (error) {
    next(error);
  }
});

// Get inventory by ID
router.get('/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const inventory = await prisma.inventory.findUnique({
      where: { id },
      include: {
        product: { include: { images: true, category: true, supplier: true } },
        store: true,
        location: true,
      },
    });

    if (!inventory) {
      throw new AppError('Inventory not found', 404);
    }

    res.json(inventory);
  } catch (error) {
    next(error);
  }
});

// Stock in (receive inventory)
router.post('/stock-in', authenticate, authorize('ADMIN', 'MANAGER', 'EMPLOYEE'), async (req: AuthRequest, res: Response, next) => {
  try {
    const data = stockInSchema.parse(req.body);
    const userId = req.user!.id;

    // Get or create inventory record
    let inventory = await prisma.inventory.findFirst({
      where: {
        productId: data.productId,
        storeId: data.storeId,
        locationId: data.locationId,
      },
      include: { product: true, store: true, location: true },
    });

    const previousQty = inventory?.quantity || 0;

    if (inventory) {
      inventory = await prisma.inventory.update({
        where: { 
          id: inventory.id,
          version: inventory.version // Optimistic lock
        },
        data: { 
          quantity: { increment: data.quantity },
          version: { increment: 1 }
        },
        include: { product: true, store: true, location: true },
      });
    } else {
      inventory = await prisma.inventory.create({
        data: {
          productId: data.productId,
          storeId: data.storeId,
          locationId: data.locationId,
          quantity: data.quantity,
        },
        include: { product: true, store: true, location: true },
      });
    }

    // Create transaction log
    await prisma.stockTransaction.create({
      data: {
        productId: data.productId,
        storeId: data.storeId,
        locationId: data.locationId,
        userId,
        type: 'STOCK_IN',
        quantity: data.quantity,
        previousQty,
        newQty: inventory.quantity,
        referenceId: data.referenceId,
        referenceType: data.referenceType,
        notes: data.notes,
      },
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(`store-${data.storeId}`).emit('inventory:updated', inventory);

    // Check for low stock alert
    if (inventory.product && inventory.quantity < (inventory.product.reorderLevel || 10)) {
      io.to(`store-${data.storeId}`).emit('stock:low', {
        product: inventory.product,
        store: inventory.store,
        quantity: inventory.quantity,
        reorderLevel: inventory.product.reorderLevel,
      });
    }

    res.json(inventory);
  } catch (error) {
    next(error);
  }
});

// Stock out (deduct inventory)
router.post('/stock-out', authenticate, authorize('ADMIN', 'MANAGER', 'EMPLOYEE'), async (req: AuthRequest, res: Response, next) => {
  try {
    const data = stockOutSchema.parse(req.body);
    const userId = req.user!.id;

    const inventory = await prisma.inventory.findFirst({
      where: {
        productId: data.productId,
        storeId: data.storeId,
        locationId: data.locationId,
      },
    });

    if (!inventory) {
      throw new AppError('Inventory not found', 404);
    }

    if (inventory.quantity < data.quantity) {
      throw new AppError('Insufficient stock', 400);
    }

    const previousQty = inventory.quantity;

    const updated = await prisma.inventory.update({
      where: { 
        id: inventory.id,
        version: inventory.version // Optimistic lock
      },
      data: { 
        quantity: { decrement: data.quantity },
        version: { increment: 1 }
      },
      include: { product: true, store: true, location: true },
    });

    // Handle damaged items
    if (data.type === 'DAMAGED') {
      await prisma.inventory.update({
        where: { id: inventory.id },
        data: { damagedQty: { increment: data.quantity } },
      });
    }

    // Create transaction log
    await prisma.stockTransaction.create({
      data: {
        productId: data.productId,
        storeId: data.storeId,
        locationId: data.locationId,
        userId,
        type: data.type as 'STOCK_OUT' | 'DAMAGED' | 'RETURN',
        quantity: data.quantity,
        previousQty,
        newQty: updated.quantity,
        referenceId: data.referenceId,
        referenceType: data.referenceType,
        notes: data.notes,
      },
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(`store-${data.storeId}`).emit('inventory:updated', updated);

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Transfer between locations/stores
router.post('/transfer', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response, next) => {
  try {
    const data = transferSchema.parse(req.body);
    const userId = req.user!.id;

    // Decrease from source
    const fromInventory = await prisma.inventory.findFirst({
      where: {
        productId: data.productId,
        storeId: data.fromStoreId,
        locationId: data.fromLocationId,
      },
    });

    if (!fromInventory || fromInventory.quantity < data.quantity) {
      throw new AppError('Insufficient stock at source', 400);
    }

    const previousFromQty = fromInventory.quantity;

    await prisma.inventory.update({
      where: { id: fromInventory.id },
      data: { quantity: { decrement: data.quantity } },
    });

    // Create transaction log for source
    await prisma.stockTransaction.create({
      data: {
        productId: data.productId,
        storeId: data.fromStoreId,
        locationId: data.fromLocationId,
        userId,
        type: 'TRANSFER',
        quantity: -data.quantity,
        previousQty: previousFromQty,
        newQty: previousFromQty - data.quantity,
        notes: `Transfer to store ${data.toStoreId}. ${data.notes || ''}`,
      },
    });

    // Increase at destination
    let toInventory = await prisma.inventory.findFirst({
      where: {
        productId: data.productId,
        storeId: data.toStoreId,
        locationId: data.toLocationId,
      },
    });

    const previousToQty = toInventory?.quantity || 0;

    if (toInventory) {
      toInventory = await prisma.inventory.update({
        where: { id: toInventory.id },
        data: { quantity: { increment: data.quantity } },
        include: { product: true, store: true, location: true },
      });
    } else {
      toInventory = await prisma.inventory.create({
        data: {
          productId: data.productId,
          storeId: data.toStoreId,
          locationId: data.toLocationId,
          quantity: data.quantity,
        },
        include: { product: true, store: true, location: true },
      });
    }

    // Create transaction log for destination
    await prisma.stockTransaction.create({
      data: {
        productId: data.productId,
        storeId: data.toStoreId,
        locationId: data.toLocationId,
        userId,
        type: 'TRANSFER',
        quantity: data.quantity,
        previousQty: previousToQty,
        newQty: toInventory.quantity,
        notes: `Transfer from store ${data.fromStoreId}. ${data.notes || ''}`,
      },
    });

    // Emit socket events
    const io = req.app.get('io');
    io.to(`store-${data.fromStoreId}`).emit('inventory:updated', { ...fromInventory, quantity: previousFromQty - data.quantity });
    io.to(`store-${data.toStoreId}`).emit('inventory:updated', toInventory);

    res.json({ from: previousFromQty - data.quantity, to: toInventory });
  } catch (error) {
    next(error);
  }
});

// Manual adjustment
router.post('/adjust', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response, next) => {
  try {
    const { inventoryId, newQuantity, reason } = req.body;
    const userId = req.user!.id;

    const inventory = await prisma.inventory.findUnique({
      where: { id: inventoryId },
      include: { product: true, store: true },
    });

    if (!inventory) {
      throw new AppError('Inventory not found', 404);
    }

    const previousQty = inventory.quantity;
    const quantityChange = newQuantity - previousQty;

    const updated = await prisma.inventory.update({
      where: { id: inventoryId },
      data: { quantity: newQuantity },
      include: { product: true, store: true, location: true },
    });

    // Create transaction log
    await prisma.stockTransaction.create({
      data: {
        productId: inventory.productId,
        storeId: inventory.storeId,
        locationId: inventory.locationId,
        userId,
        type: 'ADJUSTMENT',
        quantity: quantityChange,
        previousQty,
        newQty: newQuantity,
        notes: reason || 'Manual adjustment',
      },
    });

    // Emit socket event
    const io = req.app.get('io');
    io.to(`store-${inventory.storeId}`).emit('inventory:updated', updated);

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Scan and update (for quick barcode scanning)
router.post('/scan', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { barcode, storeId } = req.body;

    if (!barcode || typeof barcode !== 'string') {
      throw new AppError('Valid barcode is required', 400);
    }

    console.log(`[Scan] Looking up barcode: ${barcode}`);

    let product;
    try {
      product = await prisma.product.findUnique({
        where: { barcode },
        include: { images: true },
      });
    } catch (dbError) {
      console.error('Database error looking up product:', dbError);
      throw new AppError('Database error while looking up product', 500);
    }

    if (!product) {
      console.log(`[Scan] Product not in local DB, checking external UPC services...`);
      // Not found locally, check external UPC service
      let externalProduct;
      try {
        externalProduct = await fetchProductByBarcode(barcode);
      } catch (externalError) {
        console.error('External UPC lookup error:', externalError);
        // Continue to 404 - external lookup failure shouldn't cause 500
        externalProduct = null;
      }

      if (externalProduct) {
        console.log(`[Scan] Found external product: ${externalProduct.name} from ${externalProduct.source}`);

        // Auto-save to local database for future lookups
        try {
          const newProduct = await prisma.product.create({
            data: {
              name: externalProduct.name,
              barcode: externalProduct.barcode,
              description: externalProduct.description || '',
              sku: externalProduct.barcode, // Use barcode as SKU
              retailPrice: externalProduct.retailPrice || 0,
              costPrice: 0, // Default cost price
              isActive: true,
            },
            include: { images: true },
          });
          console.log(`[Scan] Saved product to local DB: ${newProduct.name} (ID: ${newProduct.id})`);

          return res.json({
            product: newProduct,
            savedNew: true // Flag to tell client it was just saved
          });
        } catch (saveError: any) {
          // If save fails (e.g., duplicate barcode), still return the external product
          console.error('Failed to save product to local DB:', saveError?.message || saveError);

          // If it's a duplicate key error, the product already exists - fetch it
          if (saveError?.code === 'P2002') {
            const existingProduct = await prisma.product.findUnique({
              where: { barcode: externalProduct.barcode },
              include: { images: true }
            });
            if (existingProduct) {
              return res.json({
                product: existingProduct,
                savedNew: false
              });
            }
          }

          return res.json({
            product: {
              ...externalProduct,
              id: 'new',
              isExternal: true
            },
            savedNew: false
          });
        }
      }
      console.log(`[Scan] Product not found in any database`);
      throw new AppError('Product not found locally or in external database', 404);
    }

    console.log(`[Scan] Found local product: ${product.name}`);

    // Build inventory query - only add storeId if it's provided and valid
    const inventoryQuery: { productId: string; storeId?: string } = { productId: product.id };
    if (storeId) {
      inventoryQuery.storeId = storeId;
    }

    let inventory;
    try {
      inventory = await prisma.inventory.findFirst({
        where: inventoryQuery,
        include: { location: true },
      });
    } catch (dbError) {
      console.error('Database error looking up inventory:', dbError);
      throw new AppError('Database error while looking up inventory', 500);
    }

    res.json({ product, inventory });
  } catch (error) {
    next(error);
  }
});

// Batch update (bulk operations)
router.post('/batch', authenticate, authorize('ADMIN', 'MANAGER'), async (req: AuthRequest, res: Response, next) => {
  try {
    const batchSchema = z.object({
      storeId: z.string().uuid(),
      items: z.array(z.object({
        productId: z.string().uuid(),
        locationId: z.string().uuid().optional(),
        quantity: z.number().int(),
        type: z.enum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT']),
        notes: z.string().optional(),
      })),
    });

    const data = batchSchema.parse(req.body);
    const userId = req.user!.id;

    const results = await prisma.$transaction(async (tx) => {
      const processed = [];
      
      for (const item of data.items) {
        let inventory = await tx.inventory.findFirst({
          where: {
            productId: item.productId,
            storeId: data.storeId,
            locationId: item.locationId,
          },
        });

        const previousQty = inventory?.quantity || 0;
        let newQty = previousQty;

        if (item.type === 'STOCK_IN') {
          newQty += item.quantity;
        } else if (item.type === 'STOCK_OUT') {
          newQty -= item.quantity;
        } else if (item.type === 'ADJUSTMENT') {
          newQty = item.quantity;
        }

        if (newQty < 0) {
          throw new AppError(`Insufficient stock for product ${item.productId}`, 400);
        }

        if (inventory) {
          inventory = await tx.inventory.update({
            where: { id: inventory.id },
            data: { quantity: newQty, version: { increment: 1 } },
          });
        } else {
          inventory = await tx.inventory.create({
            data: {
              productId: item.productId,
              storeId: data.storeId,
              locationId: item.locationId,
              quantity: newQty,
            },
          });
        }

        await tx.stockTransaction.create({
          data: {
            productId: item.productId,
            storeId: data.storeId,
            locationId: item.locationId,
            userId,
            type: item.type as any,
            quantity: item.type === 'ADJUSTMENT' ? newQty - previousQty : (item.type === 'STOCK_IN' ? item.quantity : -item.quantity),
            previousQty,
            newQty,
            notes: item.notes || 'Batch operation',
          },
        });

        processed.push(inventory);
      }
      return processed;
    });

    res.json(results);
  } catch (error) {
    next(error);
  }
});

// Get low stock items
router.get('/low-stock', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { storeId } = req.query;

    const inventories = await prisma.inventory.findMany({
      where: storeId ? { storeId: storeId as string } : undefined,
      include: {
        product: true,
        store: true,
        location: true,
      },
    });

    const lowStock = inventories.filter(
      (inv) => inv.quantity <= (inv.product.reorderLevel || 10)
    );

    res.json(lowStock);
  } catch (error) {
    next(error);
  }
});

export default router;
