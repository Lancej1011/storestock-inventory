import { useState, useEffect, useRef } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import axios from 'axios';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { LensScanner, ProductMatch, IdentifiedProduct } from '../components/scanner/LensScanner';
import { ShelfCounter } from '../components/scanner/ShelfCounter';
import { ScanResults } from '../components/scanner/ScanResults';
import { ProductForm } from '../components/scanner/ProductForm';
import { StockUpdateForm } from '../components/scanner/StockUpdateForm';

type ScanMode = 'lens' | 'shelf' | 'barcode';

interface Product {
  id: string;
  barcode: string;
  sku: string;
  name: string;
  description?: string;
  costPrice: string;
  retailPrice: string;
  category?: { id: string; name: string };
  images?: { id: string; imageUrl: string; isPrimary: boolean }[];
}

interface ScannedItem {
  product: Product;
  count: number;
}

interface Inventory {
  id: string;
  quantity: number;
  store: { id: string; name: string };
  location?: { id: string; aisle: string; shelf: string };
}

interface Store {
  id: string;
  name: string;
}

interface Location {
  id: string;
  aisle: string;
  shelf: string;
  bin?: string;
}

interface ShelfCountResult {
  label: string;
  count: number;
  cocoClass: string;
}

export default function Scan() {
  const { user } = useAuthStore();
  const [mode, setMode] = useState<ScanMode>('lens');

  // Product / inventory state
  const [product, setProduct] = useState<Product | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [stockInSuccess, setStockInSuccess] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '', sku: '', costPrice: '', retailPrice: '', description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // Barcode mode state
  const [scanning, setScanning] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const processingRef = useRef(false);                    // prevents duplicate reads in single-scan mode
  const lastScannedRef = useRef<string>('');              // debounce for continuous mode
  const lastScannedTimeRef = useRef<number>(0);           // debounce timestamp
  const notFoundBarcodesRef = useRef<Set<string>>(new Set()); // barcodes confirmed not in DB — skip retrying

  // Shelf counter state
  const [shelfResults, setShelfResults] = useState<ShelfCountResult[]>([]);

  useEffect(() => {
    if (user?.store) setSelectedStoreId(user.store.id);
    fetchStores();
  }, [user]);

  useEffect(() => {
    if (selectedStoreId) {
      fetchLocations(selectedStoreId);
      setSelectedLocationId('');
    }
  }, [selectedStoreId]);

  useEffect(() => {
    return () => {
      if (readerRef.current) readerRef.current.reset();
    };
  }, []);

  const fetchStores = async () => {
    try {
      const response = await api.get('/stores');
      setStores(response.data);
      if (!user?.store && response.data.length > 0) {
        setSelectedStoreId(response.data[0].id);
      }
    } catch {
      console.error('Failed to fetch stores');
    }
  };

  const fetchLocations = async (storeId: string) => {
    try {
      const response = await api.get(`/locations?storeId=${storeId}`);
      setLocations(response.data);
    } catch {
      setLocations([]);
    }
  };

  const resetProductState = () => {
    setProduct(null);
    setInventory(null);
    setResult(null);
    setStockInSuccess(false);
    setShowAddProduct(false);
    setError(null);
    setNewProduct({ name: '', sku: '', costPrice: '', retailPrice: '', description: '' });
    setQuantity(1);
    setSelectedLocationId('');
    setScannedItems([]);
    setContinuousMode(false);
    setShelfResults([]);
  };

  const switchMode = (m: ScanMode) => {
    stopBarcodeScanning();
    resetProductState();
    setMode(m);
  };

  // ── Lens mode callbacks ────────────────────────────────────────────────────

  const handleLensProductFound = (p: ProductMatch) => {
    setProduct(p as unknown as Product);
    const storeInventory = (p as unknown as Product & { inventory?: Inventory[] })
      .inventory?.find((inv) => inv.store.id === selectedStoreId);
    setInventory(storeInventory ?? null);
  };

  const handleLensNoMatch = (identified: IdentifiedProduct) => {
    const prefill = [identified.brand, identified.name, identified.variant]
      .filter(Boolean)
      .join(' ');
    setNewProduct((prev) => ({ ...prev, name: prefill }));
    setResult('NEW-' + Date.now());
    setShowAddProduct(true);
  };

  // ── Barcode mode ───────────────────────────────────────────────────────────

  const startBarcodeScanning = async (continuous: boolean = false) => {
    resetProductState();
    processingRef.current = false;
    lastScannedRef.current = '';
    lastScannedTimeRef.current = 0;
    notFoundBarcodesRef.current = new Set();
    setScanning(true);
    setContinuousMode(continuous);

    try {
      readerRef.current = new BrowserMultiFormatReader();
      const devices = await readerRef.current.listVideoInputDevices();
      if (devices.length === 0) throw new Error('No camera found');

      const back = devices.find(
        (d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear')
      );
      const deviceId = back?.deviceId || devices[0].deviceId;

      readerRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current!,
        async (scanResult, err) => {
          if (scanResult) {
            const barcode = scanResult.getText();
            if (continuous) {
              // Skip barcodes already confirmed as not in the database
              if (notFoundBarcodesRef.current.has(barcode)) return;
              // Debounce: ignore the same barcode within 1.5 s to avoid double-counts
              const now = Date.now();
              if (barcode === lastScannedRef.current && now - lastScannedTimeRef.current < 1500) return;
              lastScannedRef.current = barcode;
              lastScannedTimeRef.current = now;
              await handleContinuousScan(barcode);
            } else {
              // Single scan: only process once, then stop
              if (processingRef.current) return;
              processingRef.current = true;
              setResult(barcode);
              await lookupProduct(barcode);
              stopBarcodeScanning();
            }
          }
          if (err && !(err instanceof NotFoundException)) {
            console.error(err);
          }
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scanner');
      setScanning(false);
    }
  };

  const stopBarcodeScanning = () => {
    if (readerRef.current) readerRef.current.reset();
    setScanning(false);
  };

  const handleContinuousScan = async (barcode: string) => {
    try {
      const existing = scannedItems.findIndex((item) => item.product.barcode === barcode);
      if (existing >= 0) {
        const updated = [...scannedItems];
        updated[existing].count += 1;
        setScannedItems(updated);
      } else {
        const response = await api.get(`/products/barcode/${encodeURIComponent(barcode)}`);
        setScannedItems((prev) => [...prev, { product: response.data, count: 1 }]);
      }
      playBeep();
    } catch (err: any) {
      if (err?.response?.status === 404) {
        // Product not in database — don't waste requests retrying it
        notFoundBarcodesRef.current.add(barcode);
        console.log('Barcode not in inventory, skipping further attempts:', barcode);
      } else {
        console.log('Scan error for barcode:', barcode, err?.message);
      }
    }
  };

  const playBeep = () => {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1000;
    osc.type = 'sine';
    gain.gain.value = 0.1;
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  };

  const lookupProduct = async (barcode: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/products/barcode/${encodeURIComponent(barcode)}`);
      const data = response.data;

      if (data.isExternalResult) {
        // Found via external barcode API — not yet in our database.
        // Pre-populate the add-product form with what we know.
        const name = [data.brand, data.name].filter(Boolean).join(' ') || data.name || '';
        setNewProduct((prev) => ({
          ...prev,
          name,
          description: data.description || '',
        }));
        setResult(barcode);
        setShowAddProduct(true);
      } else {
        // Already in our database
        setProduct(data);
        const storeInventory = data.inventory?.find(
          (inv: { store: { id: string } }) => inv.store.id === selectedStoreId
        );
        setInventory(storeInventory ?? null);
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        // Genuinely unknown barcode — show blank add form
        setShowAddProduct(true);
      } else {
        setError('Failed to lookup product');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualSearch = async (barcode: string) => {
    if (!barcode.trim()) return;
    setResult(barcode);
    await lookupProduct(barcode);
  };

  // ── Shelf counter callback ─────────────────────────────────────────────────

  const handleShelfCount = (results: ShelfCountResult[]) => {
    setShelfResults(results);
  };

  // ── Inventory actions ──────────────────────────────────────────────────────

  const handleStockIn = async () => {
    if (!product || !selectedStoreId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.post('/inventory/stock-in', {
        productId: product.id,
        storeId: selectedStoreId,
        locationId: selectedLocationId || undefined,
        quantity,
      });
      setInventory(response.data);
      setStockInSuccess(true);
      setQuantity(1);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Failed to add stock' : 'Failed to add stock');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = async () => {
    const barcode = result?.startsWith('NEW-') ? result.replace('NEW-', '') : result;
    if (!barcode || !newProduct.name || !newProduct.sku || !newProduct.costPrice || !newProduct.retailPrice) {
      setError('Please fill in all required fields');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.post('/products', {
        barcode,
        ...newProduct,
        costPrice: parseFloat(newProduct.costPrice),
        retailPrice: parseFloat(newProduct.retailPrice),
      });
      setProduct(response.data);
      setResult(barcode);
      setShowAddProduct(false);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Failed to create product' : 'Failed to create product');
    } finally {
      setLoading(false);
    }
  };

  const addAllToInventory = async () => {
    if (scannedItems.length === 0 || !selectedStoreId) return;
    setLoading(true);
    setError(null);
    try {
      for (const item of scannedItems) {
        await api.post('/inventory/stock-in', {
          productId: item.product.id,
          storeId: selectedStoreId,
          locationId: selectedLocationId || undefined,
          quantity: item.count,
        });
      }
      setStockInSuccess(true);
      setScannedItems([]);
      setContinuousMode(false);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Failed to add items' : 'Failed to add items');
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const MODES: { id: ScanMode; label: string; desc: string }[] = [
    { id: 'lens', label: 'AI Lens', desc: 'Point & identify' },
    { id: 'shelf', label: 'Shelf Count', desc: 'Live counting' },
    { id: 'barcode', label: 'Barcode', desc: 'Scan or type' },
  ];

  return (
    <div className="space-y-8 animate-fade-in pb-24">
      {/* Header */}
      <div>
        <h1 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white font-heading tracking-tight">
          Scanner Hub
        </h1>
        <p className="text-slate-500 dark:text-slate-400 font-medium tracking-tight">
          AI-Powered Inventory Intelligence
        </p>
      </div>

      <div className="max-w-xl mx-auto space-y-6">
        {/* Mode selector */}
        <div className="premium-card p-1.5 grid grid-cols-3 gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => switchMode(m.id)}
              className={`py-3 px-2 rounded-xl transition-all ${
                mode === m.id
                  ? 'bg-indigo-600 shadow-lg shadow-indigo-500/25'
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <p className={`text-[10px] font-black uppercase tracking-widest ${mode === m.id ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                {m.label}
              </p>
              <p className={`text-[9px] font-medium mt-0.5 ${mode === m.id ? 'text-indigo-200' : 'text-slate-400'}`}>
                {m.desc}
              </p>
            </button>
          ))}
        </div>

        {/* ── AI Lens Mode ── */}
        {mode === 'lens' && !product && !showAddProduct && (
          <LensScanner
            onProductFound={handleLensProductFound}
            onNoMatch={handleLensNoMatch}
          />
        )}

        {/* ── Shelf Counter Mode ── */}
        {mode === 'shelf' && shelfResults.length === 0 && (
          <ShelfCounter onCountConfirmed={handleShelfCount} />
        )}

        {/* Shelf results summary */}
        {mode === 'shelf' && shelfResults.length > 0 && (
          <div className="premium-card p-6 space-y-4 animate-fade-in">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Shelf Count Results</p>
            {shelfResults.map((r) => (
              <div key={r.label} className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <p className="font-black text-slate-900 dark:text-white">{r.label}</p>
                <span className="text-2xl font-black text-emerald-500 tabular-nums">{r.count}</span>
              </div>
            ))}
            <button
              onClick={() => setShelfResults([])}
              className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-500 hover:border-indigo-300 transition-all"
            >
              Scan Again
            </button>
          </div>
        )}

        {/* ── Barcode Mode ── */}
        {mode === 'barcode' && (
          <div className="space-y-4">
            {/* Camera view for barcode */}
            <div className="premium-card overflow-hidden">
              <div className="relative aspect-square max-h-[360px] bg-slate-900 rounded-3xl overflow-hidden">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  style={{ opacity: scanning ? 1 : 0.4 }}
                  playsInline
                  muted
                />
                <canvas className="absolute inset-0 w-full h-full pointer-events-none" />

                {scanning && !continuousMode && (
                  <div className="absolute inset-0 flex items-center justify-center p-10">
                    <div className="w-full h-48 border-2 border-white/10 rounded-3xl relative">
                      <div className="absolute -top-1 -left-1 w-7 h-7 border-t-4 border-l-4 border-sky-400 rounded-tl-xl" />
                      <div className="absolute -top-1 -right-1 w-7 h-7 border-t-4 border-r-4 border-sky-400 rounded-tr-xl" />
                      <div className="absolute -bottom-1 -left-1 w-7 h-7 border-b-4 border-l-4 border-sky-400 rounded-bl-xl" />
                      <div className="absolute -bottom-1 -right-1 w-7 h-7 border-b-4 border-r-4 border-sky-400 rounded-br-xl" />
                      <div className="absolute inset-x-0 top-0 h-[2px] bg-sky-400 shadow-[0_0_12px_#38bdf8] animate-[scanLaser_2s_ease-in-out_infinite]" />
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-full">
                        <span className="text-[9px] font-black text-white uppercase tracking-[0.25em] animate-pulse">
                          {continuousMode ? 'Multi-Scan Active' : 'Align Barcode'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {!scanning && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
                    <div className="text-center px-8">
                      <div className="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                        </svg>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button onClick={() => startBarcodeScanning(false)} className="btn-premium px-8 py-3.5 text-sm font-black uppercase tracking-widest">
                          Scan Barcode
                        </button>
                        <button
                          onClick={() => startBarcodeScanning(true)}
                          className="py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-500 transition-colors"
                        >
                          Continuous / Batch Mode
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {scanning && (
              <button
                onClick={stopBarcodeScanning}
                className="w-full bg-red-500 hover:bg-red-600 text-white py-4 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-red-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                Stop Scanning
              </button>
            )}

            {/* Manual entry */}
            {!scanning && !product && !showAddProduct && (
              <div className="premium-card p-6 bg-slate-50 dark:bg-slate-900/50">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 block">
                  Manual Entry
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    id="manualBarcode"
                    placeholder="Enter barcode or SKU..."
                    className="flex-1 input-premium py-3"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleManualSearch((e.currentTarget as HTMLInputElement).value);
                    }}
                  />
                  <button
                    onClick={() => {
                      const input = document.getElementById('manualBarcode') as HTMLInputElement;
                      handleManualSearch(input.value);
                    }}
                    className="btn-premium px-6 text-[10px] font-black uppercase tracking-widest"
                  >
                    Search
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-600 dark:text-red-400 p-5 rounded-2xl flex items-center gap-4 animate-shake">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <p className="font-bold text-sm">{error}</p>
          </div>
        )}

        {/* ── Stock in success ── */}
        {stockInSuccess && (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 p-5 rounded-2xl flex items-center gap-4 animate-fade-in">
            <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-0.5">Success</p>
              <p className="font-bold text-emerald-700 dark:text-emerald-300">Stock added to inventory.</p>
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col items-center py-10 gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 border-4 border-indigo-100 dark:border-indigo-900/30 rounded-full" />
              <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Processing...</p>
          </div>
        )}

        {/* ── Barcode scan results (continuous/batch mode) ── */}
        {mode === 'barcode' && (
          <ScanResults
            product={product}
            scannedItems={scannedItems}
            continuousMode={continuousMode}
            onClear={() => { setScannedItems([]); setContinuousMode(false); }}
            onAddAll={addAllToInventory}
            loading={loading}
          />
        )}

        {/* ── Product found → stock update form ── */}
        {!loading && product && (
          <>
            {mode === 'lens' && (
              <div className="flex justify-end">
                <button onClick={resetProductState} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-500 transition-colors">
                  ← Scan another
                </button>
              </div>
            )}
            <StockUpdateForm
              product={product}
              inventory={inventory}
              quantity={quantity}
              onQuantityChange={setQuantity}
              selectedStoreId={selectedStoreId}
              onStoreChange={setSelectedStoreId}
              selectedLocationId={selectedLocationId}
              onLocationChange={setSelectedLocationId}
              stores={stores}
              locations={locations}
              onUpdate={handleStockIn}
              loading={loading}
              success={stockInSuccess}
            />
          </>
        )}

        {/* ── New product form ── */}
        {!loading && showAddProduct && !product && (
          <ProductForm
            formData={newProduct}
            onChange={(e) =>
              setNewProduct({ ...newProduct, [e.target.name]: Number(e.target.value) || e.target.value })
            }
            onSubmit={handleCreateProduct}
            onCancel={resetProductState}
            loading={loading}
          />
        )}

        {/* ── Register new product shortcut (lens/barcode) ── */}
        {!product && !showAddProduct && !scanning && mode !== 'shelf' && (
          <button
            onClick={() => {
              setShowAddProduct(true);
              setResult('NEW-' + Date.now());
            }}
            className="w-full py-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 hover:text-indigo-500 hover:border-indigo-400 transition-all flex items-center justify-center gap-2 group"
          >
            <svg className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Register New Product
          </button>
        )}
      </div>
    </div>
  );
}
