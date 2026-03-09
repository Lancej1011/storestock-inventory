import Tesseract from 'tesseract.js';

let worker: Tesseract.Worker | null = null;

// Initialize Tesseract worker
export async function initializeOCR(): Promise<Tesseract.Worker> {
  if (!worker) {
    console.log('Initializing OCR worker...');
    worker = await Tesseract.createWorker('eng');
    console.log('OCR worker initialized');
  }
  return worker;
}

// Extract text from image
export async function extractText(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<string> {
  try {
    const w = await initializeOCR();
    const result = await w.recognize(imageElement);
    return result.data.text;
  } catch (error) {
    console.error('OCR Error:', error);
    return '';
  }
}

// Extract text and parse it for product information
export interface OCRResult {
  rawText: string;
  words: string[];
  possibleBrand: string | null;
  possibleProductName: string | null;
  confidence: number;
}

export async function analyzeProductLabel(imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement): Promise<OCRResult> {
  try {
    const w = await initializeOCR();
    const result = await w.recognize(imageElement);
    
    // Get words from result - using type assertion for compatibility
    const words: string[] = [];
    if ('words' in result.data && Array.isArray(result.data.words)) {
      for (const w of result.data.words as unknown[]) {
        if (typeof w === 'object' && w !== null && 'text' in w) {
          words.push((w as { text: string }).text);
        }
      }
    }
    const rawText = result.data.text;
    
    // Find possible brand names and product names
    // This is a simple heuristic - can be enhanced with ML
    const possibleBrand = findBrandName(words);
    const possibleProductName = findProductName(words);
    
    return {
      rawText,
      words,
      possibleBrand,
      possibleProductName,
      confidence: result.data.confidence
    };
  } catch (error) {
    console.error('OCR Analysis Error:', error);
    return {
      rawText: '',
      words: [],
      possibleBrand: null,
      possibleProductName: null,
      confidence: 0
    };
  }
}

// Common brand names for matching
const KNOWN_BRANDS = [
  'coca-cola', 'coca cola', 'pepsi', 'nestle', 'cadbury', 'oreo',
  'lays', 'doritos', 'kellogg', 'kelloggs', 'general mills', 'hershey',
  'mars', 'kraft', 'unilever', 'procter', 'gillette', 'dove', 'axe',
  'red bull', 'monster', 'starbucks', 'dunkin', 'mcdonalds', 'subway',
  'tide', 'gain', 'downy', 'bounty', 'crest', 'colgate', 'pampers',
  'huggies', 'clorox', 'clorox', 'rubbermaid', 'crayola', 'lego',
  'hasbro', 'mattel', 'barbie', 'hot wheels', 'nerf', 'play-doh',
  'fisher-price', 'disney', 'pixar', 'marvel', 'harry potter',
  'nike', 'adidas', 'puma', 'under armour', 'reebok',
  'apple', 'samsung', 'sony', 'lg', 'dell', 'hp', 'lenovo',
  'amazon', 'google', 'microsoft', 'intel', 'amd', 'nvidia',
  'heinz', 'campbell', 'kraft', 'oscar mayer', 'jell-o', 'pudding',
  ' Quaker', 'capn crunch', 'lucky charms', 'cheerios', 'frosted flakes',
  'tropical mist', 'fanta', 'sprite', 'mountain dew', 'dr pepper'
];

function findBrandName(words: string[]): string | null {
  const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''));
  
  for (const brand of KNOWN_BRANDS) {
    const brandClean = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (lowerWords.some(w => w.includes(brandClean) || brandClean.includes(w))) {
      return brand.charAt(0).toUpperCase() + brand.slice(1);
    }
  }
  
  return null;
}

function findProductName(words: string[]): string | null {
  // Skip first few words if they look like brand names
  let startIndex = 0;
  const lowerWords = words.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''));
  
  // Find first substantial word that's not a brand
  for (let i = 0; i < Math.min(3, words.length); i++) {
    const word = lowerWords[i];
    if (word.length > 3 && !KNOWN_BRANDS.some(b => b.toLowerCase().replace(/[^a-z0-9]/g, '').includes(word))) {
      startIndex = i;
      break;
    }
  }
  
  // Get a sequence of words that could be product name
  const productWords: string[] = [];
  for (let i = startIndex; i < Math.min(startIndex + 5, words.length); i++) {
    if (words[i].length > 2) {
      productWords.push(words[i]);
    }
  }
  
  if (productWords.length > 0) {
    return productWords.join(' ');
  }
  
  return null;
}

// Match OCR results to products in database
export function matchOCRToProducts(
  ocrResult: OCRResult,
  products: { id: string; name: string; barcode: string }[]
): { product: typeof products[0]; matchType: 'exact' | 'brand' | 'partial'; confidence: number } | null {
  const searchText = (ocrResult.rawText + ' ' + (ocrResult.possibleBrand || '') + ' ' + (ocrResult.possibleProductName || '')).toLowerCase();
  
  // First try exact match on product name
  for (const product of products) {
    const productNameLower = product.name.toLowerCase();
    if (searchText.includes(productNameLower)) {
      return { product, matchType: 'exact', confidence: 0.9 };
    }
  }
  
  // Try brand match
  if (ocrResult.possibleBrand) {
    const brandLower = ocrResult.possibleBrand.toLowerCase();
    for (const product of products) {
      const productNameLower = product.name.toLowerCase();
      if (productNameLower.includes(brandLower) || brandLower.includes(productNameLower.split(' ')[0])) {
        return { product, matchType: 'brand', confidence: 0.7 };
      }
    }
  }
  
  // Try partial match on words
  if (ocrResult.possibleProductName) {
    const productWords = ocrResult.possibleProductName.toLowerCase().split(' ').filter(w => w.length > 3);
    for (const word of productWords) {
      for (const product of products) {
        const productNameLower = product.name.toLowerCase();
        if (productNameLower.includes(word)) {
          return { product, matchType: 'partial', confidence: 0.5 };
        }
      }
    }
  }
  
  return null;
}

// Clean up resources
export async function disposeOCR(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
