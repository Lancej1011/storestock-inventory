/**
 * Shelf Scanner - AI-Powered Product Detection
 *
 * Uses multi-modal detection combining:
 * - Google Cloud Vision (Product Search, Label Detection, OCR)
 * - Visual embeddings (color, shape, deep features)
 * - Object tracking across frames
 * - Product fingerprint matching
 */

import {
  VisualEmbedding,
  createFingerprint,
  compareEmbeddings,
  findProductByEmbedding
} from './productFingerprint';
import { registerIdentifiedProduct, matchProduct, ProductMatch } from './multiModalMatcher';
import api from '../services/api';

// Object detection model
let cocoModel: any = null;
let modelLoading = false;
let visionEnabled = false; // DISABLED - Google Vision API returning 500 errors, needs fix

/**
 * Load the detection model
 */
export async function loadDetectionModel(): Promise<void> {
  if (cocoModel) return;

  while (modelLoading) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (cocoModel) return;

  modelLoading = true;
  try {
    const cocoSsd = await import('@tensorflow-models/coco-ssd');
    cocoModel = await cocoSsd.load();
    console.log('Detection model loaded');
  } catch (error) {
    console.error('Failed to load detection model:', error);
    throw error;
  } finally {
    modelLoading = false;
  }
}

export interface DetectedObject {
  id: string;
  bbox: [number, number, number, number];
  class: string;
  score: number;
  productMatch?: ProductMatch;
  embedding?: VisualEmbedding;
  trackedId?: string;
}

export interface DetectionResult {
  detectedObjects: DetectedObject[];
  newlyCounted: string[]; // Product IDs that were just counted
  totalCounts: Map<string, { name: string; count: number; barcode?: string }>;
}

// Non-product classes to filter out
const NON_PRODUCT_CLASSES = new Set([
  'person', 'car', 'bicycle', 'motorcycle', 'airplane', 'bus', 'train',
  'truck', 'boat', 'traffic light', 'fire hydrant', 'stop sign',
  'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep',
  'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'bed', 'dining table',
  'toilet', 'couch', 'potted plant', 'chair', 'tv', 'laptop', 'mouse',
  'remote', 'keyboard', 'cell phone', 'microwave', 'oven', 'toaster',
  'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors',
  'teddy bear', 'hair drier', 'toothbrush'
]);

const MIN_CONFIDENCE = 0.25;
const MAX_DETECTIONS = 30;

/**
 * Internal tracked object type
 */
interface TrackedObject {
  id: string;
  productId?: string;
  productName?: string;
  barcode?: string;
  bbox: [number, number, number, number];
  embedding?: VisualEmbedding;
  class: string;
  score: number;
  firstSeen: number;
  lastSeen: number;
  frameCount: number;
  matched: boolean;
}

/**
 * Advanced object tracker with visual embedding support
 */
export class ObjectTracker {
  private trackedObjects: Map<string, TrackedObject> = new Map();
  private nextId = 1;
  private embeddingThreshold = 0.60;

  /**
   * Track objects across frames with visual embedding matching
   */
  track(
    detections: Array<{
      bbox: [number, number, number, number];
      class: string;
      score: number;
    }>,
    embeddings?: VisualEmbedding[]
  ): DetectedObject[] {
    const now = Date.now();
    const result: DetectedObject[] = [];
    const usedIds = new Set<string>();

    // Mark all as unmatched initially
    for (const obj of this.trackedObjects.values()) {
      obj.matched = false;
    }

    for (let i = 0; i < detections.length; i++) {
      const det = detections[i];
      const embedding = embeddings?.[i];

      // Skip non-products
      if (NON_PRODUCT_CLASSES.has(det.class.toLowerCase()) || det.score < MIN_CONFIDENCE) {
        continue;
      }

      let matchedId: string | null = null;

      // Try to match with existing tracked object
      for (const [id, tracked] of this.trackedObjects) {
        if (usedIds.has(id) || tracked.matched) continue;

        // Same class check
        if (tracked.class !== det.class) continue;

        // Position proximity check
        if (this.isClose(det.bbox, tracked.bbox)) {
          matchedId = id;
          break;
        }

        // Visual embedding similarity check (for partial views)
        if (embedding && tracked.embedding) {
          const similarity = compareEmbeddings(embedding, tracked.embedding);
          if (similarity >= this.embeddingThreshold) {
            matchedId = id;
            break;
          }
        }
      }

      if (matchedId) {
        // Update existing tracked object
        const tracked = this.trackedObjects.get(matchedId)!;
        tracked.bbox = det.bbox;
        tracked.score = det.score;
        tracked.lastSeen = now;
        tracked.frameCount++;
        tracked.matched = true;
        if (embedding) {
          tracked.embedding = embedding;
        }

        result.push({
          id: matchedId,
          bbox: tracked.bbox,
          class: tracked.class,
          score: tracked.score,
          productMatch: tracked.productId ? {
            productId: tracked.productId,
            name: tracked.productName || '',
            barcode: tracked.barcode,
            confidence: tracked.score,
            matchType: 'visual'
          } : undefined,
          embedding: tracked.embedding,
          trackedId: matchedId
        });

        usedIds.add(matchedId);
      } else {
        // Create new tracked object
        const newId = `obj-${this.nextId++}`;
        const newTracked: TrackedObject = {
          id: newId,
          bbox: det.bbox,
          class: det.class,
          score: det.score,
          firstSeen: now,
          lastSeen: now,
          frameCount: 1,
          matched: true,
          embedding
        };

        this.trackedObjects.set(newId, newTracked);

        result.push({
          id: newId,
          bbox: newTracked.bbox,
          class: newTracked.class,
          score: newTracked.score,
          embedding: newTracked.embedding,
          trackedId: newId
        });

        usedIds.add(newId);
      }
    }

    // Clean up stale objects (not seen in 3 seconds)
    const staleThreshold = 3000;
    for (const [id, obj] of this.trackedObjects) {
      if (now - obj.lastSeen > staleThreshold) {
        this.trackedObjects.delete(id);
      }
    }

    return result;
  }

