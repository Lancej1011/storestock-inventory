/**
 * Product Fingerprint Service
 *
 * Creates visual fingerprints for products using:
 * - Color histograms (dominant colors)
 * - Shape features (aspect ratio, texture)
 * - MobileNet embeddings for deep visual features (1280-dim)
 *
 * Enables re-identification of products from partial views,
 * multiple angles, and under varying lighting conditions.
 */

import * as tf from '@tensorflow/tfjs';

// Use MobileNet for true embeddings
let mobilenetModel: any = null;
let mobilenetLoaded = false;

export interface ColorHistogram {
  r: number[];
  g: number[];
  b: number[];
  dominant: string[];
}

export interface ShapeFeatures {
  aspectRatio: number;
  compactness: number;
  solidity: number;
  eccentricity: number;
}

export interface VisualEmbedding {
  color: ColorHistogram;
  shape: ShapeFeatures;
  deepFeatures: number[];
  timestamp: number;
}

export interface ProductFingerprint {
  productId: string;
  barcode?: string;
  name: string;
  embedding: VisualEmbedding;
  partialViews: VisualEmbedding[]; // Multiple views for robustness
}

// Store for registered product fingerprints
const productRegistry = new Map<string, ProductFingerprint>();
const barcodeToProductId = new Map<string, string>();

/**
 * Load MobileNet model for deep embeddings
 * Uses MobileNet V2 to extract 1280-dimensional embeddings
 */
export async function loadEmbeddingModel(): Promise<void> {
  if (mobilenetLoaded) return;

  try {
    // Initialize TensorFlow.js backend (WebGL for GPU acceleration)
    await tf.setBackend('webgl');
    await tf.ready();
    console.log('TensorFlow.js backend:', tf.getBackend());

    // Load MobileNet V2 for true embedding extraction
    const mobilenet = await import('@tensorflow-models/mobilenet');
    mobilenetModel = await mobilenet.load({
      version: 2,
      alpha: 1.0
    });
    mobilenetLoaded = true;
    console.log('MobileNet embedding model loaded');
  } catch (error) {
    console.error('Failed to load embedding model:', error);
    // Fallback: try WebGPU or WASM if WebGL fails
    try {
      await tf.setBackend('wasm');
      await tf.ready();
      console.log('TensorFlow.js using WASM backend');
      const mobilenet = await import('@tensorflow-models/mobilenet');
      mobilenetModel = await mobilenet.load({
        version: 2,
        alpha: 1.0
      });
      mobilenetLoaded = true;
      console.log('MobileNet embedding model loaded (WASM)');
    } catch (wasmError) {
      console.error('WASM backend also failed:', wasmError);
      throw wasmError;
    }
  }
}

/**
 * Extract deep features from an image region using MobileNet
 * Returns 1280-dimensional embedding vector
 */
async function extractDeepFeatures(
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  bbox: [number, number, number, number]
): Promise<number[]> {
  if (!mobilenetLoaded) {
    await loadEmbeddingModel();
  }

  if (!mobilenetModel) {
    console.warn('MobileNet model not loaded');
    return [];
  }

  try {
    // Create a canvas to crop the region
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const [x, y, width, height] = bbox;

    // Handle video dimensions
    let sourceWidth: number, sourceHeight: number;
    if ('videoWidth' in imageElement) {
      sourceWidth = imageElement.videoWidth;
      sourceHeight = imageElement.videoHeight;
    } else if ('naturalWidth' in imageElement) {
      sourceWidth = imageElement.naturalWidth;
      sourceHeight = imageElement.naturalHeight;
    } else {
      sourceWidth = imageElement.width;
      sourceHeight = imageElement.height;
    }

    // Calculate display dimensions
    const displayWidth = imageElement.clientWidth || sourceWidth;
    const displayHeight = imageElement.clientHeight || sourceHeight;
    const scaleX = sourceWidth / displayWidth;
    const scaleY = sourceHeight / displayHeight;

    // Scale bbox to source coordinates
    const sx = x * scaleX;
    const sy = y * scaleY;
    const sw = width * scaleX;
    const sh = height * scaleY;

    // Create cropped canvas at MobileNet input size (224x224)
    const inputSize = 224;
    canvas.width = inputSize;
    canvas.height = inputSize;

    ctx.drawImage(
      imageElement,
      sx, sy, sw, sh,
      0, 0, inputSize, inputSize
    );

    // MobileNet.infer() returns a 1280-dimensional embedding tensor
    // The second parameter 'true' means we're doing feature extraction (not classification)
    const embedding = mobilenetModel.infer(canvas as any, true);

    // Get the tensor data as an array
    const data = await embedding.data();

    // Convert to regular array
    const features = Array.from(data as unknown as number[]);

    // Clean up tensor
    embedding.dispose();

    return features;
  } catch (error) {
    console.error('Deep feature extraction error:', error);
    return [];
  }
}

