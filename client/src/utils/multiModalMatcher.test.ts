import { describe, it, expect } from 'vitest';
import { fuseMatches, registerIdentifiedProduct, ProductMatch } from './multiModalMatcher';

describe('MultiModalMatcher', () => {
  describe('fuseMatches', () => {
    it('should return null for empty matches', () => {
      const result = fuseMatches([]);
      expect(result).toBeNull();
    });

    it('should return single match as-is', () => {
      const matches: ProductMatch[] = [
        {
          productId: 'prod-1',
          name: 'Test Product',
          confidence: 0.8,
          matchType: 'barcode'
        }
      ];

      const result = fuseMatches(matches);
      expect(result).not.toBeNull();
      expect(result?.productId).toBe('prod-1');
      expect(result?.confidence).toBe(0.8);
    });

    it('should fuse multiple matches for same product', () => {
      const matches: ProductMatch[] = [
        {
          productId: 'prod-1',
          name: 'Test Product',
          confidence: 0.9,
          matchType: 'barcode'
        },
        {
          productId: 'prod-1',
          name: 'Test Product',
          confidence: 0.7,
          matchType: 'visual'
        },
        {
          productId: 'prod-2',
          name: 'Other Product',
          confidence: 0.6,
          matchType: 'ocr'
        }
      ];

      const result = fuseMatches(matches);

      expect(result).not.toBeNull();
      expect(result?.productId).toBe('prod-1');
      expect(result?.matchType).toBe('fused');
      // Should have higher confidence due to fusion
      expect(result?.confidence).toBeGreaterThan(0.7);
    });

    it('should return highest confidence match when no fusion possible', () => {
      const matches: ProductMatch[] = [
        {
          productId: 'prod-1',
          name: 'Product 1',
          confidence: 0.5,
          matchType: 'visual'
        },
        {
          productId: 'prod-2',
          name: 'Product 2',
          confidence: 0.8,
          matchType: 'barcode'
        }
      ];

      const result = fuseMatches(matches);

      expect(result).not.toBeNull();
      expect(result?.productId).toBe('prod-2');
    });

    it('should return null if fused confidence too low', () => {
      const matches: ProductMatch[] = [
        {
          productId: 'prod-1',
          name: 'Test',
          confidence: 0.2,
          matchType: 'visual'
        },
        {
          productId: 'prod-1',
          name: 'Test',
          confidence: 0.2,
          matchType: 'ocr'
        }
      ];

      const result = fuseMatches(matches);
      // Fused confidence is below threshold (0.6), should return null
      expect(result).toBeNull();
    });
  });

  describe('registerIdentifiedProduct', () => {
    it('should not throw when called without image data', async () => {
      // This tests that registration works with minimal data
      // In real usage, you'd want image data
      await expect(
        registerIdentifiedProduct('prod-1', '12345', 'Test Product')
      ).resolves.not.toThrow();
    });
  });
});
