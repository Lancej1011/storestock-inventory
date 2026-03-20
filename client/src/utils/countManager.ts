/**
 * Count Manager for Shelf Scanning
 *
 * Tracks which products have been counted during a shelf scan session.
 * - Maintains a Map of productId -> count
 * - Prevents double-counting the same product instance
 * - Supports multi-item counting (e.g., 20 cans of beans)
 * - Handles object tracking across frames
 */

import { VisualEmbedding } from './productFingerprint';
import { compareEmbeddings } from './productFingerprint';

export interface CountedItem {
  productId: string;
  name: string;
  barcode?: string;
  count: number;
  confidence: number;
  lastSeen: number;
  boundingBoxes: [number, number, number, number][];
  thumbnail?: string; // Base64 thumbnail for verification
}

export interface ObjectInstance {
  id: string;
  productId?: string;
  name?: string;
  barcode?: string;
  embedding?: VisualEmbedding;
  bbox: [number, number, number, number];
  count: number;
  counted: boolean;
  firstSeen: number;
  lastSeen: number;
  confidence: number;
  matchType?: 'barcode' | 'ocr' | 'visual' | 'fused';
}

export interface CountSession {
  id: string;
  startTime: number;
  items: Map<string, CountedItem>;
  objects: Map<string, ObjectInstance>; // TrackID -> ObjectInstance
  totalCount: number;
  confirmedCount: number;
}

export class CountManager {
  private session: CountSession;
  private embeddingThreshold = 0.65; // Similarity threshold for matching
  private positionThreshold = 50; // Pixels threshold for position matching
  private maxAge = 5000; // ms before an object is considered stale

  constructor() {
    this.session = this.createNewSession();
  }

  /**
   * Create a new counting session
   */
  createNewSession(): CountSession {
    return {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      startTime: Date.now(),
      items: new Map(),
      objects: new Map(),
      totalCount: 0,
      confirmedCount: 0
    };
  }

  /**
   * Reset the session for a new scan
   */
  reset(): void {
    this.session = this.createNewSession();
  }

  /**
   * Get current session summary
   */
  getSession(): Readonly<CountSession> {
    return this.session;
  }

  /**
   * Get all counted items
   */
  getCountedItems(): CountedItem[] {
    return Array.from(this.session.items.values());
  }

  /**
   * Get total item count
   */
  getTotalCount(): number {
    return this.session.totalCount;
  }

  /**
   * Get confirmed (manually verified) count
   */
  getConfirmedCount(): number {
    return this.session.confirmedCount;
  }

  /**
   * Increment count for a specific product
   */
  incrementCount(
    productId: string,
    name: string,
    count = 1,
    confidence = 1.0,
    barcode?: string
  ): CountedItem {
    const existing = this.session.items.get(productId);

    if (existing) {
      existing.count += count;
      existing.lastSeen = Date.now();
      existing.confidence = Math.max(existing.confidence, confidence);
      this.session.totalCount += count;
      return existing;
    }

    const newItem: CountedItem = {
      productId,
      name,
      barcode,
      count,
      confidence,
      lastSeen: Date.now(),
      boundingBoxes: []
    };

    this.session.items.set(productId, newItem);
    this.session.totalCount += count;
    return newItem;
  }

  /**
   * Manually adjust count for a product
   */
  adjustCount(productId: string, newCount: number): boolean {
    const item = this.session.items.get(productId);
    if (!item) return false;

    const diff = newCount - item.count;
    item.count = newCount;
    this.session.totalCount += diff;
    return true;
  }

  /**
   * Mark an item as confirmed
   */
  confirmItem(productId: string): boolean {
    const item = this.session.items.get(productId);
    if (!item) return false;

    this.session.confirmedCount += item.count;
    return true;
  }

  /**
   * Remove an item from counting
   */
  removeItem(productId: string): boolean {
    const item = this.session.items.get(productId);
    if (!item) return false;

    this.session.totalCount -= item.count;
    this.session.items.delete(productId);
    return true;
  }