/**
 * Extract color histogram from image region
 */
export function extractColorHistogram(
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  bbox: [number, number, number, number]
): ColorHistogram {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { r: [], g: [], b: [], dominant: [] };
  }

  const [x, y, width, height] = bbox;

  // Handle source dimensions
  let sourceWidth: number, sourceHeight: number, source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement = imageElement;
  if ('videoWidth' in imageElement) {
    sourceWidth = imageElement.videoWidth;
    sourceHeight = imageElement.videoHeight;
  } else if ('naturalWidth' in imageElement) {
    sourceWidth = imageElement.naturalWidth;
    sourceHeight = imageElement.naturalHeight;
  } else {
    sourceWidth = imageElement.width;
    sourceHeight = imageElement.height;
  }

  // Calculate scale
  const displayWidth = imageElement.clientWidth || sourceWidth;
  const displayHeight = imageElement.clientHeight || sourceHeight;
  const scaleX = sourceWidth / displayWidth;
  const scaleY = sourceHeight / displayHeight;

  // Scale bbox
  const sx = Math.max(0, x * scaleX);
  const sy = Math.max(0, y * scaleY);
  const sw = Math.min(width * scaleX, sourceWidth - sx);
  const sh = Math.min(height * scaleY, sourceHeight - sy);

  // Sample at lower resolution for performance
  const sampleSize = 64;
  canvas.width = sampleSize;
  canvas.height = sampleSize;

  try {
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sampleSize, sampleSize);
  } catch {
    return { r: [], g: [], b: [], dominant: [] };
  }

  const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
  const data = imageData.data;

  // Initialize bins for RGB (32 bins each)
  const binCount = 32;
  const rBins = new Array(binCount).fill(0);
  const gBins = new Array(binCount).fill(0);
  const bBins = new Array(binCount).fill(0);

  // Count pixels in each bin
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    rBins[Math.min(binCount - 1, Math.floor(r / 8))]++;
    gBins[Math.min(binCount - 1, Math.floor(g / 8))]++;
    bBins[Math.min(binCount - 1, Math.floor(b / 8))]++;
  }

  // Normalize histograms
  const totalPixels = data.length / 4;
  const rNorm = rBins.map(v => v / totalPixels);
  const gNorm = gBins.map(v => v / totalPixels);
  const bNorm = bBins.map(v => v / totalPixels);

  // Find dominant colors
  const dominant: string[] = [];
  const allBins = [
    { color: 'red', value: rNorm },
    { color: 'green', value: gNorm },
    { color: 'blue', value: bNorm }
  ];

  for (const { color, value } of allBins) {
    const maxIdx = value.indexOf(Math.max(...value));
    const intensity = maxIdx * 8 + 4;
    if (intensity > 40) { // Only count non-black colors
      dominant.push(`${color}:${intensity}`);
    }
  }

  return {
    r: rNorm,
    g: gNorm,
    b: bNorm,
    dominant
  };
}

/**
 * Extract shape features from bounding box
 */
export function extractShapeFeatures(bbox: [number, number, number, number]): ShapeFeatures {
  const [, , width, height] = bbox;
  const aspectRatio = width / Math.max(1, height);
  const area = width * height;
  const perimeter = 2 * (width + height);
  const compactness = (4 * Math.PI * area) / Math.max(1, perimeter * perimeter);
  // Solidity is simplified - uses aspect ratio variation as proxy for irregular shapes
  // Real solidity would require contour analysis
  const solidity = 1 - (Math.abs(width - height) / Math.max(width, height)) * 0.2;
  const eccentricity = Math.abs(width - height) / Math.max(width, height);

  return {
    aspectRatio: Math.min(3, Math.max(0.33, aspectRatio)),
    compactness: Math.min(1, Math.max(0, compactness)),
    solidity: Math.min(1, Math.max(0, solidity)),
    eccentricity: Math.min(1, Math.max(0, eccentricity))
  };
}

/**
 * Create a complete fingerprint for an image region
 */
export async function createFingerprint(
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  bbox: [number, number, number, number],
  _productId?: string,
  _barcode?: string
): Promise<VisualEmbedding> {
  const [color, shape, deepFeatures] = await Promise.all([
    Promise.resolve(extractColorHistogram(imageElement, bbox)),
    Promise.resolve(extractShapeFeatures(bbox)),
    extractDeepFeatures(imageElement, bbox)
  ]);

  return {
    color,
    shape,
    deepFeatures,
    timestamp: Date.now()
  };
}

