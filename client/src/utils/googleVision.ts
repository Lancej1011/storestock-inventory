/**
 * Google Cloud Vision API - Product Recognition Service
 *
 * Provides product search capabilities using Google's Product Search API.
 * This is the most accurate option for retail product recognition as it's
 * trained on millions of real-world product images.
 *
 * Setup:
 * 1. Create a Google Cloud project at https://console.cloud.google.com
 * 2. Enable the Cloud Vision API
 * 3. Create a Product Set in Google Cloud Console or via API
 * 4. Add your products with reference images
 * 5. Get your API key and set VITE_GOOGLE_CLOUD_API_KEY in .env
 */

const GOOGLE_VISION_API_KEY = import.meta.env.VITE_GOOGLE_CLOUD_API_KEY || '';
const VISION_API_BASE = 'https://vision.googleapis.com/v1';

// Types for Google Cloud Vision Product Search
export interface ProductSearchResult {
  productId: string;
  productName: string;
  productCategory: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  imageUri: string;
}

export interface VisionAPIProduct {
  name: string; // projects/.../products/...
  displayName: string;
  productCategory: string;
  productLabels: Array<{ key: string; value: string }>;
}

export interface ProductSearchResponse {
  results: ProductSearchResult[];
  indexTime: string;
}

/**
 * Check if Google Cloud Vision is configured
 */
export function isVisionAPIAvailable(): boolean {
  return Boolean(GOOGLE_VISION_API_KEY);
}

/**
 * Convert image to base64 for API upload
 */
async function imageToBase64(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context');

  // Resize to reasonable size for API (max 2048px)
  const maxSize = 1024;
  let width: number, height: number;

  if ('videoWidth' in imageElement) {
    width = imageElement.videoWidth;
    height = imageElement.videoHeight;
  } else if ('naturalWidth' in imageElement) {
    width = imageElement.naturalWidth;
    height = imageElement.naturalHeight;
  } else {
    width = imageElement.width;
    height = imageElement.height;
  }

  const scale = Math.min(1, maxSize / Math.max(width, height));
  canvas.width = width * scale;
  canvas.height = height * scale;

  ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return dataUrl.split(',')[1]; // Remove data:image/jpeg;base64, prefix
}

/**
 * Search for products in an image using Product Search
 */
export async function searchProductsInImage(
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  options: {
    productCategory?: string;
    maxResults?: number;
  } = {}
): Promise<ProductSearchResult[]> {
  if (!isVisionAPIAvailable()) {
    console.warn('Google Cloud Vision API key not configured');
    return [];
  }

  const { productCategory = 'general-grocery', maxResults = 10 } = options;

  try {
    const base64Image = await imageToBase64(imageElement);

    const requestBody = {
      requests: [{
        image: { content: base64Image },
        features: [
          { type: 'PRODUCT_SEARCH', maxResults }
        ],
        imageContext: {
          productSearchParams: {
            productCategory,
          }
        }
      }]
    };

    const response = await fetch(
      `${VISION_API_BASE}/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Vision API request failed');
    }

    const data = await response.json();
    return parseProductSearchResponse(data);
  } catch (error) {
    console.error('Product search error:', error);
    return [];
  }
}

/**
 * Search products with custom product set (for your own product database)
 */
export async function searchCustomProductSet(
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  productSetId: string,
  projectId: string,
  options: {
    maxResults?: number;
    filter?: string;
  } = {}
): Promise<ProductSearchResult[]> {
  if (!isVisionAPIAvailable()) {
    console.warn('Google Cloud Vision API key not configured');
    return [];
  }

  const { maxResults = 10, filter } = options;

  try {
    const base64Image = await imageToBase64(imageElement);

    const requestBody = {
      requests: [{
        image: { content: base64Image },
        features: [
          { type: 'PRODUCT_SEARCH', maxResults }
        ],
        imageContext: {
          productSearchParams: {
            productSet: `projects/${projectId}/locations/us-west1/productSets/${productSetId}`,
            productCategory: 'general-grocery',
            filter
          }
        }
      }]
    };

    const response = await fetch(
      `${VISION_API_BASE}/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      throw new Error('Custom product set search failed');
    }

    const data = await response.json();
    return parseProductSearchResponse(data);
  } catch (error) {
    console.error('Custom product search error:', error);
    return [];
  }
}

/**
 * Detect objects and get their labels (freeform recognition)
 */
