/**
 * Google Cloud Vision API Routes
 *
 * Server-side proxy for Google Vision API to keep API key secure.
 * Uses service account JSON for authentication.
 * Supports product search, label detection, and OCR.
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { GoogleAuth } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

const VISION_API_BASE = 'https://vision.googleapis.com/v1';

// Google Auth setup
let googleAuth: GoogleAuth | null = null;

function getGoogleAuth(): GoogleAuth | null {
  if (!googleAuth) {
    // Check for environment variable first, then look for JSON file in server folder
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      path.join(__dirname, '../../inventory-490718-7c843fa5a5d0.json');

    if (fs.existsSync(credentialsPath)) {
      googleAuth = new GoogleAuth({
        keyFile: credentialsPath,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
      console.log('Google Auth: Using service account from', credentialsPath);
    } else {
      console.warn('Google Auth: Service account JSON not found at', credentialsPath);
      googleAuth = null;
    }
  }
  return googleAuth;
}

async function getAccessToken(): Promise<string | null> {
  const auth = getGoogleAuth();
  if (!auth) return null;

  try {
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    return tokenResponse.token || null;
  } catch (error) {
    console.error('Failed to get access token:', error);
    return null;
  }
}

interface ProductSearchResult {
  productId: string;
  productName: string;
  productCategory: string;
  confidence: number;
  imageUri: string;
}

/**
 * Search products using Google Cloud Vision Product Search
 */
router.post('/search-products', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { image, productCategory = 'general-grocery', maxResults = 10 } = req.body;

    if (!image) {
      res.status(400).json({ error: 'Image data required' });
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      res.status(500).json({ error: 'Google Cloud authentication failed' });
      return;
    }

    const requestBody = {
      requests: [{
        image: { content: image },
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
      `${VISION_API_BASE}/images:annotate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(error.error?.message || 'Vision API request failed');
    }

    const data = await response.json() as any;
    const results: ProductSearchResult[] = [];

    const productAnnotations = data.responses?.[0]?.productSearchResults?.results || [];

    for (const result of productAnnotations) {
      const product = result.product;
      results.push({
        productId: product.name?.split('/').pop() || '',
        productName: product.displayName || '',
        productCategory: product.productCategory || '',
        confidence: result.score || 0,
        imageUri: product.imageUri || ''
      });
    }

    res.json({ results, indexTime: data.responses?.[0]?.productSearchResults?.productGroupMinScore });
  } catch (error) {
    next(error);
  }
});

/**
 * Detect labels in an image
 */
router.post('/detect-labels', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { image, maxResults = 20 } = req.body;

    if (!image) {
      res.status(400).json({ error: 'Image data required' });
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      res.status(500).json({ error: 'Google Cloud authentication failed' });
      return;
    }

    const requestBody = {
      requests: [{
        image: { content: image },
        features: [
          { type: 'LABEL_DETECTION', maxResults },
          { type: 'OBJECT_DETECTION', maxResults: 10 }
        ]
      }]
    };

    const response = await fetch(
      `${VISION_API_BASE}/images:annotate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      throw new Error('Label detection failed');
    }

    const data = await response.json() as any;
    const labels: Array<{ description: string; confidence: number }> = [];

    const labelAnnotations = data.responses?.[0]?.labelAnnotations || [];
    for (const label of labelAnnotations) {
      labels.push({ description: label.description, confidence: label.score });
    }

    const objectAnnotations = data.responses?.[0]?.localizedObjectAnnotations || [];
    for (const obj of objectAnnotations) {
      labels.push({ description: obj.name, confidence: obj.score });
    }

    res.json({ labels: labels.sort((a, b) => b.confidence - a.confidence).slice(0, maxResults) });
  } catch (error) {
    next(error);
  }
});

/**
 * Extract text from an image (OCR)
 */
router.post('/extract-text', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { image, maxResults = 20 } = req.body;

    if (!image) {
      res.status(400).json({ error: 'Image data required' });
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      res.status(500).json({ error: 'Google Cloud authentication failed' });
      return;
    }

    const requestBody = {
      requests: [{
        image: { content: image },
        features: [
          { type: 'TEXT_DETECTION', maxResults },
          { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }
        ]
      }]
    };

    const response = await fetch(
      `${VISION_API_BASE}/images:annotate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      throw new Error('Text extraction failed');
    }

    const data = await response.json() as any;
    const texts: Array<{ text: string; confidence: number }> = [];

    const textAnnotations = data.responses?.[0]?.textAnnotations || [];
    for (const annotation of textAnnotations) {
      texts.push({
        text: annotation.description,
        confidence: annotation.score || 1
      });
    }

    res.json({ texts });
  } catch (error) {
    next(error);
  }
});

/**
 * Sync products to Google Vision Product Search
 * (For adding your product catalog to Google's Product Search)
 */
router.post('/sync-products', authenticate, async (req: Request, res: Response, next) => {
  try {
    const { products, productSetId } = req.body;

    if (!products || !Array.isArray(products)) {
      res.status(400).json({ error: 'Products array required' });
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      res.status(500).json({ error: 'Google Cloud authentication failed' });
      return;
    }

    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    if (!projectId) {
      res.status(500).json({ error: 'Google Cloud Project ID not configured' });
      return;
    }

    const results = [];
    for (const product of products) {
      try {
        // Create product
        const createResponse = await fetch(
          `${VISION_API_BASE}/projects/${projectId}/locations/us-west1/products?productId=${product.id}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
              name: product.name,
              displayName: product.name,
              productCategory: 'general-grocery',
              productLabels: [
                { key: 'barcode', value: product.barcode || '' },
                { key: 'sku', value: product.sku || '' }
              ]
            })
          }
        );

        if (createResponse.ok) {
          results.push({ productId: product.id, status: 'created' });
        } else {
          results.push({ productId: product.id, status: 'error', error: 'Failed to create' });
        }
      } catch (error) {
        results.push({ productId: product.id, status: 'error', error: String(error) });
      }
    }

    res.json({ results });
  } catch (error) {
    next(error);
  }
});

export default router;
