import { useState, useEffect, useRef } from 'react';
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library';
import axios from 'axios';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { loadModel, classifyImage } from '../utils/imageRecognition';
import { analyzeProductLabel, matchOCRToProducts, OCRResult } from '../utils/ocr';
import { loadShelfModel, detectProducts, DetectedObject } from '../utils/shelfScanner';
import { ScannerView } from '../components/scanner/ScannerView';
import { ScanResults } from '../components/scanner/ScanResults';
import { ProductForm } from '../components/scanner/ProductForm';
import { StockUpdateForm } from '../components/scanner/StockUpdateForm';

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

export default function Scan() {
  const { user } = useAuthStore();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: '',
    sku: '',
    costPrice: '',
    retailPrice: '',
    description: '',
  });
  const [stockInSuccess, setStockInSuccess] = useState(false);
  // Continuous scanning state
  const [continuousMode, setContinuousMode] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  // Visual search state
  const [visualSearchMode, setVisualSearchMode] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [visualPredictions, setVisualPredictions] = useState<{ className: string; probability: number }[]>([]);
  const visualSearchRef = useRef<number | null>(null);
  // OCR Search state
  const [ocrMode, setOcrMode] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const ocrSearchRef = useRef<number | null>(null);
  // Combined Smart Search state
  const [smartSearchMode, setSmartSearchMode] = useState(false);
  // Shelf Scan state
  const [shelfScanMode, setShelfScanMode] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const shelfScanRef = useRef<number | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  // Get user's store or fetch stores
  useEffect(() => {
    if (user?.store) {
      setSelectedStoreId(user.store.id);
    }
    fetchStores();
  }, [user]);

  // Fetch locations when store changes
  useEffect(() => {
    if (selectedStoreId) {
      fetchLocations(selectedStoreId);
      setSelectedLocationId('');
    }
  }, [selectedStoreId]);

  const fetchStores = async () => {
    try {
      const response = await api.get('/stores');
      setStores(response.data);
      if (!user?.store && response.data.length > 0) {
        setSelectedStoreId(response.data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch stores:', err);
    }
  };

  const fetchLocations = async (storeId: string) => {
    try {
      const response = await api.get(`/locations?storeId=${storeId}`);
      setLocations(response.data);
    } catch (err) {
      console.error('Failed to fetch locations:', err);
      setLocations([]);
    }
  };

  useEffect(() => {
    return () => {
      if (readerRef.current) {
        readerRef.current.reset();
      }
    };
  }, []);

  const startScanning = async (continuous: boolean = false) => {
    setError(null);
    setResult(null);
    setProduct(null);
    setInventory(null);
    setStockInSuccess(false);
    setShowAddProduct(false);
    setScanning(true);
    setContinuousMode(continuous);
    if (!continuous) {
      setScannedItems([]);
    }

    try {
      readerRef.current = new BrowserMultiFormatReader();
      const videoInputDevices = await readerRef.current.listVideoInputDevices();
      
      if (videoInputDevices.length === 0) {
        throw new Error('No camera found');
      }

      // Prefer back camera on mobile
      const backCamera = videoInputDevices.find(
        (device) => device.label.toLowerCase().includes('back') || 
                   device.label.toLowerCase().includes('rear')
      );
      const selectedDeviceId = backCamera?.deviceId || videoInputDevices[0].deviceId;

      readerRef.current.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current!,
        async (result, err) => {
          if (result) {
            const barcode = result.getText();
            
            if (continuous) {
              // In continuous mode, keep scanning and count items
              await handleContinuousScan(barcode);
            } else {
              // Single scan mode
              setResult(barcode);
              await lookupProduct(barcode);
              stopScanning();
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

  const handleContinuousScan = async (barcode: string) => {
    try {
      // Check if product already scanned
      const existingIndex = scannedItems.findIndex(item => item.product.barcode === barcode);
      
      if (existingIndex >= 0) {
        // Increment count
        const updated = [...scannedItems];
        updated[existingIndex].count += 1;
        setScannedItems(updated);
      } else {
        // Lookup product and add to list
        const response = await api.get(`/products/barcode/${encodeURIComponent(barcode)}`);
        setScannedItems(prev => [...prev, { product: response.data, count: 1 }]);
      }
      
      // Play a beep sound for feedback
      playBeep();
    } catch (err) {
      // Product not found - ignore in continuous mode or could show warning
      console.log('Product not found:', barcode);
    }
  };

  const playBeep = () => {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.value = 1000;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.1;
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.1);
  };

  // Visual Search Functions
  const fetchProducts = async () => {
    try {
      const response = await api.get('/products?limit=100');
      setProducts(response.data.data);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    }
  };

  const startVisualSearch = async () => {
    setError(null);
    setModelLoading(true);
    setVisualSearchMode(true);
    setScanning(true);
    
    try {
      await loadModel();
      await fetchProducts();
      setModelLoading(false);
      runVisualRecognition();
    } catch (err) {
      setError('Failed to start visual search');
      setModelLoading(false);
      setVisualSearchMode(false);
      setScanning(false);
    }
  };

  const runVisualRecognition = async () => {
    if (!videoRef.current || !visualSearchMode) return;
    
    try {
      const predictions = await classifyImage(videoRef.current);
      setVisualPredictions(predictions);
      
      const matchedProduct = matchPredictionsToProducts(predictions);
      
      if (matchedProduct) {
        playBeep();
        setResult(matchedProduct.barcode);
        setProduct(matchedProduct);
        stopVisualSearch();
        return;
      }
      
      if (visualSearchMode) {
        visualSearchRef.current = window.setTimeout(() => runVisualRecognition(), 1000);
      }
    } catch (err) {
      console.error('Visual recognition error:', err);
      if (visualSearchMode) {
        visualSearchRef.current = window.setTimeout(() => runVisualRecognition(), 1000);
      }
    }
  };

  const matchPredictionsToProducts = (predictions: { className: string; probability: number }[]): Product | null => {
    for (const pred of predictions) {
      const predLower = pred.className.toLowerCase();
      
      for (const product of products) {
        const productNameLower = product.name.toLowerCase();
        const productWords = productNameLower.split(' ').filter(w => w.length > 2);
        
        for (const word of productWords) {
          if (predLower.includes(word) && pred.probability > 0.1) {
            return product;
          }
        }
        
        if (predLower.length > 3 && productNameLower.includes(predLower.split(' ')[0])) {
          return product;
        }
      }
    }
    return null;
  };

  const startShelfScan = async () => {
    setError(null);
    setModelLoading(true);
    setShelfScanMode(true);
    setScanning(true);
    
    try {
      await loadShelfModel();
      setModelLoading(false);
      runShelfDetection();
    } catch (err) {
      setError('Failed to start shelf scanner');
      setModelLoading(false);
      setShelfScanMode(false);
      setScanning(false);
    }
  };

  const runShelfDetection = async () => {
    if (!videoRef.current || !shelfScanMode) return;
    
    try {
      const detections = await detectProducts(videoRef.current);
      setDetectedObjects(detections);
      drawBoundingBoxes(detections);
      
      // Update counts based on unique detections
      // In a real app, we'd more accurately match these to products
      
      if (shelfScanMode) {
        shelfScanRef.current = window.setTimeout(() => runShelfDetection(), 200);
      }
    } catch (err) {
      console.error('Shelf detection error:', err);
      if (shelfScanMode) {
        shelfScanRef.current = window.setTimeout(() => runShelfDetection(), 500);
      }
    }
  };

  const drawBoundingBoxes = (detections: DetectedObject[]) => {
    const canvas = canvasRef.current;
    if (!canvas || !videoRef.current) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Match canvas size to video display size
    canvas.width = videoRef.current.clientWidth;
    canvas.height = videoRef.current.clientHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    detections.forEach(det => {
      const [x, y, width, height] = det.bbox;
      
      // Adjust coordinates based on video scale
      const scaleX = canvas.width / videoRef.current!.videoWidth;
      const scaleY = canvas.height / videoRef.current!.videoHeight;
      
      ctx.strokeStyle = '#0ea5e9';
      ctx.lineWidth = 3;
      ctx.strokeRect(x * scaleX, y * scaleY, width * scaleX, height * scaleY);
      
      ctx.fillStyle = '#0ea5e9';
      ctx.font = '14px sans-serif';
      ctx.fillText(`${det.id}`, x * scaleX, y * scaleY > 20 ? y * scaleY - 5 : 15);
    });
  };

  const stopShelfScan = () => {
    setShelfScanMode(false);
    if (shelfScanRef.current) {
      clearTimeout(shelfScanRef.current);
    }
    setScanning(false);
    setDetectedObjects([]);
  };

  const stopVisualSearch = () => {
    if (visualSearchRef.current) {
      clearTimeout(visualSearchRef.current);
      visualSearchRef.current = null;
    }
    setVisualSearchMode(false);
    setScanning(false);
    setVisualPredictions([]);
  };

  // OCR Search Functions
  const startOcrSearch = async () => {
    setError(null);
    setModelLoading(true);
    setOcrMode(true);
    setScanning(true);
    setOcrResult(null);
    
    try {
      // Fetch products for matching
      await fetchProducts();
      setModelLoading(false);
      
      // Start OCR recognition loop
      runOcrRecognition();
    } catch (err) {
      setError('Failed to start label search');
      setModelLoading(false);
      setOcrMode(false);
      setScanning(false);
    }
  };

  const runOcrRecognition = async () => {
    if (!videoRef.current || !ocrMode) return;
    
    try {
      // Analyze the image for text
      const ocrResult = await analyzeProductLabel(videoRef.current);
      setOcrResult(ocrResult);
      
      // Try to match OCR results with products
      const matchedProduct = matchOCRToProducts(ocrResult, products);
      
      if (matchedProduct) {
        playBeep();
        // Fetch full product details
        try {
          const response = await api.get(`/products/${matchedProduct.product.id}`);
          setProduct(response.data);
          setResult(response.data.barcode);
        } catch {
          setProduct(matchedProduct.product as unknown as Product);
          setResult(matchedProduct.product.barcode);
        }
        stopOcrSearch();
        return;
      }
      
      // Continue scanning every 2 seconds
      if (ocrMode) {
        ocrSearchRef.current = window.setTimeout(() => runOcrRecognition(), 2000);
      }
    } catch (err) {
      console.error('OCR recognition error:', err);
      if (ocrMode) {
        ocrSearchRef.current = window.setTimeout(() => runOcrRecognition(), 2000);
      }
    }
  };

  const stopOcrSearch = () => {
    if (ocrSearchRef.current) {
      clearTimeout(ocrSearchRef.current);
      ocrSearchRef.current = null;
    }
    setOcrMode(false);
    setScanning(false);
    setOcrResult(null);
  };

  // Smart Search - Combined Visual + OCR
  const startSmartSearch = async () => {
    setError(null);
    setModelLoading(true);
    setSmartSearchMode(true);
    setScanning(true);
    setOcrResult(null);
    setVisualPredictions([]);
    
    try {
      // Load models
      await loadModel();
      await fetchProducts();
      setModelLoading(false);
      
      // Start combined recognition
      runSmartSearch();
    } catch (err) {
      setError('Failed to start smart search');
      setModelLoading(false);
      setSmartSearchMode(false);
      setScanning(false);
    }
  };

  const runSmartSearch = async () => {
    if (!videoRef.current || !smartSearchMode) return;
    
    try {
      // Run both visual recognition and OCR in parallel
      const [visualResult, ocrAnalysis] = await Promise.all([
        classifyImage(videoRef.current).catch(() => []),
        analyzeProductLabel(videoRef.current).catch(() => null)
      ]);
      
      setVisualPredictions(visualResult);
      if (ocrAnalysis) {
        setOcrResult(ocrAnalysis);
      }
      
      // Try matching with both methods
      let matchedProduct = null;
      
      // 1. Try visual match
      const visualMatch = matchPredictionsToProducts(visualResult);
      if (visualMatch) {
        matchedProduct = visualMatch;
      }
      
      // 2. Try OCR match (higher priority if found)
      if (ocrAnalysis) {
        const ocrMatch = matchOCRToProducts(ocrAnalysis, products);
        if (ocrMatch && ocrMatch.confidence > 0.5) {
          matchedProduct = ocrMatch.product;
        }
      }
      
      if (matchedProduct) {
        playBeep();
        try {
          const response = await api.get(`/products/${matchedProduct.id}`);
          setProduct(response.data);
          setResult(response.data.barcode);
        } catch {
          setProduct(matchedProduct as unknown as Product);
          setResult(matchedProduct.barcode);
        }
        stopSmartSearch();
        return;
      }
      
      // Continue scanning
      if (smartSearchMode) {
        ocrSearchRef.current = window.setTimeout(() => runSmartSearch(), 1500);
      }
    } catch (err) {
      console.error('Smart search error:', err);
      if (smartSearchMode) {
        ocrSearchRef.current = window.setTimeout(() => runSmartSearch(), 1500);
      }
    }
  };

  const stopSmartSearch = () => {
    if (ocrSearchRef.current) {
      clearTimeout(ocrSearchRef.current);
      ocrSearchRef.current = null;
    }
    setSmartSearchMode(false);
    setScanning(false);
    setOcrResult(null);
    setVisualPredictions([]);
  };

  const stopScanning = () => {
    if (readerRef.current) {
      readerRef.current.reset();
    }
    if (shelfScanMode) stopShelfScan();
    setScanning(false);
  };

  const lookupProduct = async (barcode: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/products/barcode/${encodeURIComponent(barcode)}`);
      setProduct(response.data);
      // Check if product has inventory at selected store
      const storeInventory = response.data.inventory?.find(
        (inv: { store: { id: string } }) => inv.store.id === selectedStoreId
      );
      if (storeInventory) {
        setInventory(storeInventory);
      } else {
        setInventory(null);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        // Product not found - show option to create
        setProduct(null);
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

  const handleStockIn = async () => {
    if (!product || !selectedStoreId) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await api.post('/inventory/stock-in', {
        productId: product.id,
        storeId: selectedStoreId,
        locationId: selectedLocationId || undefined,
        quantity: quantity,
      });
      setInventory(response.data);
      setStockInSuccess(true);
      setQuantity(1);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Failed to add stock');
      } else {
        setError('Failed to add stock');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = async () => {
    // Get the actual barcode (remove 'NEW-' prefix if present)
    const barcode = result?.startsWith('NEW-') ? result.replace('NEW-', '') : result;
    
    if (!barcode || !newProduct.name || !newProduct.sku || !newProduct.costPrice || !newProduct.retailPrice) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.post('/products', {
        barcode: barcode,
        ...newProduct,
        costPrice: parseFloat(newProduct.costPrice),
        retailPrice: parseFloat(newProduct.retailPrice),
      });
      setProduct(response.data);
      setResult(barcode);
      setShowAddProduct(false);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Failed to create product');
      } else {
        setError('Failed to create product');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetScanner = () => {
    setResult(null);
    setProduct(null);
    setInventory(null);
    setStockInSuccess(false);
    setShowAddProduct(false);
    setNewProduct({ name: '', sku: '', costPrice: '', retailPrice: '', description: '' });
    setQuantity(1);
    setSelectedLocationId('');
    setScannedItems([]);
    setContinuousMode(false);
  };

  const addAllToInventory = async () => {
    if (scannedItems.length === 0 || !selectedStoreId) return;
    
    setLoading(true);
    setError(null);
    try {
      // Add each scanned item to inventory
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
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || 'Failed to add items to inventory');
      } else {
        setError('Failed to add items to inventory');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-10 animate-fade-in pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white font-heading tracking-tight">Scanner Hub</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium tracking-tight">AI-Powered Neural Inventory Intelligence</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/50 dark:border-slate-700/50 text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-sm transition-colors">
             Scanner Status: <span className={scanning ? 'text-emerald-500 animate-pulse' : 'text-slate-400'}>{scanning ? 'Active' : 'Standby'}</span>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto space-y-10">
        <ScannerView
          ref={videoRef}
          scanning={scanning}
          shelfScanMode={shelfScanMode}
          continuousMode={continuousMode}
          detectedObjectsCount={detectedObjects.length}
          onStartSingle={() => startScanning(false)}
        />

        {scanning && (
          <div className="animate-fade-in">
            <button
              onClick={() => {
                if (shelfScanMode) stopShelfScan();
                else if (smartSearchMode) stopSmartSearch();
                else if (visualSearchMode) stopVisualSearch();
                else if (ocrMode) stopOcrSearch();
                else stopScanning();
              }}
              className="w-full bg-red-500 hover:bg-red-600 text-white py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-xl shadow-red-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 group"
            >
              <div className="w-2 h-2 rounded-full bg-white animate-ping" />
              Terminate Intelligence Sync
            </button>
          </div>
        )}

        {/* Scan Mode Grid */}
        {!scanning && !result && !product && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={startShelfScan}
                disabled={modelLoading}
                className="premium-card p-1 text-left group transition-all duration-500 hover:-translate-y-1 active:scale-[0.98]"
              >
                <div className="bg-gradient-to-br from-indigo-600 to-sky-600 dark:from-indigo-500 dark:to-sky-500 rounded-[1.4rem] p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl translate-x-1/2 -translate-y-1/2 group-hover:scale-150 transition-transform duration-700" />
                  <div className="relative z-10 flex items-start justify-between">
                    <div>
                      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white/20 text-white text-[9px] font-black uppercase tracking-widest mb-4 backdrop-blur-md">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Neural Engine
                      </span>
                      <h3 className="text-3xl font-black text-white font-heading tracking-tight mb-2">Shelf Scan</h3>
                      <p className="text-sky-100/70 text-sm font-medium leading-relaxed max-w-[240px]">Multi-object neural counting and spatial asset tracking.</p>
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center group-hover:rotate-12 transition-transform shadow-xl">
                      <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                    </div>
                  </div>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={startSmartSearch}
                disabled={modelLoading}
                className="premium-card p-6 flex items-center justify-between group hover:border-indigo-500/30 transition-all active:scale-[0.98]"
              >
                <div className="flex items-center gap-5">
                   <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <svg className="w-7 h-7 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                         <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.25 15L17.437 17.846a1.125 1.125 0 01-1.542 1.542L15 18.25l.813-2.846a1.125 1.125 0 011.542-1.542L18.25 15z" />
                      </svg>
                   </div>
                   <div className="text-left">
                      <h4 className="text-xl font-black text-slate-900 dark:text-white font-heading tracking-tight uppercase">Smart Fusion</h4>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">OCR + Visual Shape Detection</p>
                   </div>
                </div>
                <svg className="w-6 h-6 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Barcode', desc: 'Standard SKU Sync', icon: 'M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z', action: () => startScanning(false) },
                { label: 'Continuous', desc: 'High-Volume Intake', icon: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99', action: () => startScanning(true) }
              ].map((btn, i) => (
                <button
                  key={i}
                  onClick={btn.action}
                  className="premium-card p-6 text-left group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all active:scale-95"
                >
                  <div className={`w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${i === 0 ? 'group-hover:text-sky-500' : 'group-hover:text-emerald-500'}`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={btn.icon} />
                    </svg>
                  </div>
                  <h5 className="text-sm font-black text-slate-900 dark:text-white font-heading tracking-tight uppercase">{btn.label}</h5>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">{btn.desc}</p>
                </button>
              ))}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               <button
                  onClick={startVisualSearch}
                  disabled={modelLoading}
                  className="w-full py-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl hover:border-indigo-500/30 flex items-center justify-center gap-2"
               >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                  Visual Search
               </button>
               <button
                  onClick={startOcrSearch}
                  disabled={modelLoading}
                  className="w-full py-4 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl hover:border-indigo-500/30 flex items-center justify-center gap-2"
               >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                  Label Search
               </button>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 text-red-600 dark:text-red-400 p-6 rounded-2xl animate-shake shadow-lg shadow-red-500/5 flex items-center gap-4">
             <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
             </div>
             <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-0.5">Intelligence Error</p>
                <p className="font-bold">{error}</p>
             </div>
          </div>
        )}

        {/* Success Message */}
        {stockInSuccess && (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-6 rounded-2xl animate-fade-in shadow-lg shadow-emerald-500/5 flex items-center gap-4">
             <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
             </div>
             <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-0.5">Asset Logged</p>
                <p className="font-bold">Successfully synchronized unit(s) to the inventory mesh.</p>
             </div>
          </div>
        )}

        {/* Loading Global */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
            <div className="relative w-16 h-16 mb-6">
               <div className="absolute inset-0 border-4 border-indigo-100 dark:border-indigo-900/30 rounded-full" />
               <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin shadow-xl shadow-indigo-500/20" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse">Processing Neural Request...</p>
          </div>
        )}

        <ScanResults
          product={product}
          scannedItems={scannedItems}
          continuousMode={continuousMode}
          onClear={() => {
            setScannedItems([]);
            setContinuousMode(false);
          }}
          onAddAll={addAllToInventory}
          loading={loading}
          visualPredictions={visualPredictions}
          ocrResult={ocrResult}
          smartSearchMode={smartSearchMode}
        />

        {!loading && product && (
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
        )}

        {!loading && showAddProduct && !product && (
          <ProductForm
            formData={newProduct}
            onChange={(e) => setNewProduct({ ...newProduct, [e.target.name]: Number(e.target.value) || e.target.value })}
            onSubmit={handleCreateProduct}
            onCancel={resetScanner}
            loading={loading}
          />
        )}

        {/* Manual Entry UI */}
        {!result && !scanning && (
          <div className="pt-10 border-t border-slate-100 dark:border-slate-800 animate-fade-in-up">
            <div className="flex flex-col gap-6">
               <div className="premium-card p-8 bg-slate-50 dark:bg-slate-900/50 border-slate-200/50 dark:border-slate-800">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4 block">Manual Override</label>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      id="manualBarcode"
                      placeholder="Enter Asset ID / Barcode..."
                      className="flex-1 input-premium py-4"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleManualSearch((e.currentTarget as HTMLInputElement).value);
                        }
                      }}
                    />
                    <button 
                      onClick={() => {
                        const input = document.getElementById('manualBarcode') as HTMLInputElement;
                        handleManualSearch(input.value);
                      }}
                      className="btn-premium px-8 font-black text-[10px] uppercase tracking-widest shadow-lg"
                    >
                      SEARCH
                    </button>
                  </div>
               </div>

               <button
                  onClick={() => {
                    setShowAddProduct(true);
                    setResult('NEW-' + Date.now());
                  }}
                  className="w-full py-5 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 hover:border-indigo-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-3 group"
               >
                  <svg className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  Register Unidentified Asset
               </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
