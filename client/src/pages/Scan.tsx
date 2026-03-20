import { useState, useRef, useEffect, useCallback } from 'react';
import { ScannerView } from '../components/scanner/ScannerView';
import { ScanResults } from '../components/scanner/ScanResults';
import {
  detectProductsMultiModal,
  resetTracker,
  getTrackerStats
} from '../utils/shelfScanner';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { DecodeHintType, BarcodeFormat } from '@zxing/library';
import { createWorker } from 'tesseract.js';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { CountManager, getCountManager, resetCountManager, CountedItem } from '../utils/countManager';
import { registerIdentifiedProduct } from '../utils/multiModalMatcher';
import { loadEmbeddingModel } from '../utils/productFingerprint';
import { OCRResult } from '../utils/ocr';

export interface ScannedProduct {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  price: number;
  image?: string;
  count?: number;
  confidence?: number;
  matchType?: 'barcode' | 'ocr' | 'visual' | 'fused';
  notFound?: boolean;
  isExternal?: boolean;
  errorMessage?: string;
}

export default function Scan() {
  const [scanning, setScanning] = useState(false);
  const [shelfScanMode, setShelfScanMode] = useState(false);
  const [aioScanMode, setAioScanMode] = useState(false); // All-in-One mode
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [scanResult, setScanResult] = useState<ScannedProduct | null>(null);
  const [productMatches, setProductMatches] = useState<ScannedProduct[]>([]);
  const [batchResults, setBatchResults] = useState<CountedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [embeddingLoaded, setEmbeddingLoaded] = useState(false);

  // Shelf Scanning State
  const [detectedObjects, setDetectedObjects] = useState<any[]>([]);
  const [shelfCounts, setShelfCounts] = useState<Map<string, { name: string; count: number; barcode?: string }>>(new Map());
  const [focusedProductId, setFocusedProductId] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showImageCapture, setShowImageCapture] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const demoImageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const codeReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const lastBarcodeRef = useRef<string | null>(null);
  const ocrWorkerRef = useRef<any>(null);
  const lastOcrTimeRef = useRef<number>(0);
  const countManagerRef = useRef<CountManager>(getCountManager());

  const { user } = useAuthStore();
  const currentStore = user?.store;

  // Pre-load embedding model
  useEffect(() => {
    loadEmbeddingModel()
      .then(() => setEmbeddingLoaded(true))
      .catch(err => console.error('Failed to load embedding model:', err));
  }, []);

  // Initialize OCR Worker
  useEffect(() => {
    async function initWorker() {
      try {
        const worker = await createWorker('eng');
        ocrWorkerRef.current = worker;
      } catch (err) {
        console.error('Failed to initialize OCR worker:', err);
      }
    }
    initWorker();
    return () => {
      if (ocrWorkerRef.current) {
        ocrWorkerRef.current.terminate();
      }
    };
  }, []);

  // Start scanning
  const startScanning = useCallback(async (demo = false, mode: 'barcode' | 'shelf' | 'aio' = 'barcode') => {
    // Prevent multiple camera streams
    if (scanning && !demo) return;

    setIsDemoMode(demo);
    setAioScanMode(mode === 'aio');
    setShelfScanMode(mode === 'shelf' || mode === 'aio');

    if (!demo) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Wait for video to be ready before scanning
          await new Promise<void>((resolve) => {
            if (videoRef.current!.readyState >= 2) {
              resolve();
            } else {
              videoRef.current!.onloadedmetadata = () => resolve();
            }
          });
          // Only play if not already playing
          if (videoRef.current.paused) {
            await videoRef.current.play().catch(() => {});
          }
        }
      } catch (err) {
        console.error('Failed to access camera:', err);
        alert('Camera access denied or NOT available. Ensure you are using HTTPS on mobile.');
        return;
      }
    }
    setScanning(true);

    // Barcode scanner runs in all modes (barcode only, shelf only, or AIO)
    if (!demo && (mode === 'barcode' || mode === 'aio')) {
      startBarcodeScanner();
    }
  }, []);

  // Start barcode scanner
  const startBarcodeScanner = async () => {
    if (!codeReaderRef.current) {
      const hints = new Map();
      const formats = [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.CODABAR,
        BarcodeFormat.ITF,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.PDF_417
      ];
      hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
      hints.set(DecodeHintType.TRY_HARDER, true);
      hints.set(DecodeHintType.ASSUME_GS1, true);

      codeReaderRef.current = new BrowserMultiFormatReader(hints);
    }

    try {
      codeReaderRef.current.decodeFromVideoElement(
        videoRef.current!,
        async (result: any, error: any) => {
          if (result) {
            const barcode = result.getText();
            console.log('Barcode detected:', barcode, 'Format:', result.barcodeFormat);

            if (barcode !== lastBarcodeRef.current) {
              lastBarcodeRef.current = barcode;
              await handleBarcodeDetected(barcode);
              flashCanvas('#10B981');

              setTimeout(() => {
                lastBarcodeRef.current = null;
              }, 3000);
            }
          } else if (error && error.name !== 'NotFoundException' && error.name !== 'NotFoundExceptionornament') {
            console.warn('Barcode scan error:', error.message);
          }
          // No barcode found - only run OCR in shelf/aio modes (not barcode-only mode)
          // Throttle OCR to avoid excessive API calls
          if (!result && (shelfScanMode || aioScanMode)) {
            checkAndRunOCR();
          }
        }
      );
    } catch (err) {
      console.error('Failed to start barcode scanner:', err);
    }
  };

  // Canvas flash effect
  const flashCanvas = (color: string) => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        setTimeout(() => {
          ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
          ctx.globalAlpha = 1.0;
        }, 150);
      }
    }
  };

  // OCR check
  const checkAndRunOCR = async () => {
    const now = Date.now();
    if (now - lastOcrTimeRef.current < 4000) return;
    // Run OCR in shelf and AIO modes (not in barcode-only mode)
    if (!scanning || ocrLoading || !videoRef.current || !ocrWorkerRef.current) return;

    lastOcrTimeRef.current = now;
    await runOCR();
  };

  // Run OCR
  const runOCR = async () => {
    if (!videoRef.current || !ocrWorkerRef.current) return;

    setOcrLoading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(videoRef.current, 0, 0);

      const { data } = await ocrWorkerRef.current.recognize(canvas);
      const text = data.text;

      if (text && text.trim().length > 3) {
        const cleanedText = text.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanedText.length > 3) {
          const ocrResult: OCRResult = {
            rawText: cleanedText,
            words: cleanedText.split(' '),
            possibleBrand: extractBrand(cleanedText),
            possibleProductName: cleanedText,
            confidence: data.confidence
          };
          await handleOcrResult(ocrResult, videoRef.current);
        }
      }
    } catch (err) {
      console.error('OCR error:', err);
    } finally {
      setOcrLoading(false);
    }
  };

  // Simple brand extraction
  const extractBrand = (text: string): string | null => {
    const brands = [
      'coca-cola', 'pepsi', 'nestle', 'cadbury', 'oreo', 'lays', 'doritos',
      'kellogg', 'hershey', 'mars', 'kraft', 'unilever', 'dove', 'red bull',
      'monster', 'starbucks', 'heinz', 'campbell', ' Quaker', 'capn crunch'
    ];
    const lower = text.toLowerCase();
    for (const brand of brands) {
      if (lower.includes(brand)) {
        return brand.charAt(0).toUpperCase() + brand.slice(1);
      }
    }
    return null;
  };

  // Handle OCR result with multi-modal matching
  const handleOcrResult = async (ocrResult: OCRResult, _video: HTMLVideoElement) => {
    try {
      // Try to match via API
      const response = await api.get(`/products?search=${encodeURIComponent(ocrResult.rawText)}`);
      if (response.data.products && response.data.products.length > 0) {
        const matches = response.data.products.map((p: any) => ({
          ...p,
          price: p.retailPrice,
          image: p.images?.[0]?.url
        }));
        setProductMatches(matches);
        flashCanvas('#3B82F6');
      }
    } catch (err) {
      console.error('OCR Search error:', err);
    }
  };

  // Handle barcode detection
  const handleBarcodeDetected = async (barcode: string) => {
    setLoading(true);
    setScanResult(null);

    try {
      const response = await api.post('/inventory/scan', {
        barcode,
        storeId: currentStore?.id || undefined
      });

      const { product } = response.data;

      if (!product) {
        flashCanvas('#EF4444');
        setScanResult({
          id: 'not-found',
          name: `Barcode: ${barcode}`,
          sku: barcode,
          price: 0,
          isExternal: true,
          notFound: true
        });
        return;
      }

      // Register the product for visual re-identification
      const productData = product.isExternal
        ? { ...product, price: product.retailPrice || 0, sku: barcode, image: product.imageUrl }
        : { ...product, price: product.retailPrice || 0, sku: product.sku || barcode, image: product.images?.[0]?.url };

      setScanResult(productData);

      // Capture snapshot if no product image exists
      if (!product.imageUrl && !product.images?.[0]?.url && videoRef.current) {
        captureProductSnapshot(product.id, barcode);
      }

      // Add to accumulated product matches list
      setProductMatches(prev => {
        // Check if this barcode already exists in the list
        const exists = prev.some(p => p.barcode === barcode);
        if (exists) {
          return prev; // Don't duplicate
        }
        return [...prev, { ...productData, scannedAt: new Date().toISOString() }];
      });

      // Register in fingerprint system for future visual matching
      if (videoRef.current) {
        try {
          await registerIdentifiedProduct(
            product.id,
            barcode,
            product.name,
            videoRef.current,
            [0, 0, videoRef.current.videoWidth, videoRef.current.videoHeight]
          );
        } catch (err) {
          console.error('Failed to register product fingerprint:', err);
        }
      }

      // Play success sound
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJOqk4F2d4yftJyGeXeMpLKcgHN3i6G0nIB1eI6kt5x/dHiLo7edf3V5jKO3nX91eYyktpx/dXmMpLadf3V5jKS2nX91eYyktZx/dXmMpLWcf3V5jKS1nH91eYyktZx/dXmMpLWcf3V5jKS1nA==');
        audio.volume = 0.3;
        audio.play().catch(() => {});
      } catch { }

    } catch (err: any) {
      console.error('Scan lookup error:', err);
      flashCanvas('#EF4444');

      setScanResult({
        id: 'error',
        name: `Scanned: ${barcode}`,
        sku: barcode,
        price: 0,
        isExternal: true,
        notFound: true,
        errorMessage: err.response?.data?.message || err.message || 'Unknown error'
      });
    } finally {
      setLoading(false);
    }
  };

  // Capture a snapshot of the product from video and upload
  const captureProductSnapshot = async (productId: string, barcode: string) => {
    if (!videoRef.current) return;

    try {
      // Create a canvas to capture the current frame
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(videoRef.current, 0, 0);
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);

      // Upload to server
      await api.post('/products/image', {
        productId,
        barcode,
        image: imageDataUrl.split(',')[1] // Send base64 without prefix
      });

      console.log('Product snapshot captured and uploaded');
    } catch (err) {
      console.error('Failed to capture product snapshot:', err);
    }
  };

  // Stop scanning
  const stopScanning = () => {
    setScanning(false);
    setShelfScanMode(false);
    setAioScanMode(false);
    setDetectedObjects([]);
    setShelfCounts(new Map());
    setFocusedProductId(null);

    if (codeReaderRef.current) {
      try {
        codeReaderRef.current.reset();
      } catch {
        // Ignore reset errors
      }
    }

    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    resetTracker();
    resetCountManager();

    const context = canvasRef.current?.getContext('2d');
    context?.clearRect(0, 0, canvasRef.current?.width || 0, canvasRef.current?.height || 0);
  };

  // Start shelf scan mode
  const startShelfScan = (demo = false) => {
    resetCountManager();
    startScanning(demo, 'shelf');
  };

  // Start AIO (All-in-One) scan mode - combines barcode + shelf detection
  const startAioScan = (demo = false) => {
    resetCountManager();
    startScanning(demo, 'aio');
  };

  // Run shelf detection loop
  const runShelfDetection = async () => {
    if (!scanning || (!shelfScanMode && !aioScanMode)) return;

    const source = isDemoMode ? demoImageRef.current : videoRef.current;
    if (!source) {
      animationRef.current = requestAnimationFrame(runShelfDetection);
      return;
    }

    // Check if video has valid dimensions before processing
    const hasValidDimensions = 'videoWidth' in source
      ? source.videoWidth > 0 && source.videoHeight > 0
      : 'naturalWidth' in source
        ? source.naturalWidth > 0 && source.naturalHeight > 0
        : true;

    if (!hasValidDimensions) {
      animationRef.current = requestAnimationFrame(runShelfDetection);
      return;
    }

    try {
      const results = await detectProductsMultiModal(source, {
        barcode: aioScanMode ? (lastBarcodeRef.current || undefined) : undefined
      });

      setDetectedObjects(results.detectedObjects);

      // Update shelf counts from CountedItems
      const countedItems = countManagerRef.current.getCountedItems();
      const countsMap = new Map<string, { name: string; count: number; barcode?: string }>();
      for (const item of countedItems) {
        countsMap.set(item.productId, { name: item.name, count: item.count, barcode: item.barcode });
      }
      setShelfCounts(countsMap);

      // Update batch results for display
      setBatchResults(countedItems);

      // Draw bounding boxes with product info
      if (canvasRef.current) {
        drawBoundingBoxes(results.detectedObjects, source);
      }
    } catch (err) {
      console.error('Detection error:', err);
    }

    animationRef.current = requestAnimationFrame(runShelfDetection);
  };

  // Handle canvas click to select/focus on a product
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    const sourceWidth = videoRef.current?.videoWidth || demoImageRef.current?.naturalWidth || 1;
    const sourceHeight = videoRef.current?.videoHeight || demoImageRef.current?.naturalHeight || 1;
    const scaleX = displayWidth / sourceWidth;
    const scaleY = displayHeight / sourceHeight;

    // Find clicked object
    for (const obj of detectedObjects) {
      if (!obj.productMatch) continue;
      const [x, y, width, height] = obj.bbox;
      const boxX = x * scaleX;
      const boxY = y * scaleY;
      const boxW = width * scaleX;
      const boxH = height * scaleY;

      if (clickX >= boxX && clickX <= boxX + boxW && clickY >= boxY && clickY <= boxY + boxH) {
        // Toggle focus: if already focused, unfocus; otherwise focus on this product
        if (focusedProductId === obj.productMatch.productId) {
          setFocusedProductId(null);
        } else {
          setFocusedProductId(obj.productMatch.productId);
        }
        return;
      }
    }

    // Clicked on empty space - clear focus
    setFocusedProductId(null);
  };

  // Draw bounding boxes
  const drawBoundingBoxes = (objects: any[], source: HTMLVideoElement | HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    const sourceWidth = 'videoWidth' in source ? source.videoWidth : source.naturalWidth;
    const sourceHeight = 'videoHeight' in source ? source.videoHeight : source.naturalHeight;
    const scaleX = displayWidth / sourceWidth;
    const scaleY = displayHeight / sourceHeight;

    for (const obj of objects) {
      const [x, y, width, height] = obj.bbox;
      const isMatched = !!obj.productMatch;
      const isFocused = focusedProductId && obj.productMatch?.productId === focusedProductId;
      const isDimmed = focusedProductId && !isFocused;

      // Dim non-focused products when filtering is active
      const alpha = isDimmed ? 0.3 : 1;
      const lineWidth = isFocused ? 4 : 2;

      // Box color based on match status and focus
      if (isFocused) {
        ctx.strokeStyle = '#3B82F6'; // Blue for focused
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      } else if (isMatched) {
        ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
        ctx.fillStyle = isDimmed ? 'rgba(0, 0, 0, 0.1)' : 'rgba(16, 185, 129, 0.1)';
      } else {
        ctx.strokeStyle = `rgba(245, 158, 11, ${alpha})`;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      }

      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x * scaleX, y * scaleY, width * scaleX, height * scaleY);

      // Fill for product matches
      if (isMatched) {
        ctx.fillRect(x * scaleX, y * scaleY, width * scaleX, height * scaleY);
      }

      // Product name label above the box
      if (isMatched && obj.productMatch?.name) {
        const label = isFocused
          ? `[ ${obj.productMatch.name} ]`
          : obj.productMatch.name;
        ctx.font = `${isFocused ? 'bold ' : ''}12px Outfit`;
        const textWidth = ctx.measureText(label).width;

        // Background for label
        ctx.fillStyle = isFocused ? 'rgba(59, 130, 246, 0.9)' : isDimmed ? 'rgba(100, 100, 100, 0.7)' : 'rgba(0, 0, 0, 0.7)';
        const labelX = x * scaleX;
        const labelY = y * scaleY - 10;
        ctx.fillRect(labelX, labelY - 14, textWidth + 12, 18);

        // Label text
        ctx.fillStyle = isFocused || !isDimmed ? 'white' : '#aaa';
        ctx.fillText(label, labelX + 6, labelY);
      }

      // Confidence label (below box)
      ctx.fillStyle = isMatched ? `rgba(16, 185, 129, ${alpha})` : `rgba(245, 158, 11, ${alpha})`;
      ctx.font = `${isFocused ? 'bold ' : ''}10px Outfit`;
      const confLabel = isMatched
        ? `${Math.round(obj.productMatch.confidence * 100)}%`
        : `${obj.class} ${Math.round(obj.score * 100)}%`;
      const confWidth = ctx.measureText(confLabel).width;
      ctx.fillStyle = isFocused ? 'rgba(59, 130, 246, 0.8)' : 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(x * scaleX, (y + height) * scaleY + 2, confWidth + 8, 14);
      ctx.fillStyle = isDimmed ? '#aaa' : 'white';
      ctx.fillText(confLabel, x * scaleX + 4, (y + height) * scaleY + 13);
    }

    // Draw count summary overlay
    if (shelfCounts.size > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, 10, 200, 20 + shelfCounts.size * 24);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px Outfit';
      ctx.fillText('Product Counts:', 20, 30);

      let yOffset = 50;
      for (const [_, item] of shelfCounts) {
        ctx.fillStyle = '#10B981';
        ctx.fillText(`${item.name}: ${item.count}`, 20, yOffset);
        yOffset += 22;
      }
    }
  };

  // Run detection loop when shelf mode is active
  useEffect(() => {
    if (scanning && (shelfScanMode || aioScanMode)) {
      runShelfDetection();
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [scanning, shelfScanMode, aioScanMode]);

  // Get tracker stats for display
  const [trackerStats, setTrackerStats] = useState({ trackedCount: 0, matchedCount: 0, matchRate: 0 });
  useEffect(() => {
    if (scanning && (shelfScanMode || aioScanMode)) {
      const interval = setInterval(() => {
        const stats = getTrackerStats();
        setTrackerStats(stats);
      }, 500);
      return () => clearInterval(interval);
    }
  }, [scanning, shelfScanMode, aioScanMode]);

  return (
    <div className="max-w-6xl mx-auto animate-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Scanner</h1>

        {scanning && (
          <button
            onClick={stopScanning}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-all shadow-md"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            Stop
          </button>
        )}
      </div>

      {/* Embedding model status */}
      {!embeddingLoaded && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Loading AI model... Visual recognition will be available shortly.
          </p>
        </div>
      )}

      {/* Full-width scanner */}
      <div className="relative bg-slate-900 rounded-2xl overflow-hidden shadow-2xl" style={{ maxHeight: '70vh' }}>
        <ScannerView
          ref={videoRef}
          scanning={scanning}
          shelfScanMode={shelfScanMode || aioScanMode}
          continuousMode={shelfScanMode || aioScanMode}
          detectedObjectsCount={detectedObjects.length}
          onStartSingle={() => startScanning(false)}
          isDemoMode={isDemoMode}
          demoImageRef={demoImageRef}
          canvasRef={canvasRef}
          onCanvasClick={handleCanvasClick}
        />

        {!scanning && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm">
            <div className="text-center">
              <div className="w-20 h-20 bg-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
                <svg width="40" height="40" className="text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">AI Inventory Scanner</h2>
              <p className="text-slate-400 text-sm mb-6">Select a mode below to start</p>
            </div>
          </div>
        )}
      </div>

      {/* Compact mode buttons */}
      <div className="flex flex-wrap justify-center gap-3 mt-4">
        <button
          onClick={() => startAioScan(false)}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          AI Scanner
        </button>
        <button
          onClick={() => startScanning(false, 'barcode')}
          className="flex items-center gap-2 px-6 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-bold rounded-xl transition-all"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
          </svg>
          Barcode
        </button>
        <button
          onClick={() => startShelfScan(false)}
          className="flex items-center gap-2 px-6 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-white font-bold rounded-xl transition-all"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611l-2.278.565a9.04 9.04 0 01-2.891 0l-2.278-.565c-1.717-.293-2.3-2.379-1.067-3.611L5 14.5" />
          </svg>
          Shelf Count
        </button>
        <button
          onClick={() => startAioScan(true)}
          className="px-6 py-3 text-sm font-bold text-slate-400 hover:text-emerald-600 transition-colors"
        >
          Demo
        </button>
      </div>

      {/* Analysis Results */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold">Results</h3>
          {embeddingLoaded && scanning && (
            <span className="badge badge-success animate-pulse">AI Active</span>
          )}
        </div>

        <ScanResults
          scanResult={scanResult}
          productMatches={productMatches}
          batchResults={batchResults}
          shelfCounts={shelfCounts}
          onSelectProduct={(p) => setScanResult(p)}
          onClear={() => {
            setScanResult(null);
            setBatchResults([]);
            setProductMatches([]);
            setFocusedProductId(null);
          }}
          onCommitBatch={async () => {
            for (const item of batchResults) {
              try {
                await api.post('/inventory/count', {
                  productId: item.productId,
                  count: item.count,
                  storeId: currentStore?.id
                });
              } catch (err) {
                console.error('Failed to commit count:', err);
              }
            }
            setBatchResults([]);
          }}
          onAdjustCount={(productId, newCount) => {
            countManagerRef.current.adjustCount(productId, newCount);
            const countedItems = countManagerRef.current.getCountedItems();
            setBatchResults(countedItems);
            const countsMap = new Map<string, { name: string; count: number; barcode?: string }>();
            for (const item of countedItems) {
              countsMap.set(item.productId, { name: item.name, count: item.count, barcode: item.barcode });
            }
            setShelfCounts(countsMap);
          }}
          loading={loading}
        />

        {!scanResult && batchResults.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400">
            <p>Point camera at a product to start scanning</p>
          </div>
        )}
      </div>
    </div>
  );
}
