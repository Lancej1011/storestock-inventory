/**
 * IndexedDB Store for Product Embeddings
 *
 * Persists visual embeddings locally so products can be recognized
 * across sessions without re-scanning.
 */

import { VisualEmbedding } from './productFingerprint';

const DB_NAME = 'inventory_embeddings';
const DB_VERSION = 1;
const STORE_NAME = 'product_embeddings';
const AISLE_STORE_NAME = 'aisle_layouts';

export interface StoredEmbedding {
  productId: string;
  barcode: string;
  name: string;
  embedding: VisualEmbedding;
  imageHash?: string;
  lastUpdated: number;
}

export interface AisleLayout {
  aisleId: string;
  storeId: string;
  aisleNumber: string;
  description: string;
  categories: string[];
  dominantProducts: string[];
  lastSeen: number;
  confidence: number;
}

let db: IDBDatabase | null = null;

/**
 * Open the IndexedDB database
 */
async function openDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Product embeddings store
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'productId' });
        store.createIndex('barcode', 'barcode', { unique: true });
        store.createIndex('lastUpdated', 'lastUpdated', { unique: false });
      }

      // Aisle layouts store
      if (!database.objectStoreNames.contains(AISLE_STORE_NAME)) {
        const aisleStore = database.createObjectStore(AISLE_STORE_NAME, { keyPath: 'aisleId' });
        aisleStore.createIndex('storeId', 'storeId', { unique: false });
        aisleStore.createIndex('aisleNumber', 'aisleNumber', { unique: false });
      }
    };
  });
}

/**
 * Save a product embedding to IndexedDB
 */
export async function saveEmbedding(embedding: StoredEmbedding): Promise<void> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({
      ...embedding,
      lastUpdated: Date.now()
    });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Get a product embedding by productId
 */
