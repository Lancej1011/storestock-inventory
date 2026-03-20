/**
 * Aisle Layout API
 *
 * Stores and manages aisle/store layout information
 * for location-aware product recognition.
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * Get all aisles for a store
 */
router.get('/store/:storeId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { storeId } = req.params;

    const aisles = await prisma.aisleLayout.findMany({
      where: { storeId },
      orderBy: { aisleNumber: 'asc' }
    });

    res.json(aisles);
  } catch (error) {
    next(error);
  }
});

/**
 * Get a specific aisle
 */
router.get('/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    const aisle = await prisma.aisleLayout.findUnique({
      where: { id }
    });

    if (!aisle) {
      res.status(404).json({ error: 'Aisle not found' });
      return;
    }

    res.json(aisle);
  } catch (error) {
    next(error);
  }
});

/**
 * Create or update an aisle layout
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { storeId, aisleNumber, description, categories, dominantProducts, confidence } = req.body;

    if (!storeId || !aisleNumber) {
      res.status(400).json({ error: 'storeId and aisleNumber are required' });
      return;
    }

    const aisle = await prisma.aisleLayout.upsert({
      where: {
        storeId_aisleNumber: {
          storeId,
          aisleNumber
        }
      },
      update: {
        description,
        categories,
        dominantProducts,
        confidence: confidence || 0.5,
        lastSeen: new Date()
      },
      create: {
        storeId,
        aisleNumber,
        description,
        categories: categories || [],
        dominantProducts: dominantProducts || [],
        confidence: confidence || 0.5
      }
    });

    res.json(aisle);
  } catch (error) {
    next(error);
  }
});

/**
 * Update an aisle with newly observed products
 */
router.post('/:id/observe', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;
    const { observedProducts, confidenceBoost = 0.1 } = req.body;

    if (!observedProducts || !Array.isArray(observedProducts)) {
      res.status(400).json({ error: 'observedProducts array required' });
      return;
    }

    const aisle = await prisma.aisleLayout.findUnique({ where: { id } });
    if (!aisle) {
      res.status(404).json({ error: 'Aisle not found' });
      return;
    }

    // Merge observed products with existing dominant products
    const existingProducts = new Set(aisle.dominantProducts);
    observedProducts.forEach(p => existingProducts.add(p));

    // Keep top 20 products
    const updatedProducts = Array.from(existingProducts).slice(0, 20);

    const updated = await prisma.aisleLayout.update({
      where: { id },
      data: {
        dominantProducts: updatedProducts,
        confidence: Math.min(1, aisle.confidence + confidenceBoost),
        lastSeen: new Date()
      }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * Delete an aisle layout
 */
router.delete('/:id', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { id } = req.params;

    await prisma.aisleLayout.delete({
      where: { id }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * Suggest aisle based on product observation
 */
router.post('/suggest', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { storeId, productName, categories } = req.body;

    if (!storeId) {
      res.status(400).json({ error: 'storeId required' });
      return;
    }

    // Find matching aisles
    const aisles = await prisma.aisleLayout.findMany({
      where: { storeId }
    });

    // Score aisles by relevance
    const scored = aisles.map(aisle => {
      let score = aisle.confidence;

      // Check if any category matches
      if (categories && categories.length > 0) {
        const matchingCategories = categories.filter(c =>
          aisle.categories.includes(c)
        );
        score += matchingCategories.length * 0.1;
      }

      // Check if product name suggests this aisle (simple keyword matching)
      if (productName && aisle.description) {
        const lowerName = productName.toLowerCase();
        const lowerDesc = aisle.description.toLowerCase();
        if (lowerDesc.includes(lowerName) || lowerName.includes(lowerDesc)) {
          score += 0.2;
        }
      }

      return { aisle, score };
    });

    // Sort by score and return top match
    scored.sort((a, b) => b.score - a.score);

    if (scored.length > 0 && scored[0].score > 0.3) {
      res.json({
        suggestedAisle: scored[0].aisle,
        confidence: scored[0].score,
        alternatives: scored.slice(1, 3).map(s => ({ aisle: s.aisle, score: s.score }))
      });
    } else {
      res.json({ suggestedAisle: null, confidence: 0, alternatives: [] });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
