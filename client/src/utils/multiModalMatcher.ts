/**
 * Multi-Modal Product Matcher
 *
 * Combines multiple detection modalities:
 * 1. Barcode scanning (UPC, EAN, QR, etc.)
 * 2. OCR text recognition (brand names, product names)
 * 3. Visual embedding matching (color, shape, deep features)
 *
 * Uses confidence fusion to identify products and
 * supports partial view re-identification.
 */

import {
  VisualEmbedding,
  findProductByBarcode,
  findProductByEmbedding,
  registerProduct,
  addPartialView,
  createFingerprint,
  isProductRegistered
} from './productFingerprint';
import { OCRResult } from './ocr';

export interface ProductMatch {
  productId: string;
  barcode?: string;
  name: string;
  confidence: number;
  matchType: 'barcode' | 'ocr' | 'visual' | 'fused';
  source?: string; // Additional context
  embedding?: VisualEmbedding;
}

export interface MatchRequest {
  barcode?: string;
  ocrResult?: OCRResult;
  embedding?: VisualEmbedding;
  imageElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
  bbox?: [number, number, number, number];
  storeId?: string;
}

// Weights for different modalities
const BARCODE_WEIGHT = 0.95;  // Barcode is most reliable
const OCR_WEIGHT = 0.40;      // OCR provides text clues
const VISUAL_WEIGHT = 0.35;   // Visual matching fallback

// Minimum confidence thresholds
const MIN_BARCODE_CONF = 0.9;
const MIN_VISUAL_CONF = 0.55;
const MIN_FUSED_CONF = 0.6;

/**
 * Match a product using barcode
 */
async function matchByBarcode(
  barcode: string,
  _storeId?: string
): Promise<ProductMatch | null> {
  const productId = findProductByBarcode(barcode);
  if (!productId) return null;

  return {
    productId,
    barcode,
    name: '', // Will be filled by caller
    confidence: MIN_BARCODE_CONF,
    matchType: 'barcode'
  };
}

/**
 * Match a product using OCR text
 */
async function matchByOCR(
  ocrResult: OCRResult,
  _storeId?: string
): Promise<ProductMatch[]> {
  const matches: ProductMatch[] = [];

  // Extract brand and product name from OCR
  const brand = ocrResult.possibleBrand;
  const rawText = ocrResult.rawText;
  const confidence = ocrResult.confidence / 100;

  // We need to search the product database
  // For now, we'll search by text similarity
  // The actual database search would be done via API
  if (rawText && rawText.trim().length > 2) {
    matches.push({
      productId: '', // Placeholder - actual match done by API
      name: rawText.trim().substring(0, 100),
      confidence: confidence * OCR_WEIGHT,
      matchType: 'ocr',
      source: `OCR: "${rawText.substring(0, 50)}..."`
    });
  }

  if (brand) {
    matches.push({
      productId: '',
      name: brand,
      confidence: confidence * OCR_WEIGHT * 1.2, // Brand is more reliable
      matchType: 'ocr',
      source: `Brand: ${brand}`
    });
  }

  return matches;
}

/**
 * Match a product using visual embedding
 */
async function matchByVisual(
  embedding: VisualEmbedding,
  minConfidence = MIN_VISUAL_CONF
): Promise<ProductMatch | null> {
  const match = findProductByEmbedding(embedding, minConfidence);
  if (!match) return null;

  return {
    productId: match.productId,
    name: match.productId, // Name will be enriched by caller
    confidence: match.confidence * VISUAL_WEIGHT,
    matchType: 'visual',
    embedding
  };
}

/**
 * Perform multi-modal matching
 * Returns ranked matches from all modalities
 */
