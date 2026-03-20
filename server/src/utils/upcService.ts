import { logger } from './logger.js';

export interface ExternalProduct {
  barcode: string;
  name: string;
  description?: string;
  imageUrl?: string;
  categoryId?: string;
  retailPrice?: number;
  brand?: string;
  source?: string;
}

interface OpenFoodFactsResponse {
  status: number;
  product?: {
    product_name?: string;
    product_name_en?: string;
    generic_name?: string;
    categories?: string;
    image_url?: string;
    image_front_url?: string;
    image_small_url?: string;
    brands?: string;
  };
}

/**
 * Try Open Food Facts API
 */
async function tryOpenFoodFacts(barcode: string): Promise<ExternalProduct | null> {
  try {
    const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`, {
      headers: { 'User-Agent': 'InventoryApp/1.0' }
    });

    if (!response.ok) return null;

    const data = await response.json() as OpenFoodFactsResponse;
    if (data.status === 0 || !data.product) return null;

    const product = data.product;

    return {
      barcode,
      name: product.product_name || product.product_name_en || 'Unknown Product',
      description: product.generic_name || product.categories || '',
      imageUrl: product.image_url || product.image_front_url || product.image_small_url,
      brand: product.brands,
      source: 'Open Food Facts'
    };
  } catch (error) {
    logger.warn(`Open Food Facts lookup failed: ${error}`);
    return null;
  }
}

/**
 * Try UPC Database API (upcitemdb.com - free tier)
 */
interface UPCItemDBResponse {
  items?: Array<{
    title?: string;
    description?: string;
    images?: string[];
    brand?: string;
    lowest_recorded_price?: number;
    highest_recorded_price?: number;
  }>;
}

async function tryUPCItemDB(barcode: string): Promise<ExternalProduct | null> {
  try {
    const response = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'InventoryApp/1.0'
      }
    });

    if (!response.ok) return null;

    const data = await response.json() as UPCItemDBResponse;
    if (!data || !Array.isArray(data.items) || data.items.length === 0) return null;

    const item = data.items[0];
    if (!item) return null;

    return {
      barcode,
      name: item.title || 'Unknown Product',
      description: item.description || '',
      imageUrl: item.images?.[0] || '',
      brand: item.brand,
      retailPrice: item.lowest_recorded_price || item.highest_recorded_price,
      source: 'UPC Item DB'
    };
  } catch (error) {
    logger.warn(`UPC Item DB lookup failed: ${error}`);
    return null;
  }
}

/**
 * Try Open Beauty Facts (for cosmetics/beauty products)
 */
async function tryOpenBeautyFacts(barcode: string): Promise<ExternalProduct | null> {
  try {
    const response = await fetch(`https://world.openbeautyfacts.org/api/v0/product/${barcode}.json`, {
      headers: { 'User-Agent': 'InventoryApp/1.0' }
    });

    if (!response.ok) return null;

    const data = await response.json() as OpenFoodFactsResponse;
    if (data.status === 0 || !data.product) return null;

    const product = data.product;

    return {
      barcode,
      name: product.product_name || product.product_name_en || 'Unknown Product',
      description: product.generic_name || product.categories || '',
      imageUrl: product.image_url || product.image_front_url,
      brand: product.brands,
      source: 'Open Beauty Facts'
    };
  } catch (error) {
    logger.warn(`Open Beauty Facts lookup failed: ${error}`);
    return null;
  }
}

/**
 * Try Barcode Lookup API (barcodelookup.com)
 * Requires free API key from https://www.barcodelookup.com/api
 */
interface BarcodeLookupResponse {
  products?: Array<{
    product_name?: string;
    brand?: string;
    description?: string;
    images?: string[];
    stores?: Array<{ price?: number }>;
    category?: string;
  }>;
}

async function tryBarcodeLookup(barcode: string): Promise<ExternalProduct | null> {
  const apiKey = process.env.BARCODE_LOOKUP_API_KEY;
  if (!apiKey) {
    console.log('[UPC] Barcode Lookup API key missing - check .env file');
    logger.debug('Barcode Lookup API key not configured');
    return null;
  }
  console.log('[UPC] Barcode Lookup API key found, looking up:', barcode);

  try {
    const response = await fetch(`https://api.barcodelookup.com/v2/products?barcode=${barcode}&key=${apiKey}`, {
      headers: { 'User-Agent': 'InventoryApp/1.0' }
    });

    console.log(`[UPC] Barcode Lookup response status: ${response.status}`);

    if (!response.ok) return null;

    const data = await response.json() as BarcodeLookupResponse;
    console.log(`[UPC] Barcode Lookup data:`, JSON.stringify(data).slice(0, 500));

    if (!data.products || data.products.length === 0) return null;

    const product = data.products[0];
    if (!product) return null;

    console.log(`[UPC] Found product via Barcode Lookup:`, product.product_name);

    return {
      barcode,
      name: product.product_name || 'Unknown Product',
      description: product.description || '',
      imageUrl: product.images?.[0] || '',
      brand: product.brand,
      categoryId: product.category,
      retailPrice: product.stores?.[0]?.price,
      source: 'Barcode Lookup'
    };
  } catch (error) {
    console.log(`[UPC] Barcode Lookup exception:`, error);
    logger.warn(`Barcode Lookup API failed: ${error}`);
    return null;
  }
}

