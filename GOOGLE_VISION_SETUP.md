# Google Cloud Vision Product Search Setup

Your app now integrates with Google Cloud Vision API for real-time product recognition. The scanner will use:

1. **OCR** - Reads text directly from product packaging (e.g., "Gatorade", "Doritos", "Oreos")
2. **Label Detection** - Identifies general product types
3. **Object Detection** - Localizes products within the image

## Current Status

Your project already has:
- `GOOGLE_CLOUD_PROJECT_ID=inventory-490718`
- Service account JSON configured at `./inventory-490718-7c843fa5a5d0.json`

## Quick Test (No Setup Required)

The scanner should work NOW using OCR to read product names from packaging. Point the camera at:
- A Gatorade bottle → should read "Gatorade"
- A Doritos bag → should read "Doritos"
- An Oreos box → should read "Oreo"

## Full Product Search Setup (Optional - for higher accuracy)

For even better recognition, set up Google Cloud Vision Product Search:

### 1. Create a Product Set

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select project `inventory-490718`
3. Enable Cloud Vision API if not already enabled
4. Go to Vision Dashboard → Product Search
5. Create a Product Set called "inventory-products"

### 2. Add Products with Reference Images

For each product (Gatorade, Doritos, Oreos, etc.):
1. Add 5-10 images of the product from different angles
2. Tag with product name, barcode, category

### 3. Update the Scanner Code

Once you have a Product Set, update the scanner to use PRODUCT_SEARCH:

```typescript
// In shelfScanner.ts, modify enhanceWithGoogleVision
const response = await api.post('/vision/search-products', {
  image: imageData,
  productCategory: 'general-grocery',
  maxResults: 5
});
```

## Testing the Current Implementation

1. Make sure you're logged in (401 error means not authenticated)
2. Go to Scanner page
3. Click "AI Scanner" or "Shelf Count"
4. Point camera at a product with clear text/logo

## Troubleshooting

### "Google Vision API enhancement failed"
- Check server is running
- Check server console for authentication errors
- Ensure `GOOGLE_APPLICATION_CREDENTIALS` path is correct

### Products not recognized
- Ensure product text is visible and not blurry
- Use good lighting
- OCR works best when text is horizontal and clear

### 401 Unauthorized
- Log out and log back in
- Your session token may have expired
