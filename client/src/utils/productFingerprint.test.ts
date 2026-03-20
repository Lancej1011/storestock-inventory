import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractShapeFeatures,
  registerProduct,
  findProductByBarcode,
  findProductByEmbedding,
  clearRegistry,
  compareEmbeddings,
  VisualEmbedding
} from './productFingerprint';

describe('Product Fingerprint Service', () => {
  beforeEach(() => {
    clearRegistry();
  });

  describe('extractShapeFeatures', () => {
    it('should extract shape features from bounding box', () => {
      const features = extractShapeFeatures([10, 20, 50, 100]);

      expect(features.aspectRatio).toBeCloseTo(0.5, 1);
      expect(features.compactness).toBeGreaterThan(0);
      expect(features.compactness).toBeLessThanOrEqual(1);
      expect(features.eccentricity).toBeGreaterThan(0);
    });

    it('should handle square boxes', () => {
      const features = extractShapeFeatures([0, 0, 50, 50]);

      expect(features.aspectRatio).toBeCloseTo(1, 2);
      expect(features.eccentricity).toBeCloseTo(0, 2);
    });

    it('should clamp values to valid ranges', () => {
      // Very wide rectangle
      const features = extractShapeFeatures([0, 0, 1000, 10]);

      expect(features.aspectRatio).toBeLessThanOrEqual(3);
      expect(features.aspectRatio).toBeGreaterThanOrEqual(0.33);
    });
  });

  describe('compareEmbeddings', () => {
    it('should return high similarity for similar embeddings', () => {
      const embedding1: VisualEmbedding = {
        color: { r: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], g: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dominant: ['red:128'] },
        shape: { aspectRatio: 0.5, compactness: 0.8, solidity: 0.9, eccentricity: 0.3 },
        deepFeatures: [0.9, 0.1, 0, 0],
        timestamp: Date.now()
      };

      const embedding2: VisualEmbedding = {
        color: { r: [0.9, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], g: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dominant: ['red:120'] },
        shape: { aspectRatio: 0.52, compactness: 0.78, solidity: 0.88, eccentricity: 0.32 },
        deepFeatures: [0.9, 0.1, 0, 0],
        timestamp: Date.now()
      };

      const similarity = compareEmbeddings(embedding1, embedding2);
      expect(similarity).toBeGreaterThan(0.6);
    });

    it('should return low similarity for different embeddings', () => {
      const embedding1: VisualEmbedding = {
        color: { r: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], g: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dominant: ['red:200'] },
        shape: { aspectRatio: 0.2, compactness: 0.3, solidity: 0.4, eccentricity: 0.9 },
        deepFeatures: [1, 0, 0, 0],
        timestamp: Date.now()
      };

      const embedding2: VisualEmbedding = {
        color: { r: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], g: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], b: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dominant: ['blue:200'] },
        shape: { aspectRatio: 2.0, compactness: 0.9, solidity: 0.95, eccentricity: 0.1 },
        deepFeatures: [0, 0, 0, 1],
        timestamp: Date.now()
      };

      const similarity = compareEmbeddings(embedding1, embedding2);
      expect(similarity).toBeLessThan(0.5);
    });
  });

  describe('registerProduct', () => {
    it('should register a product with barcode', () => {
      const embedding: VisualEmbedding = {
        color: { r: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], g: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dominant: ['red:128'] },
        shape: { aspectRatio: 0.5, compactness: 0.8, solidity: 0.9, eccentricity: 0.3 },
        deepFeatures: [1, 0, 0, 0],
        timestamp: Date.now()
      };

      registerProduct('prod-1', embedding, 'Test Product', '123456789');

      const productId = findProductByBarcode('123456789');
      expect(productId).toBe('prod-1');
    });

    it('should allow finding product by embedding', () => {
      const embedding: VisualEmbedding = {
        color: { r: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], g: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dominant: ['red:128'] },
        shape: { aspectRatio: 0.5, compactness: 0.8, solidity: 0.9, eccentricity: 0.3 },
        deepFeatures: [1, 0, 0, 0],
        timestamp: Date.now()
      };

      registerProduct('prod-1', embedding, 'Test Product', '123456789');

      const searchEmbedding: VisualEmbedding = {
        color: { r: [0.9, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], g: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], dominant: ['red:120'] },
        shape: { aspectRatio: 0.52, compactness: 0.78, solidity: 0.88, eccentricity: 0.32 },
        deepFeatures: [0.9, 0.1, 0, 0],
        timestamp: Date.now()
      };

      const match = findProductByEmbedding(searchEmbedding, 0.5);
      expect(match).not.toBeNull();
      expect(match?.productId).toBe('prod-1');
    });
  });
});
