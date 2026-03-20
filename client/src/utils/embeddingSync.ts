/**
 * Embedding Sync Service
 *
 * Syncs product embeddings between IndexedDB (local) and the server.
 * Loads known embeddings on app start, saves new ones when products are scanned.
 */

import axios from 'axios';
import {
  saveEmbedding,
  getAllEmbeddings,
  bulkSaveEmbeddings,
  saveAisleLayout,
  getAisleLayoutsForStore,
  StoredEmbedding,
  AisleLayout
} from './embeddingStore';
import { VisualEmbedding } from './productFingerprint';

const API_BASE = '/api';

// ==================== EMBEDDING SYNC ====================

/**
 * Load embeddings from server and cache locally
 */
export async function syncEmbeddingsFromServer(storeId?: string): Promise<number> {
  try {
    const response = await axios.get(`${API_BASE}/embeddings/store/${storeId || 'default'}`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` }
    });

    const { embeddings } = response.data;

    if (embeddings && embeddings.length > 0) {
      // Save to IndexedDB
      await bulkSaveEmbeddings(embeddings.map((e: any) => ({
        productId: e.productId,
        barcode: e.barcode,
        name: e.name,
        embedding: e.embedding,
        lastUpdated: new Date(e.lastUpdated).getTime()
      })));

      console.log(`Synced ${embeddings.length} embeddings from server`);
      return embeddings.length;
    }

    return 0;
  } catch (error) {
    console.error('Failed to sync embeddings from server:', error);
    return 0;
  }
}

/**
 * Save a new embedding to server and local cache
 */
export async function saveEmbeddingRemotely(
  productId: string,
  barcode: string,
  name: string,
  embedding: VisualEmbedding,
  storeId?: string
): Promise<void> {
  // Save locally first
  await saveEmbedding({
    productId,
    barcode,
    name,
    embedding,
    lastUpdated: Date.now()
  });

  // Then sync to server (fire and forget, don't block)
  try {
    await axios.post(`${API_BASE}/embeddings`, {
      productId,
      barcode,
      name,
      embedding: {
        color: embedding.color,
        shape: embedding.shape,
        deepFeatures: embedding.deepFeatures,
        timestamp: embedding.timestamp
      },
      storeId
    }, {
      headers: { Authorization: `Bearer ${getAuthToken()}` }
    });
  } catch (error) {
    console.error('Failed to save embedding to server:', error);
    // Local save succeeded, will retry later
  }
}

/**
 * Search for product by embedding on server
 */
export async function searchByEmbeddingRemotely(
  embedding: number[],
  storeId?: string
): Promise<Array<{ productId: string; name: string; confidence: number }>> {
  try {
    const response = await axios.post(`${API_BASE}/embeddings/search`, {
      embedding,
      storeId,
      threshold: 0.6,
      limit: 5
    }, {
      headers: { Authorization: `Bearer ${getAuthToken()}` }
    });

    return response.data.results || [];
  } catch (error) {
    console.error('Failed to search by embedding:', error);
    return [];
  }
}

// ==================== AISLE SYNC ====================

/**
 * Load aisle layouts from server
 */
export async function syncAislesFromServer(storeId: string): Promise<number> {
  try {
    const response = await axios.get(`${API_BASE}/aisles/store/${storeId}`, {
      headers: { Authorization: `Bearer ${getAuthToken()}` }
    });

    const aisles = response.data;

    if (aisles && aisles.length > 0) {
      for (const aisle of aisles) {
        await saveAisleLayout({
          aisleId: aisle.id,
          storeId: aisle.storeId,
          aisleNumber: aisle.aisleNumber,
          description: aisle.description,
          categories: aisle.categories,
          dominantProducts: aisle.dominantProducts,
          lastSeen: new Date(aisle.lastSeen).getTime(),
          confidence: aisle.confidence
        });
      }

      console.log(`Synced ${aisles.length} aisle layouts from server`);
      return aisles.length;
    }

    return 0;
  } catch (error) {
    console.error('Failed to sync aisles from server:', error);
    return 0;
  }
}

/**
 * Update server with observed aisle products
 */
export async function updateAisleOnServer(
  aisleId: string,
  observedProducts: string[]
): Promise<void> {
  try {
    await axios.post(`${API_BASE}/aisles/${aisleId}/observe`, {
      observedProducts
    }, {
      headers: { Authorization: `Bearer ${getAuthToken()}` }
    });
  } catch (error) {
    console.error('Failed to update aisle on server:', error);
  }
}

/**
 * Suggest best aisle for a product
 */
export async function suggestAisle(
  storeId: string,
  productName: string,
  categories: string[]
): Promise<{ aisleNumber?: string; confidence: number }> {
  try {
    const response = await axios.post(`${API_BASE}/aisles/suggest`, {
      storeId,
      productName,
      categories
    }, {
      headers: { Authorization: `Bearer ${getAuthToken()}` }
    });

    if (response.data.suggestedAisle) {
      return {
        aisleNumber: response.data.suggestedAisle.aisleNumber,
        confidence: response.data.confidence
      };
    }

    return { confidence: 0 };
  } catch (error) {
    console.error('Failed to suggest aisle:', error);
    return { confidence: 0 };
  }
}

// ==================== INITIALIZATION ====================

let initialized = false;

/**
 * Initialize embedding system on app start
 */
export async function initializeEmbeddingSystem(storeId?: string): Promise<void> {
  if (initialized) return;

  try {
    console.log('Initializing embedding system...');

    // Sync from server first
    const syncedEmbeddings = await syncEmbeddingsFromServer(storeId);
    const syncedAisles = storeId ? await syncAislesFromServer(storeId) : 0;

    console.log(`Embedding system initialized: ${syncedEmbeddings} embeddings, ${syncedAisles} aisles`);
    initialized = true;
  } catch (error) {
    console.error('Failed to initialize embedding system:', error);
  }
}

/**
 * Get all locally stored embeddings
 */
export async function getLocalEmbeddings(): Promise<StoredEmbedding[]> {
  return getAllEmbeddings();
}

// ==================== HELPERS ====================

function getAuthToken(): string {
  // Get token from localStorage/session storage
  const token = localStorage.getItem('auth_token');
  return token || '';
}