/**
 * Compare two color histograms using cosine similarity
 */
function compareColorHistograms(a: ColorHistogram, b: ColorHistogram): number {
  if (a.r.length === 0 || b.r.length === 0) return 0;

  const dotProduct = (arr1: number[], arr2: number[]) =>
    arr1.reduce((sum, v, i) => sum + v * (arr2[i] || 0), 0);

  const magnitude = (arr: number[]) =>
    Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0));

  const rSim = dotProduct(a.r, b.r) / (magnitude(a.r) * magnitude(b.r) || 1);
  const gSim = dotProduct(a.g, b.g) / (magnitude(a.g) * magnitude(b.g) || 1);
  const bSim = dotProduct(a.b, b.b) / (magnitude(a.b) * magnitude(b.b) || 1);

  return (rSim + gSim + bSim) / 3;
}

/**
 * Compare shape features using Euclidean distance
 */
function compareShapeFeatures(a: ShapeFeatures, b: ShapeFeatures): number {
  const diff = (key: keyof ShapeFeatures) => Math.pow(a[key] - b[key], 2);
  const distance = Math.sqrt(diff('aspectRatio') + diff('compactness') + diff('solidity') + diff('eccentricity'));
  return Math.max(0, 1 - distance / 2);
}

/**
 * Compare deep features using cosine similarity
 */
function compareDeepFeatures(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;

  const dotProduct = a.reduce((sum, v, i) => sum + v * (b[i] || 0), 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));

  return dotProduct / (magA * magB || 1);
}

/**
 * Compare two embeddings and return similarity score (0-1)
 */
export function compareEmbeddings(a: VisualEmbedding, b: VisualEmbedding): number {
  const colorWeight = 0.25;
  const shapeWeight = 0.15;
  const deepWeight = 0.6;

  const colorSim = compareColorHistograms(a.color, b.color);
  const shapeSim = compareShapeFeatures(a.shape, b.shape);
  const deepSim = compareDeepFeatures(a.deepFeatures, b.deepFeatures);

  return (colorSim * colorWeight) + (shapeSim * shapeWeight) + (deepSim * deepWeight);
}

/**
 * Register a product in the fingerprint registry
 */
export function registerProduct(
  productId: string,
  embedding: VisualEmbedding,
  name: string,
  barcode?: string
): void {
  const fingerprint: ProductFingerprint = {
    productId,
    barcode,
    name,
    embedding,
    partialViews: [embedding]
  };

  productRegistry.set(productId, fingerprint);

  if (barcode) {
    barcodeToProductId.set(barcode, productId);
  }
}

/**
 * Add a partial view to an existing product
 */
export function addPartialView(productId: string, embedding: VisualEmbedding): void {
  const fingerprint = productRegistry.get(productId);
  if (fingerprint) {
    // Keep last 10 partial views
    fingerprint.partialViews.push(embedding);
    if (fingerprint.partialViews.length > 10) {
      fingerprint.partialViews.shift();
    }
  }
}

/**
 * Find matching product by visual embedding
 * Returns productId and confidence score
 */
export function findProductByEmbedding(
  embedding: VisualEmbedding,
  minConfidence = 0.5
): { productId: string; confidence: number } | null {
  let bestMatch: { productId: string; confidence: number } | null = null;

  for (const [productId, fingerprint] of productRegistry) {
    // Compare with main embedding
    let maxSim = compareEmbeddings(embedding, fingerprint.embedding);

    // Also compare with partial views
    for (const partial of fingerprint.partialViews) {
      const sim = compareEmbeddings(embedding, partial);
      maxSim = Math.max(maxSim, sim);
    }

    if (maxSim >= minConfidence && (!bestMatch || maxSim > bestMatch.confidence)) {
      bestMatch = { productId, confidence: maxSim };
    }
  }

  return bestMatch;
}

/**
 * Find product by barcode
 */
export function findProductByBarcode(barcode: string): string | null {
  return barcodeToProductId.get(barcode) || null;
}

/**
 * Get all registered products
 */
export function getRegisteredProducts(): ProductFingerprint[] {
  return Array.from(productRegistry.values());
}

/**
 * Check if a product is registered
 */
export function isProductRegistered(productId: string): boolean {
  return productRegistry.has(productId);
}

/**
 * Clear all fingerprints (for testing/reset)
 */
export function clearRegistry(): void {
  productRegistry.clear();
  barcodeToProductId.clear();
}

/**
 * Remove a specific product
 */
export function removeProduct(productId: string): void {
  const fingerprint = productRegistry.get(productId);
  if (fingerprint?.barcode) {
    barcodeToProductId.delete(fingerprint.barcode);
  }
  productRegistry.delete(productId);
}
