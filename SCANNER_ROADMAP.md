# Scanner Intelligence Roadmap
_Saved: March 2026_

## Current State (Completed)
- [x] Gemini 2.5 Flash vision AI for product identification
- [x] Multi-product detection in a single image (returns array)
- [x] Quantity counting per product type in frame
- [x] Barcode scanning with @zxing (debounced, single + continuous modes)
- [x] Confirm / correct feedback UI per scan result
- [x] ScanFeedback table in DB (stores original AI result + user correction)
- [x] Past corrections injected into every Gemini prompt as training context
- [x] Two scanner modes planned: Lens (point & snap) + Shelf Counter (live feed)

---

## Phase 1 — Kill the "Not Found" Problem
**Priority: Highest | Effort: Low**

### 1A. Open Food Facts API Integration
- Free, open database with 3M+ grocery products
- Trigger: barcode scanned → not in local DB → auto-query Open Food Facts
- Returns: brand, name, category, weight/size, images, nutrition facts
- Auto-populate product into local DB on first scan
- API: `https://world.openfoodfacts.org/api/v0/product/{barcode}.json`
- No API key required

### 1B. UPC Item DB Fallback
- Fallback for non-food items Open Food Facts doesn't cover
- Free tier: 100 requests/day — `https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}`
- Use as secondary fallback after Open Food Facts

**Files to touch:**
- `server/src/routes/products.ts` — add barcode lookup fallback in GET /barcode/:barcode
- `client/src/pages/Scan.tsx` — handle auto-populated product response

---

## Phase 2 — Smarter Identification
**Priority: High | Effort: Low-Medium**

### 2A. Tesseract OCR (Already Installed)
- `tesseract.js` is in client/package.json but never used
- Run OCR on captured frame when Gemini confidence < 70%
- Extracts text from label → feeds into Gemini prompt as additional context
- Best for: flavor/variant disambiguation (Sweet Chili vs Blue Ranch)
- Also useful: reading weights/sizes, extracting barcodes from images

### 2B. Location Context Injection
- `AisleLayout` table already exists in schema
- Add aisle selector before scanning session starts
- Inject into Gemini prompt: "Scanning in Aisle 4 — Snacks & Chips. Last 3 items: Doritos, Lays, Pringles"
- Narrows Gemini's search space dramatically for ambiguous products

### 2C. Brand → Category Intelligence
- Build learned brand→category mapping as products are confirmed
- New product with known brand → auto-categorize
- Store in DB, grows over time
- Examples: Frito-Lay→snack, Coca-Cola→beverage, Tide→cleaning

---

## Phase 3 — Your Own Local AI Model
**Priority: High | Effort: Medium**

### 3A. CLIP Embedding Generation (Transformers.js)
- On every confirmed scan → generate 512-dim visual embedding of thumbnail
- Store in existing `ProductEmbedding` table
- On future scans → compare embedding similarity BEFORE calling Gemini
- Score ≥ 90% → instant match, no API call
- Score 60-89% → show as suggestion, still run Gemini
- Score < 60% → run Gemini only
- Model: `Xenova/clip-vit-base-patch32` via Transformers.js (free, runs in browser)
- Over time: Gemini gets called less and less

### 3B. Fine-tuned MobileNet (Later — needs data volume first)
- Once 50+ confirmed images per product accumulated
- Train a custom TensorFlow.js classifier on your specific products
- Runs 100% offline, instant recognition
- True custom model trained only on your store's inventory

**Files to touch:**
- `client/src/utils/productFingerprint.ts` — wire up CLIP embedding generation
- `client/src/utils/multiModalMatcher.ts` — wire up similarity search
- `server/src/routes/scan.ts` — check embeddings before Gemini call

---

## Phase 4 — Organization & Workflow
**Priority: Medium | Effort: Medium**

### 4A. Case / Unit Relationships
- A 24-pack contains 24 individual units
- Scanning a case → option to count as N units
- Critical for receiving deliveries accurately
- New DB table: `ProductBundle` (parentProductId, childProductId, quantity)

### 4B. Smart Duplicate Prevention
- Before saving new product → similarity check against existing products
- Catches "Doritos Sweet Chili 9.25oz" vs "Doritos Sweet Chili Chips 9oz" duplicates
- Use name similarity + embedding comparison

### 4C. QR Code / Label Generation
- Generate shelf labels and QR codes for products
- QR encodes product ID → instant scan, no barcode needed
- Useful for produce, store-made items, items without manufacturer barcodes
- Library: `qrcode` npm package

### 4D. Supplier Catalog Sync
- Products on PO should auto-exist before delivery arrives
- Connect to supplier CSV/EDI feeds
- Bulk import from supplier catalogs

---

## Technical Architecture Notes

### Scan Flow (Target State)
```
Camera captures frame
  → Generate CLIP embedding (browser, ~100ms)
  → Check ProductEmbedding table for similarity
      ≥ 90% match → return instantly (no API call)
      60-89%      → suggest + run Gemini in parallel
      < 60%       → run Gemini only
  → Gemini identifies (if needed)
  → Run Tesseract OCR if confidence < 70%
  → Inject location context + past corrections into prompt
  → Return results to UI
  → User confirms or corrects
  → Save ScanFeedback + update ProductEmbedding
```

### Barcode Flow (Target State)
```
Barcode detected
  → Query local DB
      Found → show product
      Not found → query Open Food Facts
          Found → auto-create product, show to user for confirmation
          Not found → query UPC Item DB
              Found → auto-create product
              Not found → show "Register new product" form
```

### Key Existing Infrastructure
- `ProductEmbedding` table — ready, not wired up
- `AisleLayout` table — ready, not wired up
- `ScanFeedback` table — live, collecting data
- `tesseract.js` — installed in client, not used
- `productFingerprint.ts` — scaffolded, not wired up
- `multiModalMatcher.ts` — scaffolded, not wired up
- Gemini 2.5 Flash — live and working
- Feedback training loop — live and working

---

## Recommended Build Order
1. Open Food Facts barcode fallback (biggest immediate impact)
2. Tesseract OCR for variant disambiguation
3. Location context injection (schema already done)
4. CLIP embedding layer (starts replacing Gemini calls)
5. Case/unit relationships (receiving workflow)
6. QR label generation
7. Fine-tuned MobileNet (needs data volume first)