export async function matchProduct(
  request: MatchRequest
): Promise<{
  matches: ProductMatch[];
  primaryMatch: ProductMatch | null;
}> {
  const matches: ProductMatch[] = [];
  const seen = new Set<string>();

  // 1. Barcode matching (highest priority)
  if (request.barcode) {
    const barcodeMatch = await matchByBarcode(request.barcode, request.storeId);
    if (barcodeMatch) {
      barcodeMatch.name = request.barcode; // Will be enriched by caller
      matches.push(barcodeMatch);
      seen.add(barcodeMatch.productId);
    }
  }

  // 2. OCR matching
  if (request.ocrResult) {
    const ocrMatches = await matchByOCR(request.ocrResult, request.storeId);
    for (const match of ocrMatches) {
      matches.push(match);
    }
  }

  // 3. Visual embedding matching
  if (request.embedding) {
    const visualMatch = await matchByVisual(request.embedding);
    if (visualMatch && !seen.has(visualMatch.productId)) {
      matches.push(visualMatch);
      seen.add(visualMatch.productId);
    }
  }

  // 4. If no barcode match but we have image, create fingerprint
  if (!request.barcode && request.imageElement && request.bbox) {
    const embedding = await createFingerprint(
      request.imageElement,
      request.bbox
    );
    const visualMatch = await matchByVisual(embedding, MIN_VISUAL_CONF * 0.8);
    if (visualMatch && !seen.has(visualMatch.productId)) {
      matches.push(visualMatch);
    }
  }

  // Sort by confidence
  matches.sort((a, b) => b.confidence - a.confidence);

  // Find primary match (highest confidence)
  const primaryMatch = matches.length > 0 ? matches[0] : null;

  return { matches, primaryMatch };
}

/**
 * Register a newly identified product for future matching
 */
export async function registerIdentifiedProduct(
  productId: string,
  barcode: string,
  name: string,
  imageElement?: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  bbox?: [number, number, number, number]
): Promise<void> {
  // If we have visual data, create and register fingerprint
  if (imageElement && bbox) {
    const embedding = await createFingerprint(imageElement, bbox, productId, barcode);
    registerProduct(productId, embedding, name, barcode);
  } else if (isProductRegistered(productId)) {
    // Already registered
    return;
  } else {
    // Register without embedding (text-only product)
    registerProduct(productId, {
      color: { r: [], g: [], b: [], dominant: [] },
      shape: { aspectRatio: 1, compactness: 0.5, solidity: 0.5, eccentricity: 0.5 },
      deepFeatures: [],
      timestamp: Date.now()
    }, name, barcode);
  }
}

/**
 * Add a partial view to improve future recognition
 */
export async function addProductPartialView(
  productId: string,
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  bbox: [number, number, number, number]
): Promise<void> {
  const embedding = await createFingerprint(imageElement, bbox, productId);
  addPartialView(productId, embedding);
}

/**
 * Fuse multiple weak matches into a stronger one
 */
export function fuseMatches(matches: ProductMatch[]): ProductMatch | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  // Group by productId
  const byProduct = new Map<string, ProductMatch[]>();
  for (const match of matches) {
    const existing = byProduct.get(match.productId) || [];
    existing.push(match);
    byProduct.set(match.productId, existing);
  }

  let bestFused: ProductMatch | null = null;
  let bestScore = 0;

  for (const [productId, group] of byProduct) {
    // Calculate fused confidence
    let totalWeight = 0;
    let weightedSum = 0;

    for (const match of group) {
      const weight = match.matchType === 'barcode' ? BARCODE_WEIGHT
        : match.matchType === 'ocr' ? OCR_WEIGHT
        : VISUAL_WEIGHT;
      weightedSum += match.confidence * weight;
      totalWeight += weight;
    }

    const fusedConfidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Pick best source match type
    const bestMatch = group.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    if (fusedConfidence > bestScore) {
      bestScore = fusedConfidence;
      bestFused = {
        productId,
        name: bestMatch.name,
        barcode: bestMatch.barcode,
        confidence: fusedConfidence,
        matchType: 'fused',
        source: `Fused from ${group.length} signals`,
        embedding: bestMatch.embedding
      };
    }
  }

  return bestFused && bestScore >= MIN_FUSED_CONF ? bestFused : null;
}