export async function getEmbedding(productId: string): Promise<StoredEmbedding | null> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(productId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * Get a product embedding by barcode
 */
export async function getEmbeddingByBarcode(barcode: string): Promise<StoredEmbedding | null> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('barcode');
    const request = index.get(barcode);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * Get all stored embeddings
 */
export async function getAllEmbeddings(): Promise<StoredEmbedding[]> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

/**
 * Delete an embedding
 */
export async function deleteEmbedding(productId: string): Promise<void> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(productId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Bulk save embeddings (for initial sync from server)
 */
export async function bulkSaveEmbeddings(embeddings: StoredEmbedding[]): Promise<void> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    for (const embedding of embeddings) {
      store.put({ ...embedding, lastUpdated: Date.now() });
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// ==================== AISLE LAYOUT METHODS ====================

/**
 * Save an aisle layout
 */
export async function saveAisleLayout(layout: AisleLayout): Promise<void> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([AISLE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(AISLE_STORE_NAME);
    const request = store.put({
      ...layout,
      lastSeen: Date.now()
    });

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Get aisle layouts for a store
 */
export async function getAisleLayoutsForStore(storeId: string): Promise<AisleLayout[]> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([AISLE_STORE_NAME], 'readonly');
    const store = transaction.objectStore(AISLE_STORE_NAME);
    const index = store.index('storeId');
    const request = index.getAll(storeId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

/**
 * Get a specific aisle layout
 */
export async function getAisleLayout(aisleId: string): Promise<AisleLayout | null> {
  const database = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([AISLE_STORE_NAME], 'readonly');
    const store = transaction.objectStore(AISLE_STORE_NAME);
    const request = store.get(aisleId);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * Update aisle layout with newly observed products
 */
export async function updateAisleProducts(
  aisleId: string,
  observedProducts: string[],
  confidenceBoost: number = 0.1
): Promise<void> {
  const layout = await getAisleLayout(aisleId);
  if (!layout) return;

  const updatedProducts = new Set([...layout.dominantProducts, ...observedProducts]);

  // Update product frequencies (keep top 20)
  const productCounts = new Map<string, number>();
  for (const p of updatedProducts) {
    productCounts.set(p, (productCounts.get(p) || 1) + confidenceBoost);
  }

  const sortedProducts = Array.from(productCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([p]) => p);

  await saveAisleLayout({
    ...layout,
    dominantProducts: sortedProducts,
    lastSeen: Date.now(),
    confidence: Math.min(1, layout.confidence + confidenceBoost)
  });
}

/**
 * Learn aisle layout from observations
 */
export async function learnAisleLayout(
  storeId: string,
  aisleNumber: string,
  observedProducts: string[],
  description?: string
): Promise<AisleLayout> {
  const existingLayouts = await getAisleLayoutsForStore(storeId);
  const existing = existingLayouts.find(l => l.aisleNumber === aisleNumber);

  const categories = inferCategoriesFromProducts(observedProducts);

  const layout: AisleLayout = {
    aisleId: existing?.aisleId || `aisle-${storeId}-${aisleNumber}-${Date.now()}`,
    storeId,
    aisleNumber,
    description: description || inferAisleDescription(categories),
    categories,
    dominantProducts: observedProducts.slice(0, 20),
    lastSeen: Date.now(),
    confidence: existing ? Math.min(1, existing.confidence + 0.1) : 0.5
  };

  await saveAisleLayout(layout);
  return layout;
}

/**
 * Infer categories from product names (simple heuristic)
 */
function inferCategoriesFromProducts(products: string[]): string[] {
  const categoryKeywords: Record<string, string[]> = {
    'Pasta & Grains': ['pasta', 'spaghetti', 'penne', 'rice', 'noodle', 'lasagna', 'macaroni'],
    'Sauces & Condiments': ['sauce', 'ketchup', 'mustard', 'mayo', 'marinara', 'tomato', 'salsa'],
    'Dairy': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'egg'],
    'Bakery': ['bread', 'bagel', 'muffin', 'croissant', 'roll', 'cake'],
    'Beverages': ['water', 'soda', 'juice', 'coffee', 'tea', 'drink'],
    'Snacks': ['chips', 'crackers', 'cookie', 'candy', 'popcorn', 'nuts'],
    'Canned Goods': ['can', 'soup', 'beans', 'tuna', 'corn', 'peas'],
    'Frozen': ['frozen', 'ice cream', 'pizza', 'tv dinner'],
    'Breakfast': ['cereal', 'oatmeal', 'pancake', 'waffle', 'granola'],
    'Personal Care': ['shampoo', 'soap', 'toothpaste', 'deodorant', 'lotion'],
    'Household': ['detergent', 'cleaner', 'paper towel', 'toilet paper', 'trash bag'],
  };

  const foundCategories = new Set<string>();

  for (const product of products) {
    const lower = product.toLowerCase();
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        foundCategories.add(category);
      }
    }
  }

  return Array.from(foundCategories);
}

/**
 * Infer aisle description from categories
 */
function inferAisleDescription(categories: string[]): string {
  if (categories.length === 0) return 'Mixed goods';
  if (categories.length === 1) return categories[0];
  return categories.slice(0, 2).join(' & ');
}

/**
 * Clear all stored data (for debugging/reset)
 */
export async function clearAllData(): Promise<void> {
  const database = await openDB();

  const clearStore = (storeName: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  };

  await Promise.all([
    clearStore(STORE_NAME),
    clearStore(AISLE_STORE_NAME)
  ]);
}

/**
 * Get database stats
 */
export async function getStoreStats(): Promise<{
  embeddingCount: number;
  aisleCount: number;
}> {
  const database = await openDB();

  const countStore = (storeName: string): Promise<number> => {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  };

  const [embeddingCount, aisleCount] = await Promise.all([
    countStore(STORE_NAME),
    countStore(AISLE_STORE_NAME)
  ]);

  return { embeddingCount, aisleCount };
}