  /**
   * Process detected objects and update counts
   * Returns items that were newly counted
   */
  processDetections(
    detections: Array<{
      id: string;
      bbox: [number, number, number, number];
      embedding?: VisualEmbedding;
      productId?: string;
      name?: string;
      barcode?: string;
      confidence?: number;
      matchType?: 'barcode' | 'ocr' | 'visual' | 'fused';
    }>
  ): CountedItem[] {
    const newlyCounted: CountedItem[] = [];
    const now = Date.now();

    // First, mark all objects as potentially stale
    for (const [, obj] of this.session.objects) {
      if (now - obj.lastSeen > this.maxAge) {
        // Object hasn't been seen recently, might be gone
        obj.counted = true; // Don't recount if it comes back
      }
    }

    // Process current detections
    for (const detection of detections) {
      let matchedObj: ObjectInstance | undefined;

      // Try to match with existing tracked object
      for (const [, obj] of this.session.objects) {
        if (obj.counted) continue;

        // Check if same product
        if (detection.productId && obj.productId === detection.productId) {
          matchedObj = obj;
          break;
        }

        // Check embedding similarity
        if (detection.embedding && obj.embedding) {
          const similarity = compareEmbeddings(detection.embedding, obj.embedding);
          if (similarity >= this.embeddingThreshold) {
            matchedObj = obj;
            break;
          }
        }

        // Check position proximity
        if (this.isPositionClose(detection.bbox, obj.bbox)) {
          matchedObj = obj;
          break;
        }
      }

      if (matchedObj) {
        // Update existing object
        matchedObj.bbox = detection.bbox;
        matchedObj.lastSeen = now;
        if (detection.confidence) {
          matchedObj.confidence = Math.max(matchedObj.confidence, detection.confidence);
        }
      } else {
        // Create new tracked object
        const newObj: ObjectInstance = {
          id: detection.id,
          productId: detection.productId,
          name: detection.name,
          barcode: detection.barcode,
          embedding: detection.embedding,
          bbox: detection.bbox,
          count: 1,
          counted: false,
          firstSeen: now,
          lastSeen: now,
          confidence: detection.confidence || 0.5,
          matchType: detection.matchType
        };

        this.session.objects.set(detection.id, newObj);

        // If we have a product match, count it
        if (detection.productId && detection.name) {
          const counted = this.incrementCount(
            detection.productId,
            detection.name,
            1,
            detection.confidence || 0.5,
            detection.barcode
          );

          // Add bounding box for thumbnail generation
          counted.boundingBoxes.push(detection.bbox);

          // Mark object as counted
          newObj.counted = true;
          newObj.productId = detection.productId;

          newlyCounted.push(counted);
        }
      }
    }

    // Clean up stale objects
    this.cleanupStaleObjects();

    return newlyCounted;
  }

  /**
   * Check if two bounding boxes are position-close
   */
  private isPositionClose(
    bbox1: [number, number, number, number],
    bbox2: [number, number, number, number]
  ): boolean {
    const [x1, y1, w1, h1] = bbox1;
    const [x2, y2, w2, h2] = bbox2;

    const cx1 = x1 + w1 / 2;
    const cy1 = y1 + h1 / 2;
    const cx2 = x2 + w2 / 2;
    const cy2 = y2 + h2 / 2;

    const dist = Math.sqrt(Math.pow(cx1 - cx2, 2) + Math.pow(cy1 - cy2, 2));

    return dist < this.positionThreshold;
  }

  /**
   * Remove objects that haven't been seen in a while
   */
  private cleanupStaleObjects(): void {
    const now = Date.now();
    for (const [objId, obj] of this.session.objects) {
      if (now - obj.lastSeen > this.maxAge * 2) {
        this.session.objects.delete(objId);
      }
    }
  }

  /**
   * Get count for a specific product
   */
  getProductCount(productId: string): number {
    return this.session.items.get(productId)?.count || 0;
  }

  /**
   * Check if a product has been counted
   */
  isProductCounted(productId: string): boolean {
    const item = this.session.items.get(productId);
    return item !== undefined && item.count > 0;
  }

  /**
   * Generate a summary report
   */
  getSummary(): {
    totalProducts: number;
    totalItems: number;
    products: Array<{
      productId: string;
      name: string;
      count: number;
      confidence: number;
      barcode?: string;
    }>;
    duration: number;
  } {
    return {
      totalProducts: this.session.items.size,
      totalItems: this.session.totalCount,
      products: Array.from(this.session.items.values()).map(item => ({
        productId: item.productId,
        name: item.name,
        count: item.count,
        confidence: item.confidence,
        barcode: item.barcode
      })),
      duration: Date.now() - this.session.startTime
    };
  }

  /**
   * Export session as JSON
   */
  exportSession(): string {
    return JSON.stringify({
      ...this.session,
      items: Array.from(this.session.items.entries()),
      objects: Array.from(this.session.objects.entries())
    });
  }
}

// Singleton instance for the current scan session
let countManagerInstance: CountManager | null = null;

export function getCountManager(): CountManager {
  if (!countManagerInstance) {
    countManagerInstance = new CountManager();
  }
  return countManagerInstance;
}

export function resetCountManager(): void {
  if (countManagerInstance) {
    countManagerInstance.reset();
  }
}