export async function detectImageLabels(
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  maxResults: number = 10
): Promise<Array<{ description: string; confidence: number }>> {
  if (!isVisionAPIAvailable()) {
    console.warn('Google Cloud Vision API key not configured');
    return [];
  }

  try {
    const base64Image = await imageToBase64(imageElement);

    const requestBody = {
      requests: [{
        image: { content: base64Image },
        features: [
          { type: 'LABEL_DETECTION', maxResults },
          { type: 'OBJECT_DETECTION', maxResults }
        ]
      }]
    };

    const response = await fetch(
      `${VISION_API_BASE}/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      throw new Error('Label detection failed');
    }

    const data = await response.json();
    const labels: Array<{ description: string; confidence: number }> = [];

    // Extract label annotations
    const labelAnnotations = data.responses?.[0]?.labelAnnotations || [];
    for (const label of labelAnnotations) {
      labels.push({
        description: label.description,
        confidence: label.score
      });
    }

    // Also extract object annotations
    const objectAnnotations = data.responses?.[0]?.localizedObjectAnnotations || [];
    for (const obj of objectAnnotations) {
      labels.push({
        description: obj.name,
        confidence: obj.score
      });
    }

    return labels.sort((a, b) => b.confidence - a.confidence).slice(0, maxResults);
  } catch (error) {
    console.error('Label detection error:', error);
    return [];
  }
}

/**
 * Parse Google Vision API response into our format
 */
function parseProductSearchResponse(data: any): ProductSearchResult[] {
  const results: ProductSearchResult[] = [];

  const productAnnotations = data.responses?.[0]?.productSearchResults?.results || [];

  for (const result of productAnnotations) {
    const product = result.product;

    results.push({
      productId: product.name?.split('/').pop() || '',
      productName: product.displayName || '',
      productCategory: product.productCategory || '',
      confidence: result.score || 0,
      imageUri: product.imageUri || '',
      boundingBox: result.boundingBox ? {
        x: result.boundingBox.x || 0,
        y: result.boundingBox.y || 0,
        width: result.boundingBox.width || 0,
        height: result.boundingBox.height || 0
      } : undefined
    });
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Get product information by product ID
 */
export async function getProduct(_productId: string): Promise<VisionAPIProduct | null> {
  if (!isVisionAPIAvailable()) {
    return null;
  }

  // This would require the product name format from Google Cloud
  // Format: projects/{project}/locations/{location}/products/{product}
  console.warn('getProduct requires full product resource name');
  return null;
}

/**
 * OCR - Extract text from image
 */
export async function extractText(
  imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): Promise<Array<{ text: string; confidence: number; boundingBox?: any }>> {
  if (!isVisionAPIAvailable()) {
    console.warn('Google Cloud Vision API key not configured');
    return [];
  }

  try {
    const base64Image = await imageToBase64(imageElement);

    const requestBody = {
      requests: [{
        image: { content: base64Image },
        features: [
          { type: 'TEXT_DETECTION', maxResults: 20 },
          { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }
        ]
      }]
    };

    const response = await fetch(
      `${VISION_API_BASE}/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      throw new Error('Text extraction failed');
    }

    const data = await response.json();
    const texts: Array<{ text: string; confidence: number; boundingBox?: any }> = [];

    const textAnnotations = data.responses?.[0]?.textAnnotations || [];
    for (const annotation of textAnnotations) {
      texts.push({
        text: annotation.description,
        confidence: annotation.score || 1,
        boundingBox: annotation.boundingPoly
      });
    }

    return texts;
  } catch (error) {
    console.error('Text extraction error:', error);
    return [];
  }
}

// ==================== SERVER-SIDE HELPERS ====================

/**
 * If you want to use Google Vision API server-side (more secure),
 * these are the endpoints your server should expose
 */

export const VISION_API_ENDPOINTS = {
  SEARCH_PRODUCTS: '/api/vision/search-products',
  DETECT_LABELS: '/api/vision/detect-labels',
  EXTRACT_TEXT: '/api/vision/extract-text',
  SYNC_PRODUCTS: '/api/vision/sync-products'
};

/**
 * Search products via our server (proxy to Google Vision)
 */
export async function searchProductsViaServer(
  imageBase64: string,
  options: { productCategory?: string; maxResults?: number } = {}
): Promise<ProductSearchResult[]> {
  try {
    const response = await fetch(VISION_API_ENDPOINTS.SEARCH_PRODUCTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64, ...options })
    });

    if (!response.ok) throw new Error('Server vision request failed');
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Server vision search error:', error);
    return [];
  }
}