  private isClose(bbox1: [number, number, number, number], bbox2: [number, number, number, number]): boolean {
    const [x1, y1, w1, h1] = bbox1;
    const [x2, y2, w2, h2] = bbox2;

    const cx1 = x1 + w1 / 2;
    const cy1 = y1 + h1 / 2;
    const cx2 = x2 + w2 / 2;
    const cy2 = y2 + h2 / 2;

    const dist = Math.sqrt(Math.pow(cx1 - cx2, 2) + Math.pow(cy1 - cy2, 2));
    const avgSize = (w1 + h1 + w2 + h2) / 4;
    const threshold = Math.max(40, avgSize * 0.6);

    return dist < threshold;
  }

  /**
   * Update tracked object with product match info
   */
  setProductMatch(objectId: string, productId: string, productName: string, barcode?: string): void {
    const obj = this.trackedObjects.get(objectId);
    if (obj) {
      obj.productId = productId;
      obj.productName = productName;
      obj.barcode = barcode;
    }
  }

  /**
   * Get all tracked product IDs with counts
   */
  getProductCounts(): Map<string, { name: string; count: number; barcode?: string }> {
    const counts = new Map<string, { name: string; count: number; barcode?: string }>();

    for (const obj of this.trackedObjects.values()) {
      if (obj.productId) {
        const existing = counts.get(obj.productId);
        if (existing) {
          existing.count++;
        } else {
          counts.set(obj.productId, {
            name: obj.productName || obj.productId,
            count: 1,
            barcode: obj.barcode
          });
        }
      }
    }

    return counts;
  }

  /**
   * Reset tracker state
   */
  reset(): void {
    this.trackedObjects.clear();
    this.nextId = 1;
  }

  /**
   * Get count of tracked objects
   */
  getTrackedCount(): number {
    return this.trackedObjects.size;
  }

  /**
   * Get product match rate
   */
  getMatchRate(): number {
    let matched = 0;
    for (const obj of this.trackedObjects.values()) {
      if (obj.productId) matched++;
    }
    return this.trackedObjects.size > 0 ? matched / this.trackedObjects.size : 0;
  }
}

const tracker = new ObjectTracker();

// Throttle Google Vision API calls to avoid rate limiting
let lastVisionApiCall = 0;
const VISION_API_THROTTLE_MS = 3000; // 3 seconds between API calls

/**
 * Detect products using the enhanced multi-modal approach
 */
export async function detectProducts(
  video: HTMLVideoElement | HTMLImageElement,
  options?: {
    includeEmbeddings?: boolean;
    matchToRegistry?: boolean;
  }
): Promise<DetectedObject[]> {
  const { includeEmbeddings = true, matchToRegistry = true } = options || {};

  // Load model if needed
  if (!cocoModel) {
    await loadDetectionModel();
  }

  // Get raw detections
  const detections = await cocoModel.detect(video, MAX_DETECTIONS, MIN_CONFIDENCE);

  // Extract embeddings if requested
  let embeddings: VisualEmbedding[] | undefined;
  if (includeEmbeddings) {
    embeddings = [];
    for (const det of detections) {
      try {
        const embedding = await createFingerprint(video, det.bbox as [number, number, number, number]);
        embeddings.push(embedding);
      } catch {
        embeddings.push({
          color: { r: [], g: [], b: [], dominant: [] },
          shape: { aspectRatio: 1, compactness: 0.5, solidity: 0.5, eccentricity: 0.5 },
          deepFeatures: [],
          timestamp: Date.now()
        });
      }
    }
  }

  // Track objects
  const tracked = tracker.track(detections as any, embeddings);

  // Try to match to registered products
  if (matchToRegistry && embeddings) {
    for (const obj of tracked) {
      if (obj.embedding) {
        const match = findProductByEmbedding(obj.embedding, 0.55);
        if (match) {
          obj.productMatch = {
            productId: match.productId,
            name: match.productId,
            confidence: match.confidence,
            matchType: 'visual'
          };
          tracker.setProductMatch(obj.id, match.productId, match.productId);
        }
      }
    }
  }

  return tracked;
}

