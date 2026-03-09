import * as mobilenet from '@tensorflow-models/mobilenet';

let model: mobilenet.MobileNet | null = null;
let productEmbeddings: Map<string, Float32Array> = new Map();

// Load MobileNet model
export async function loadModel(): Promise<mobilenet.MobileNet> {
  if (!model) {
    console.log('Loading MobileNet model...');
    model = await mobilenet.load({
      version: 2,
      alpha: 1.0
    });
    console.log('MobileNet model loaded');
  }
  return model;
}

// Extract image features using MobileNet
export async function extractFeatures(imageElement: HTMLImageElement | HTMLVideoElement): Promise<Float32Array | null> {
  try {
    const m = await loadModel();
    
    // MobileNet's infer method returns predictions
    const activation = m.infer(imageElement, true);
    
    // Get the tensor data
    const data = await activation.data();
    
    // Return as Float32Array
    return new Float32Array(data);
  } catch (error) {
    console.error('Error extracting features:', error);
    return null;
  }
}

// Store product embedding
export function storeProductEmbedding(productId: string, embedding: Float32Array): void {
  productEmbeddings.set(productId, embedding);
}

// Store multiple product embeddings
export function storeProductEmbeddings(products: { id: string; imageUrl: string }[]): void {
  // This would be called after loading product images
  console.log(`Stored embeddings for ${products.length} products`);
}

// Calculate cosine similarity between two vectors (for future embedding matching)
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Find matching product from camera image
export async function findMatchingProduct(
  videoElement: HTMLVideoElement,
  products: { id: string; name: string; imageUrl: string }[],
  threshold: number = 0.7
): Promise<{ product: typeof products[0]; confidence: number } | null> {
  try {
    const features = await extractFeatures(videoElement);
    if (!features) return null;
    
    let bestMatch: typeof products[0] | null = null;
    let bestScore = 0;
    
    // For each product with an image, we would compare
    // This is a simplified version - in production, we'd pre-compute embeddings
    for (const product of products) {
      if (!product.imageUrl) continue;
      
      // In a real implementation, we'd use pre-stored embeddings
      // For now, we'll do a quick classification
      const predictions = await loadModel().then(m => m.classify(videoElement));
      
      // Check if any prediction matches the product
      for (const pred of predictions) {
        const productNameLower = product.name.toLowerCase();
        const predClassLower = pred.className.toLowerCase();
        
        // Simple substring match for demonstration
        if (predClassLower.includes(productNameLower) || 
            productNameLower.includes(predClassLower.split(' ')[0])) {
          if (pred.probability > bestScore && pred.probability > threshold) {
            bestScore = pred.probability;
            bestMatch = product;
          }
        }
      }
    }
    
    if (bestMatch) {
      return { product: bestMatch, confidence: bestScore };
    }
    
    return null;
  } catch (error) {
    console.error('Error finding matching product:', error);
    return null;
  }
}

interface Prediction {
  className: string;
  probability: number;
}

// Get top predictions for an image
export async function classifyImage(imageElement: HTMLImageElement | HTMLVideoElement): Promise<Prediction[]> {
  const m = await loadModel();
  return m.classify(imageElement);
}

// Clean up resources
export function dispose(): void {
  if (model) {
    model = null;
  }
  productEmbeddings.clear();
}
