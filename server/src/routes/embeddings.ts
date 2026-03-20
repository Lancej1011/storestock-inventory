/**
 * Product Embeddings API
 *
 * Server-side storage for product visual embeddings.
 * Allows syncing embeddings across devices and sessions.
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * Get all embeddings for a store (for initial sync)
 */
router.get('/store/:storeId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { storeId } = req.params;
    const { limit = '1000' } = req.query;

    const embeddings = await prisma.productEmbedding.findMany({
      where: { storeId },
      take: parseInt(limit as string),
      orderBy: { lastUpdated: 'desc' }
    });

    res.json({
      embeddings: embeddings.map(e => ({
        productId: e.productId,
        barcode: e.barcode,
        name: e.name,
        embedding: JSON.parse(e.embedding as string),
        lastUpdated: e.lastUpdated
      })),
      count: embeddings.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get embedding for a specific product
 */
router.get('/product/:productId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { productId } = req.params;

    const embedding = await prisma.productEmbedding.findUnique({
      where: { productId }
    });

    if (!embedding) {
      res.status(404).json({ error: 'Embedding not found' });
      return;
    }

    res.json({
      productId: embedding.productId,
      barcode: embedding.barcode,
      name: embedding.name,
      embedding: JSON.parse(embedding.embedding as string),
      lastUpdated: embedding.lastUpdated
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get embedding by barcode
 */
router.get('/barcode/:barcode', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { barcode } = req.params;

    const embedding = await prisma.productEmbedding.findUnique({
      where: { barcode }
    });

    if (!embedding) {
      res.status(404).json({ error: 'Embedding not found' });
      return;
    }

    res.json({
      productId: embedding.productId,
      barcode: embedding.barcode,
      name: embedding.name,
      embedding: JSON.parse(embedding.embedding as string),
      lastUpdated: embedding.lastUpdated
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Save or update an embedding
 */
router.post('/', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { productId, barcode, name, embedding, storeId } = req.body;

    if (!productId || !embedding) {
      res.status(400).json({ error: 'productId and embedding are required' });
      return;
    }

    // Upsert embedding
    const saved = await prisma.productEmbedding.upsert({
      where: { productId },
      update: {
        barcode,
        name,
        embedding: JSON.stringify(embedding),
        lastUpdated: new Date()
      },
      create: {
        productId,
        barcode,
        name,
        embedding: JSON.stringify(embedding),
        storeId,
        lastUpdated: new Date()
      }
    });

    res.json({
      productId: saved.productId,
      barcode: saved.barcode,
      name: saved.name,
      lastUpdated: saved.lastUpdated
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Bulk save embeddings
 */
router.post('/bulk', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { embeddings, storeId } = req.body;

    if (!Array.isArray(embeddings)) {
      res.status(400).json({ error: 'embeddings array required' });
      return;
    }

    const results = [];

    for (const item of embeddings) {
      const { productId, barcode, name, embedding } = item;

      if (!productId || !embedding) continue;

      const saved = await prisma.productEmbedding.upsert({
        where: { productId },
        update: {
          barcode,
          name,
          embedding: JSON.stringify(embedding),
          lastUpdated: new Date()
        },
        create: {
          productId,
          barcode,
          name,
          embedding: JSON.stringify(embedding),
          storeId,
          lastUpdated: new Date()
        }
      });

      results.push({ productId: saved.productId, status: 'saved' });
    }

    res.json({ results, count: results.length });
  } catch (error) {
    next(error);
  }
});

/**
 * Delete an embedding
 */
router.delete('/:productId', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { productId } = req.params;

    await prisma.productEmbedding.delete({
      where: { productId }
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * Search products by embedding similarity (simple cosine similarity)
 * This is a basic implementation - for production, use vector DB like Pinecone
 */
router.post('/search', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { embedding, storeId, limit = 10, threshold = 0.7 } = req.body;

    if (!embedding) {
      res.status(400).json({ error: 'embedding required' });
      return;
    }

    // Get all embeddings for the store
    const products = await prisma.productEmbedding.findMany({
      where: storeId ? { storeId } : undefined,
      take: 1000
    });

    // Calculate cosine similarity
    const results = products.map(p => {
      const storedEmbedding = JSON.parse(p.embedding as string);
      const similarity = cosineSimilarity(embedding, storedEmbedding);
      return {
        productId: p.productId,
        barcode: p.barcode,
        name: p.name,
        confidence: similarity
      };
    });

    // Filter by threshold and sort
    const filtered = results
      .filter(r => r.confidence >= threshold)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    res.json({ results: filtered });
  } catch (error) {
    next(error);
  }
});

/**
 * Simple cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

export default router;