/**
 * Detect products with full multi-modal matching (barcode, OCR, visual)
 */
export async function detectProductsMultiModal(
  video: HTMLVideoElement | HTMLImageElement,
  context: {
    barcode?: string;
    ocrText?: string;
  }
): Promise<DetectionResult> {
  const detectedObjects = await detectProducts(video, { includeEmbeddings: true });

  // Try to fuse with barcode/OCR if available
  if (context.barcode || context.ocrText) {
    for (const obj of detectedObjects) {
      if (obj.embedding && !obj.productMatch) {
        const { primaryMatch } = await matchProduct({
          barcode: context.barcode,
          embedding: obj.embedding,
          imageElement: video,
          bbox: obj.bbox
        });

        if (primaryMatch) {
          obj.productMatch = primaryMatch;
          tracker.setProductMatch(obj.id, primaryMatch.productId, primaryMatch.name, primaryMatch.barcode);
        }
      }
    }
  }

  // Use Google Vision API for real product recognition (throttled)
  if (visionEnabled) {
    const now = Date.now();
    if (now - lastVisionApiCall >= VISION_API_THROTTLE_MS) {
      lastVisionApiCall = now;
      try {
        await enhanceWithGoogleVision(video, detectedObjects);
      } catch (err: any) {
        // Disable Vision API on auth failures to prevent repeated failed calls
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          console.warn('Google Vision auth failed - disabling (user may need to re-login)');
          // Note: In production, you'd want to re-enable on re-login
        } else {
          console.warn('Google Vision enhancement failed:', err?.message || err);
        }
      }
    }
  }

  // Update counts
  const counts = tracker.getProductCounts();

  // Get newly counted items
  const newlyCounted: string[] = [];
  for (const obj of detectedObjects) {
    if (obj.productMatch?.productId) {
      newlyCounted.push(obj.productMatch.productId);
    }
  }

  return {
    detectedObjects,
    newlyCounted,
    totalCounts: counts
  };
}

/**
 * Enhance detection results using Google Cloud Vision API
 * This provides real product recognition for retail items using:
 * - Label detection for general product types
 * - OCR for reading brand names directly from packaging
 */
