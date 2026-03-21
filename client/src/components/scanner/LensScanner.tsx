import { useState, useRef, useCallback, useEffect } from 'react';
import api from '../../services/api';
import { analyzeProductLabel, initializeOCR } from '../../utils/ocr';
import {
  loadEmbeddingModel,
  createFingerprint,
  findProductByEmbedding,
  registerProduct,
  type VisualEmbedding,
} from '../../utils/productFingerprint';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IdentifiedProduct {
  brand: string | null;
  name: string | null;
  variant: string | null;
  description: string | null;
  size: string | null;
  category: string | null;
  confidence: number;
  quantity: number;
  searchTerms: string[];
}

export interface ProductMatch {
  id: string;
  name: string;
  barcode: string;
  sku: string;
  retailPrice: string;
  costPrice: string;
  description?: string;
  images: { imageUrl: string; isPrimary: boolean }[];
  category: { id: string; name: string } | null;
}

export interface AisleContext {
  aisleNumber: string;
  description?: string;
  categories: string[];
  recentItems: string[];
}

export interface ScanResult {
  identified: IdentifiedProduct;
  matches: ProductMatch[];
}

interface LensScannerProps {
  onProductFound: (product: ProductMatch) => void;
  onNoMatch: (identified: IdentifiedProduct) => void;
  aisleContext?: AisleContext;
  storeId?: string;
}

const CATEGORIES = ['beverage','snack','cleaning','personal_care','food','electronics','household','other'];

// ─── Component ────────────────────────────────────────────────────────────────