/**
 * Try ean-search.org (free EAN/UPC database)
 * http://www.ean-search.org/
 */
async function tryEANSearch(barcode: string): Promise<ExternalProduct | null> {
  try {
    // EAN Search uses a different approach - POST form data
    const response = await fetch(`https://www.ean-search.org/api?barcode=${barcode}&token=${process.env.EAN_SEARCH_TOKEN || ''}`, {
      headers: { 'User-Agent': 'InventoryApp/1.0' }
    });

    if (!response.ok) return null;

    const text = await response.text();
    if (!text || text.includes('Unknown product') || text.length < 5) return null;

    // Parse the response - EAN Search returns pipe-separated values
    // Format: name|description|brand|ean|image_url
    const parts = text.split('|');
    if (parts.length < 3) return null;

    return {
      barcode,
      name: parts[0] || 'Unknown Product',
      description: parts[1] || '',
      imageUrl: parts[4] || '',
      brand: parts[2] || '',
      source: 'EAN Search'
    };
  } catch (error) {
    logger.warn(`EAN Search API failed: ${error}`);
    return null;
  }
}

/**
 * Try Walmart Open API (for general merchandise)
 * Uses SerpAPI as a proxy for Walmart results
 */
interface SerpWalmartResponse {
  shopping_results?: Array<{
    title?: string;
    source?: string;
    price?: number;
    image?: string;
    rating?: number;
  }>;
}

async function tryWalmartSearch(barcode: string): Promise<ExternalProduct | null> {
  const apiKey = process.env.SERP_API_KEY;
  if (!apiKey) {
    logger.debug('SerpAPI key not configured for Walmart search');
    return null;
  }

  try {
    // Use SerpAPI to search Walmart for this product
    const response = await fetch(
      `https://serpapi.com/search.json?q=${barcode}+walmart&api_key=${apiKey}&engine=walmart`
    );

    if (!response.ok) return null;

    const data = await response.json() as SerpWalmartResponse;
    const results = data.shopping_results;
    if (!results || results.length === 0) return null;

    const product = results[0];
    if (!product) return null;

    // Extract brand from title (usually "Brand Product Name" format)
    const titleParts = product.title?.split(' ') || [];
    const brand = titleParts.length > 1 ? titleParts[0] : product.source;

    return {
      barcode,
      name: product.title || 'Unknown Product',
      description: `Walmart - Rating: ${product.rating || 'N/A'}`,
      imageUrl: product.image || '',
      brand: brand,
      retailPrice: product.price,
      source: 'Walmart (via SerpAPI)'
    };
  } catch (error) {
    logger.warn(`Walmart search failed: ${error}`);
    return null;
  }
}

/**
 * Fetches product metadata from multiple external APIs
 * Tries several sources in parallel until one returns a result
 * @param barcode The product barcode (UPC/EAN)
 */
export async function fetchProductByBarcode(barcode: string): Promise<ExternalProduct | null> {
  logger.info(`Looking up barcode: ${barcode}`);

  // Normalize barcode - remove non-numeric characters and pad properly
  const normalizedBarcode = barcode.replace(/[^0-9]/g, '');

  // Log the normalized barcode for debugging
  console.log(`[UPC Service] Normalized barcode: ${normalizedBarcode} (original: ${barcode})`);

  // Try multiple sources in parallel for speed, take first successful result
  // Order by coverage: food > general merchandise > beauty
  const results = await Promise.allSettled([
    tryOpenFoodFacts(normalizedBarcode),
    tryUPCItemDB(normalizedBarcode),
    tryBarcodeLookup(normalizedBarcode),
    tryEANSearch(normalizedBarcode),
    tryWalmartSearch(normalizedBarcode),
    tryOpenBeautyFacts(normalizedBarcode) // Fallback for cosmetics
  ]);

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      logger.info(`Found product via ${result.value.source}: ${result.value.name}`);
      return result.value;
    }
  }

  logger.info(`Product with barcode ${barcode} not found in any external database`);
  return null;
}