async function enhanceWithGoogleVision(
  video: HTMLVideoElement | HTMLImageElement,
  detectedObjects: DetectedObject[]
): Promise<void> {
  // Convert video frame to base64 for API
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width: number, height: number;
  if ('videoWidth' in video) {
    width = video.videoWidth;
    height = video.videoHeight;
  } else {
    width = video.naturalWidth;
    height = video.naturalHeight;
  }

  // Resize for API efficiency
  const maxSize = 1024;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imageData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

  try {
    // Make both API calls in parallel for speed
    const [labelsResponse, ocrResponse] = await Promise.allSettled([
      api.post('/vision/detect-labels', { image: imageData, maxResults: 20 }),
      api.post('/vision/extract-text', { image: imageData, maxResults: 30 })
    ]);

    const labels = labelsResponse.status === 'fulfilled' ? labelsResponse.value.data.labels || [] : [];
    const ocrTexts = ocrResponse.status === 'fulfilled' ? ocrResponse.value.data.texts || [] : [];

    // Extract readable text from OCR with bounding box info
    const ocrData: Array<{ text: string; boundingBox?: any }> = ocrTexts
      .filter((t: { text: string }) => t.text && t.text.length > 2);

    // Known retail product names to look for
    const knownProducts = [
      { search: 'gatorade', name: 'Gatorade' },
      { search: 'powerade', name: 'Powerade' },
      { search: 'vitaminwater', name: 'Vitaminwater' },
      { search: 'pepsi', name: 'Pepsi' },
      { search: 'coca cola', name: 'Coca Cola' },
      { search: 'coke', name: 'Coca Cola' },
      { search: 'sprite', name: 'Sprite' },
      { search: 'fanta', name: 'Fanta' },
      { search: 'doritos', name: 'Doritos' },
      { search: 'lays', name: 'Lays' },
      { search: 'cheetos', name: 'Cheetos' },
      { search: 'fritos', name: 'Fritos' },
      { search: 'ruffles', name: 'Ruffles' },
      { search: 'tostitos', name: 'Tostitos' },
      { search: 'oreo', name: 'Oreo' },
      { search: 'chips ahoy', name: 'Chips Ahoy' },
      { search: 'red bull', name: 'Red Bull' },
      { search: 'monster', name: 'Monster' },
      { search: 'rockstar', name: 'Rockstar' },
    ];

    // Map Vision labels and OCR results to detected objects
    // ONLY match if the OCR text bounding box overlaps with the detected object
    for (const obj of detectedObjects) {
      if (obj.productMatch) continue; // Already matched

      const [objX, objY, objW, objH] = obj.bbox;

      // Check OCR texts for product matches near this object
      for (const ocr of ocrData) {
        if (!ocr.boundingBox) continue;

        // Get OCR text bounding polygon vertices
        const vertices = ocr.boundingBox.vertices || [];
        if (vertices.length === 0) continue;

        // Calculate OCR bounding box
        const minX = Math.min(...vertices.map((v: any) => v.x || 0));
        const maxX = Math.max(...vertices.map((v: any) => v.x || 0));
        const minY = Math.min(...vertices.map((v: any) => v.y || 0));
        const maxY = Math.max(...vertices.map((v: any) => v.y || 0));

        // Check if OCR box overlaps with object box (with some tolerance)
        const overlapX = Math.max(0, Math.min(maxX, objX + objW) - Math.max(minX, objX));
        const overlapY = Math.max(0, Math.min(maxY, objY + objH) - Math.max(minY, objY));

        // If there's significant overlap, this OCR text belongs to this object
        if (overlapX > 10 && overlapY > 10) {
          const ocrText = ocr.text.toLowerCase();

          for (const product of knownProducts) {
            if (ocrText.includes(product.search)) {
              obj.productMatch = {
                productId: `vision-${product.search.replace(/\s+/g, '-')}`,
                name: product.name,
                confidence: 0.92,
                matchType: 'visual'
              };
              tracker.setProductMatch(obj.id, obj.productMatch.productId, product.name);
              break; // Stop at first match for this object
            }
          }
          break; // Found relevant OCR for this object
        }
      }
    }

    // Second pass: only use label detection for objects that don't have OCR matches
    for (const obj of detectedObjects) {
      if (obj.productMatch) continue; // Already matched by OCR

      const objClass = obj.class.toLowerCase();

      // Fall back to label matching
      const relevantLabels = labels.filter((label: { description: string; confidence: number }) => {
        const desc = label.description.toLowerCase();

        // Match labels to object class
        if (objClass === 'bottle' && (desc.includes('bottle') || desc.includes('drink') || desc.includes('beverage'))) return true;
        if (objClass === 'cup' && (desc.includes('cup') || desc.includes('drink') || desc.includes('coffee'))) return true;
        if (objClass === 'box' && (desc.includes('box') || desc.includes('cereal') || desc.includes('snack'))) return true;
        if (objClass === 'bag' && (desc.includes('bag') || desc.includes('chips') || desc.includes('snack'))) return true;
        if (objClass === 'can' && (desc.includes('can') || desc.includes('soda') || desc.includes('drink'))) return true;

        return false;
      });

      if (relevantLabels.length > 0) {
        const bestLabel = relevantLabels[0];
        obj.productMatch = {
          productId: `vision-${bestLabel.description.toLowerCase().replace(/\s+/g, '-')}`,
          name: bestLabel.description,
          confidence: bestLabel.confidence * 0.7, // Scale confidence
          matchType: 'visual'
        };
        tracker.setProductMatch(obj.id, obj.productMatch.productId, bestLabel.description);
      }
    }
  } catch (err) {
    // Vision API failed - continue with local detection only
    console.warn('Google Vision API enhancement failed:', err);
  }
}

/**
 * Register a detected object with product info
 */
export async function registerDetection(
  objectId: string,
  productId: string,
  name: string,
  barcode: string,
  video: HTMLVideoElement | HTMLImageElement,
  bbox: [number, number, number, number]
): Promise<void> {
  // Register product for future visual matching
  await registerIdentifiedProduct(productId, barcode, name, video, bbox);

  // Update tracker
  tracker.setProductMatch(objectId, productId, name, barcode);
}

/**
 * Reset tracker for new session
 */
export function resetTracker(): void {
  tracker.reset();
}

/**
 * Get current product counts
 */
export function getCurrentCounts(): Map<string, { name: string; count: number; barcode?: string }> {
  return tracker.getProductCounts();
}

/**
 * Get tracking statistics
 */
export function getTrackerStats(): {
  trackedCount: number;
  matchedCount: number;
  matchRate: number;
} {
  return {
    trackedCount: tracker.getTrackedCount(),
    matchedCount: tracker.getProductCounts().size,
    matchRate: tracker.getMatchRate()
  };
}
