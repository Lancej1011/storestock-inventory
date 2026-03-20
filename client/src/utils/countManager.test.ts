import { describe, it, expect, beforeEach } from 'vitest';
import { CountManager } from './countManager';

describe('CountManager', () => {
  let countManager: CountManager;

  beforeEach(() => {
    countManager = new CountManager();
  });

  describe('Basic Counting', () => {
    it('should start with zero count', () => {
      expect(countManager.getTotalCount()).toBe(0);
      expect(countManager.getConfirmedCount()).toBe(0);
    });

    it('should increment count for new product', () => {
      countManager.incrementCount('prod-1', 'Coca-Cola 500ml', 1, 0.9, '12345');

      expect(countManager.getTotalCount()).toBe(1);
      expect(countManager.getProductCount('prod-1')).toBe(1);
      expect(countManager.isProductCounted('prod-1')).toBe(true);
    });

    it('should increment count for same product', () => {
      countManager.incrementCount('prod-1', 'Coca-Cola 500ml', 1, 0.9, '12345');
      countManager.incrementCount('prod-1', 'Coca-Cola 500ml', 1, 0.9, '12345');

      expect(countManager.getTotalCount()).toBe(2);
      expect(countManager.getProductCount('prod-1')).toBe(2);
    });

    it('should handle different products independently', () => {
      countManager.incrementCount('prod-1', 'Coca-Cola 500ml', 2, 0.9, '12345');
      countManager.incrementCount('prod-2', 'Pepsi 500ml', 3, 0.85, '67890');

      expect(countManager.getTotalCount()).toBe(5);
      expect(countManager.getProductCount('prod-1')).toBe(2);
      expect(countManager.getProductCount('prod-2')).toBe(3);
    });
  });

  describe('Count Adjustment', () => {
    it('should adjust count for existing product', () => {
      countManager.incrementCount('prod-1', 'Coca-Cola 500ml', 5, 0.9);
      countManager.adjustCount('prod-1', 10);

      expect(countManager.getProductCount('prod-1')).toBe(10);
      expect(countManager.getTotalCount()).toBe(10);
    });

    it('should not adjust non-existent product', () => {
      const result = countManager.adjustCount('nonexistent', 10);
      expect(result).toBe(false);
    });

    it('should decrease total when adjusting down', () => {
      countManager.incrementCount('prod-1', 'Test', 10, 0.9);
      countManager.incrementCount('prod-2', 'Test2', 5, 0.9);
      countManager.adjustCount('prod-1', 3);

      expect(countManager.getTotalCount()).toBe(8); // 3 + 5
    });
  });

  describe('Process Detections', () => {
    it('should count newly detected products', () => {
      const detections = [
        {
          id: 'obj-1',
          bbox: [10, 10, 50, 50] as [number, number, number, number],
          productId: 'prod-1',
          name: 'Coca-Cola 500ml',
          confidence: 0.9
        },
        {
          id: 'obj-2',
          bbox: [100, 100, 50, 50] as [number, number, number, number],
          productId: 'prod-2',
          name: 'Pepsi 500ml',
          confidence: 0.85
        }
      ];

      const newlyCounted = countManager.processDetections(detections);

      expect(newlyCounted.length).toBe(2);
      expect(countManager.getTotalCount()).toBe(2);
    });

    it('should not double count same product in same frame', () => {
      const detections = [
        {
          id: 'obj-1',
          bbox: [10, 10, 50, 50] as [number, number, number, number],
          productId: 'prod-1',
          name: 'Coca-Cola 500ml',
          confidence: 0.9
        },
        {
          id: 'obj-2',
          bbox: [100, 10, 50, 50] as [number, number, number, number],
          productId: 'prod-1', // Same product!
          name: 'Coca-Cola 500ml',
          confidence: 0.9
        }
      ];

      countManager.processDetections(detections);

      // Should count both as separate instances
      expect(countManager.getProductCount('prod-1')).toBe(2);
    });

    it('should return newly counted items', () => {
      countManager.incrementCount('existing', 'Existing', 5, 0.9);

      const detections = [
        {
          id: 'obj-1',
          bbox: [10, 10, 50, 50] as [number, number, number, number],
          productId: 'new-1',
          name: 'New Product',
          confidence: 0.9
        }
      ];

      const newlyCounted = countManager.processDetections(detections);

      expect(newlyCounted.length).toBe(1);
      expect(newlyCounted[0].productId).toBe('new-1');
    });
  });

  describe('Session Management', () => {
    it('should generate session ID', () => {
      const session = countManager.getSession();
      expect(session.id).toBeDefined();
      expect(session.id).toContain('session-');
    });

    it('should track session start time', () => {
      const before = Date.now();
      const session = countManager.getSession();
      const after = Date.now();

      expect(session.startTime).toBeGreaterThanOrEqual(before);
      expect(session.startTime).toBeLessThanOrEqual(after);
    });

    it('should reset session', () => {
      countManager.incrementCount('prod-1', 'Test', 10, 0.9);
      const oldSessionId = countManager.getSession().id;
      countManager.reset();

      expect(countManager.getTotalCount()).toBe(0);
      expect(countManager.getSession().id).not.toBe(oldSessionId);
    });

    it('should export session as JSON', () => {
      countManager.incrementCount('prod-1', 'Test', 5, 0.9);

      const exported = countManager.exportSession();
      const parsed = JSON.parse(exported);

      expect(parsed.items).toBeDefined();
      expect(parsed.startTime).toBeDefined();
    });
  });

  describe('Summary', () => {
    it('should generate correct summary', () => {
      countManager.incrementCount('prod-1', 'Coca-Cola 500ml', 5, 0.9, '12345');
      countManager.incrementCount('prod-2', 'Pepsi 500ml', 3, 0.85, '67890');

      const summary = countManager.getSummary();

      expect(summary.totalProducts).toBe(2);
      expect(summary.totalItems).toBe(8);
      expect(summary.products.length).toBe(2);
      expect(summary.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Remove Item', () => {
    it('should remove item and update total', () => {
      countManager.incrementCount('prod-1', 'Test', 5, 0.9);
      countManager.incrementCount('prod-2', 'Test2', 3, 0.9);

      countManager.removeItem('prod-1');

      expect(countManager.getTotalCount()).toBe(3);
      expect(countManager.getProductCount('prod-1')).toBe(0);
      expect(countManager.isProductCounted('prod-1')).toBe(false);
    });

    it('should return false for non-existent item', () => {
      const result = countManager.removeItem('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('Confirm Items', () => {
    it('should confirm item and update confirmed count', () => {
      countManager.incrementCount('prod-1', 'Test', 5, 0.9);
      countManager.incrementCount('prod-2', 'Test2', 3, 0.9);

      countManager.confirmItem('prod-1');

      expect(countManager.getConfirmedCount()).toBe(5);
    });

    it('should return false for non-existent item', () => {
      const result = countManager.confirmItem('nonexistent');
      expect(result).toBe(false);
    });
  });
});
