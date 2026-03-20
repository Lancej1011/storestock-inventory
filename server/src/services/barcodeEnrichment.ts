/**
 * External barcode enrichment services.
 * Called when a barcode is not found in the local database.
 * Priority: Open Food Facts (food) → UPC Item DB (general fallback)
 */

export interface EnrichedProduct {
  name: string;
  description?: string;
  imageUrl?: string;
  categoryHint?: string;
  dataSource: 'openfoodfacts' | 'upcitemdb';
}

const FETCH_TIMEOUT_MS = 6000;

function timeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

/**
 * Query Open Food Facts (3M+ grocery products, no API key required).
 * https://world.openfoodfacts.org/api/v0/product/{barcode}.json
 */
export async function fetchFromOpenFoodFacts(barcode: string): Promise<EnrichedProduct | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
      {
        headers: { 'User-Agent': 'StoreStock/1.0 (inventory management; contact@storestock.app)' },
        signal: timeout(FETCH_TIMEOUT_MS),
      }
    );

    if (!res.ok) return null;

    const data = await res.json() as {
      status: number;
      product?: {
        product_name?: string;
        abbreviated_product_name?: string;
        brands?: string;
        quantity?: string;
        categories?: string;
        image_front_url?: string;
        image_url?: string;
      };
    };

    if (data.status !== 1 || !data.product) return null;

    const p = data.product;
    const productName = p.product_name || p.abbreviated_product_name;
    if (!productName) return null;

    // Build a readable name: "Brand — Product Name"
    const brand = p.brands?.split(',')[0]?.trim();
    const name = brand ? `${brand} — ${productName}` : productName;

    // Build a compact description from quantity + top-level category
    const topCategory = p.categories?.split(',')[0]?.trim();
    const descParts = [p.quantity, topCategory].filter(Boolean);
    const description = descParts.length > 0 ? descParts.join(' · ') : undefined;

    const imageUrl = p.image_front_url || p.image_url || undefined;

    // Pick first human-readable category (skip en:/fr:/ prefixed taxonomy entries)
    const categoryHint = p.categories
      ?.split(',')
      .map((c: string) => c.trim())
      .find((c: string) => !c.includes(':') && c.length > 2);

    return { name, description, imageUrl, categoryHint, dataSource: 'openfoodfacts' };
  } catch {
    return null;
  }
}

/**
 * Query UPC Item DB as secondary fallback (non-food items, 100 req/day free tier).
 * https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}
 */
export async function fetchFromUPCItemDB(barcode: string): Promise<EnrichedProduct | null> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      {
        headers: { 'User-Agent': 'StoreStock/1.0 (inventory management)' },
        signal: timeout(FETCH_TIMEOUT_MS),
      }
    );

    if (!res.ok) return null;

    const data = await res.json() as {
      code: string;
      items?: Array<{
        title?: string;
        brand?: string;
        description?: string;
        images?: string[];
      }>;
    };

    if (data.code !== 'OK' || !data.items?.length) return null;

    const item = data.items[0];
    if (!item.title) return null;

    return {
      name: item.title,
      description: item.description || undefined,
      imageUrl: item.images?.[0] || undefined,
      categoryHint: item.category || undefined,
      dataSource: 'upcitemdb',
    };
  } catch {
    return null;
  }
}

/**
 * Run the full enrichment chain: OFF first, then UPC Item DB.
 * Returns null only when both sources come up empty.
 */
export async function enrichBarcode(barcode: string): Promise<EnrichedProduct | null> {
  const offResult = await fetchFromOpenFoodFacts(barcode);
  if (offResult) return offResult;

  const upcResult = await fetchFromUPCItemDB(barcode);
  return upcResult;
}