export function LensScanner({ onProductFound, onNoMatch, aisleContext, storeId }: LensScannerProps) {
  const [cameraActive, setCameraActive]   = useState(false);
  const [identifying, setIdentifying]     = useState(false);
  const [ocrEnhancing, setOcrEnhancing]   = useState(false);
  const [ocrUsed, setOcrUsed]             = useState(false);
  const [visualHit, setVisualHit]         = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [imageThumb, setImageThumb]       = useState<string | null>(null);
  const [results, setResults]             = useState<ScanResult[]>([]);
  const [error, setError]                 = useState<string | null>(null);
  const [flash, setFlash]                 = useState(false);

  // Track feedback state: 'idle' | 'confirmed' | 'correcting' | 'saved'
  const [feedbackState, setFeedbackState] = useState<'idle' | 'confirmed' | 'correcting' | 'saved'>('idle');
  // Editable correction values
  const [correction, setCorrection]       = useState<Partial<IdentifiedProduct>>({});

  // Holds the MobileNet embedding from the most recent capture — saved to server on confirm
  const pendingEmbeddingRef = useRef<VisualEmbedding | null>(null);

  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Derived from results — primary (first) product drives the single-product UI path
  const identified = results[0]?.identified ?? null;
  const matches    = results[0]?.matches    ?? [];

  // ── Camera ────────────────────────────────────────────────────────────────

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setError('Camera access denied. Please allow camera permissions and try again.');
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    // Pre-warm both workers so they're ready before first capture
    initializeOCR().catch(() => {/* non-fatal */});
    loadEmbeddingModel().catch(() => {/* non-fatal */});
    return () => stopCamera();
  }, [stopCamera]);

  /** Called whenever the user confirms a product match — saves embedding to server and sends feedback. */
  const confirmProduct = useCallback((product: ProductMatch) => {
    const embedding = pendingEmbeddingRef.current;
    if (embedding) {
      registerProduct(product.id, embedding, product.name, product.barcode);
      api.post('/embeddings', {
        productId: product.id,
        barcode: product.barcode,
        name: product.name,
        embedding,
        storeId,
      }).catch(() => {/* fire and forget */});
      pendingEmbeddingRef.current = null;
    }
    onProductFound(product);
  }, [onProductFound, storeId]);

  const capture = useCallback(async () => {
    if (!videoRef.current || identifying) return;

    setFlash(true);
    setTimeout(() => setFlash(false), 150);
    setIdentifying(true);
    setOcrEnhancing(false);
    setOcrUsed(false);
    setVisualHit(false);
    setResults([]);
    setError(null);
    setFeedbackState('idle');
    setCorrection({});
    pendingEmbeddingRef.current = null;

    const video  = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    setCapturedImage(dataUrl);
    stopCamera();

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width  = 160;
    thumbCanvas.height = 120;
    thumbCanvas.getContext('2d')!.drawImage(video, 0, 0, 160, 120);
    const thumb = thumbCanvas.toDataURL('image/jpeg', 0.5);
    setImageThumb(thumb);

    const base64 = dataUrl.split(',')[1];
    const fullBbox: [number, number, number, number] = [0, 0, canvas.width, canvas.height];

    try {
      // ── Step 1: Embedding check ──
      let embeddingMatch: { productId: string; confidence: number } | null = null;
      try {
        const embedding = await Promise.race([
          createFingerprint(canvas, fullBbox),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
        ]) as VisualEmbedding;
        pendingEmbeddingRef.current = embedding;
        embeddingMatch = findProductByEmbedding(embedding, 0.6);
      } catch { /* skip */ }

      // ── Step 2: ≥90% visual match → skip Gemini ──
      if (embeddingMatch && embeddingMatch.confidence >= 0.9) {
        try {
          const productRes = await api.get(`/products/${embeddingMatch.productId}`);
          const p: ProductMatch = productRes.data;
          const fakeResult: ScanResult = {
            identified: {
              brand: null, name: p.name, variant: null, description: p.description ?? null,
              size: null, category: null, confidence: embeddingMatch.confidence, quantity: 1, searchTerms: [],
            },
            matches: [p],
          };
          setResults([fakeResult]);
          setVisualHit(true);
          setIdentifying(false);
          confirmProduct(p);
          return;
        } catch { /* fall through to Gemini */ }
      }

      // ── Step 3: Gemini + OCR in parallel ──
      const [geminiResponse, ocrResult] = await Promise.all([
        api.post('/scan/identify', { image: base64, mimeType: 'image/jpeg', aisleContext }),
        analyzeProductLabel(canvas),
      ]);

      let { products } = geminiResponse.data as { products: ScanResult[] };

      // Inject embedding suggestion (60-89%) into first product's matches if empty
      if (embeddingMatch && embeddingMatch.confidence >= 0.6 && products.length > 0 && products[0].matches.length === 0) {
        try {
          const suggestedRes = await api.get(`/products/${embeddingMatch.productId}`);
          products = [
            { ...products[0], matches: [suggestedRes.data, ...products[0].matches] },
            ...products.slice(1),
          ];
        } catch { /* non-fatal */ }
      }

      // ── Step 4: OCR enhancement — only for single low-confidence result ──
      const ocrText = ocrResult.rawText.trim();
      if (products.length === 1 && products[0].identified.confidence < 0.7 && ocrText.length > 15) {
        setIdentifying(false);
        setOcrEnhancing(true);
        try {
          const refined = await api.post('/scan/identify', {
            image: base64, mimeType: 'image/jpeg', ocrText, aisleContext,
          });
          products = (refined.data as { products: ScanResult[] }).products;
          setOcrUsed(true);
        } catch { /* fall through */ }
        setOcrEnhancing(false);
      }

      setResults(products);

      // Auto-confirm only for single product with exactly one inventory match
      if (products.length === 1 && products[0].matches.length === 1) {
        confirmProduct(products[0].matches[0]);
      }
    } catch {
      setError('Could not identify product. Check your connection and try again.');
    } finally {
      setIdentifying(false);
      setOcrEnhancing(false);
    }
  }, [identifying, stopCamera, confirmProduct, aisleContext]);

  const reset = () => {
    setCapturedImage(null);
    setImageThumb(null);
    setResults([]);
    setFeedbackState('idle');
    setCorrection({});
    setError(null);
    setOcrUsed(false);
    setOcrEnhancing(false);
    setVisualHit(false);
    pendingEmbeddingRef.current = null;
    startCamera();
  };

  // ── Feedback helpers ──────────────────────────────────────────────────────

  const sendFeedback = async (
    original: IdentifiedProduct,
    corrected: IdentifiedProduct,
    wasCorrect: boolean,
    productId?: string,
  ) => {
    try {
      await api.post('/scan/feedback', {
        imageThumb:      imageThumb?.split(',')[1] ?? '',
        geminiResult:    original,
        correctedResult: corrected,
        wasCorrect,
        productId,
      });
      setFeedbackState('saved');
    } catch {
      // Fail silently — don't block the user
      setFeedbackState('saved');
    }
  };

  const handleConfirm = () => {
    if (!identified) return;
    setFeedbackState('confirmed');
    const matched = matches[0];
    sendFeedback(identified, identified, true, matched?.id);
  };

  const handleStartCorrect = () => {
    if (!identified) return;
    setCorrection({ ...identified });
    setFeedbackState('correcting');
  };

  const handleSubmitCorrection = () => {
    if (!identified) return;
    const corrected = { ...identified, ...correction } as IdentifiedProduct;
    sendFeedback(identified, corrected, false);
  };

  const updateCorrection = (field: keyof IdentifiedProduct, value: string | null) => {
    setCorrection((p) => ({ ...p, [field]: value }));
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const confidenceColor = (c: number) =>
    c > 0.7
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
      : c > 0.4
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
      : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';

  const merged = identified ? { ...identified, ...correction } : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* Viewfinder */}
      <div className="relative rounded-3xl overflow-hidden bg-slate-950 aspect-[4/3] shadow-2xl">
        {flash && <div className="absolute inset-0 bg-white z-50 pointer-events-none" />}

        {capturedImage
          ? <img src={capturedImage} className="w-full h-full object-cover" alt="Captured frame" />
          : <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        }

        {/* Corner guides */}
        {cameraActive && (
          <>
            <div className="absolute top-5 left-5 w-10 h-10 border-t-[3px] border-l-[3px] border-sky-400 rounded-tl-xl" />
            <div className="absolute top-5 right-5 w-10 h-10 border-t-[3px] border-r-[3px] border-sky-400 rounded-tr-xl" />
            <div className="absolute bottom-5 left-5 w-10 h-10 border-b-[3px] border-l-[3px] border-sky-400 rounded-bl-xl" />
            <div className="absolute bottom-5 right-5 w-10 h-10 border-b-[3px] border-r-[3px] border-sky-400 rounded-br-xl" />
            <div className="absolute inset-x-0 bottom-6 flex justify-center">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60 bg-black/30 backdrop-blur-sm px-4 py-1.5 rounded-full">
                Point at product and tap Identify
              </p>
            </div>
          </>
        )}

        {/* Identifying / OCR overlay */}
        {(identifying || ocrEnhancing) && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-10">
            <div className="relative">
              <div className={`w-16 h-16 border-4 rounded-full ${ocrEnhancing ? 'border-amber-500/30' : 'border-indigo-500/30'}`} />
              <div className={`absolute inset-0 w-16 h-16 border-4 border-t-transparent rounded-full animate-spin ${ocrEnhancing ? 'border-amber-500' : 'border-indigo-500'}`} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white animate-pulse">
              {ocrEnhancing ? 'Enhancing with OCR...' : 'Identifying Product...'}
            </p>
          </div>
        )}

        {/* Inactive */}
        {!cameraActive && !capturedImage && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm">
            <div className="text-center px-8">
              <div className="w-20 h-20 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 flex items-center justify-center mx-auto mb-6 shadow-2xl">
                <svg className="w-10 h-10 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                </svg>
              </div>
              <button onClick={startCamera} className="btn-premium px-10 py-4 text-sm font-black uppercase tracking-widest">
                Start Camera
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Capture button */}
      {cameraActive && (
        <button
          onClick={capture}
          disabled={identifying}
          className="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/25 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          Identify Product
        </button>
      )}

      {/* Try again */}
      {capturedImage && !identifying && (
        <button
          onClick={reset}
          className="w-full py-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-500 active:scale-[0.98] transition-all"
        >
          Scan Again
        </button>
      )}

      {/* ── Results ── */}
      {identified && !identifying && !ocrEnhancing && (
        <div className="premium-card p-5 space-y-4 animate-fade-in">

          {/* ── Product header ── */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {visualHit ? 'Visual Match' : 'AI Identified'}
                </p>
                {visualHit && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 text-[9px] font-black uppercase tracking-wider">
                    Instant · No API Call
                  </span>
                )}
                {ocrUsed && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[9px] font-black uppercase tracking-wider">
                    OCR Enhanced
                  </span>
                )}
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-white leading-tight">
                {[identified.brand, identified.name].filter(Boolean).join(' ') || 'Unknown Product'}
              </h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {identified.variant && (
                  <span className="text-xs font-medium text-slate-500">{identified.variant}</span>
                )}
                {identified.category && (
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {identified.category.replace('_', ' ')}
                  </span>
                )}
                {identified.quantity > 1 && (
                  <span className="px-2 py-0.5 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-[10px] font-black uppercase tracking-wider">
                    ×{identified.quantity} visible
                  </span>
                )}
              </div>
            </div>
            <div className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 ${confidenceColor(identified.confidence)}`}>
              {Math.round(identified.confidence * 100)}%
            </div>
          </div>

          {/* ── Inventory matches ── */}
          {matches.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {matches.length} in inventory
              </p>
              {matches.map((m) => {
                const img = m.images.find((i) => i.isPrimary);
                return (
                  <button
                    key={m.id}
                    onClick={() => confirmProduct(m)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 transition-all text-left group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-700 shrink-0 overflow-hidden flex items-center justify-center">
                      {img
                        ? <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                        : <span className="text-sm font-black text-slate-400">{m.name.charAt(0)}</span>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-900 dark:text-white text-sm truncate">{m.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{m.sku} · ${parseFloat(m.retailPrice).toFixed(2)}</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 flex items-center justify-between gap-3">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-300">Not in inventory</p>
              <button
                onClick={() => onNoMatch(identified)}
                className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 hover:underline shrink-0"
              >
                Register →
              </button>
            </div>
          )}

          {/* ── Feedback row ── */}
          {feedbackState === 'idle' && (
            <div className="flex gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={handleConfirm}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase tracking-wider hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Correct
              </button>
              <button
                onClick={handleStartCorrect}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[10px] font-black uppercase tracking-wider hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                </svg>
                Wrong — Fix it
              </button>
            </div>
          )}

          {/* ── Confirmed banner ── */}
          {(feedbackState === 'confirmed' || feedbackState === 'saved') && (
            <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Confirmed — saved for training
              </p>
            </div>
          )}

          {/* ── Correction form ── */}
          {feedbackState === 'correcting' && merged && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Correct the identification</p>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Brand</label>
                  <input
                    type="text"
                    value={merged.brand ?? ''}
                    onChange={(e) => updateCorrection('brand', e.target.value || null)}
                    placeholder="e.g. Doritos"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Product Name</label>
                  <input
                    type="text"
                    value={merged.name ?? ''}
                    onChange={(e) => updateCorrection('name', e.target.value || null)}
                    placeholder="e.g. Tortilla Chips"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Variant / Flavor / Size</label>
                <input
                  type="text"
                  value={merged.variant ?? ''}
                  onChange={(e) => updateCorrection('variant', e.target.value || null)}
                  placeholder="e.g. Sweet Chili, 9.25oz"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Category</label>
                <select
                  value={merged.category ?? ''}
                  onChange={(e) => updateCorrection('category', e.target.value || null)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:border-indigo-400"
                >
                  <option value="">— select —</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setFeedbackState('idle')}
                  className="flex-1 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:border-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitCorrection}
                  className="flex-2 flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-wider transition-colors"
                >
                  Submit Correction
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Additional products detected (multi-product mode) ── */}
      {results.length > 1 && !identifying && !ocrEnhancing && (
        <div className="space-y-3 animate-fade-in">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
            {results.length - 1} more product{results.length - 1 !== 1 ? 's' : ''} detected
          </p>
          {results.slice(1).map((r, idx) => (
            <div key={idx} className="premium-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-black text-slate-900 dark:text-white text-sm truncate">
                    {[r.identified.brand, r.identified.name].filter(Boolean).join(' ') || 'Unknown Product'}
                  </p>
                  {(r.identified.variant || r.identified.size) && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {[r.identified.variant, r.identified.size].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 ${confidenceColor(r.identified.confidence)}`}>
                  {Math.round(r.identified.confidence * 100)}%
                </span>
              </div>
              {r.matches.length > 0 ? (
                <div className="space-y-1.5">
                  {r.matches.map((m) => {
                    const img = m.images.find((i) => i.isPrimary);
                    return (
                      <button
                        key={m.id}
                        onClick={() => confirmProduct(m)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 transition-all text-left group"
                      >
                        <div className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-700 shrink-0 overflow-hidden flex items-center justify-center">
                          {img
                            ? <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                            : <span className="text-xs font-black text-slate-400">{m.name.charAt(0)}</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-slate-900 dark:text-white text-sm truncate">{m.name}</p>
                          <p className="text-xs text-slate-400">{m.sku}</p>
                        </div>
                        <svg className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50">
                  <p className="text-xs font-bold text-amber-600 dark:text-amber-300">Not in inventory</p>
                  <button
                    onClick={() => onNoMatch(r.identified)}
                    className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 hover:underline"
                  >
                    Register →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 flex items-center gap-3">
          <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
          <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
