import { useState, useRef, useCallback, useEffect } from 'react';
import api from '../../services/api';

export interface IdentifiedProduct {
  brand: string | null;
  name: string | null;
  variant: string | null;
  category: string | null;
  confidence: number;
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

interface LensScannerProps {
  onProductFound: (product: ProductMatch) => void;
  onNoMatch: (identified: IdentifiedProduct) => void;
}

export function LensScanner({ onProductFound, onNoMatch }: LensScannerProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [identified, setIdentified] = useState<IdentifiedProduct | null>(null);
  const [matches, setMatches] = useState<ProductMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
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
    return () => stopCamera();
  }, [stopCamera]);

  const capture = useCallback(async () => {
    if (!videoRef.current || identifying) return;

    // Flash effect
    setFlash(true);
    setTimeout(() => setFlash(false), 150);

    setIdentifying(true);
    setIdentified(null);
    setMatches([]);
    setError(null);

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    setCapturedImage(dataUrl);
    stopCamera();

    const base64 = dataUrl.split(',')[1];

    try {
      const response = await api.post('/scan/identify', {
        image: base64,
        mimeType: 'image/jpeg',
      });

      const { identified: id, matches: m } = response.data;
      setIdentified(id);
      setMatches(m);

      if (m.length === 1) {
        onProductFound(m[0]);
      }
    } catch {
      setError('Could not identify product. Check your connection and try again.');
    } finally {
      setIdentifying(false);
    }
  }, [identifying, stopCamera, onProductFound]);

  const reset = () => {
    setCapturedImage(null);
    setIdentified(null);
    setMatches([]);
    setError(null);
    startCamera();
  };

  const confidenceColor = (c: number) =>
    c > 0.7
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
      : c > 0.4
      ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
      : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';

  return (
    <div className="space-y-4">
      {/* Viewfinder */}
      <div className="relative rounded-3xl overflow-hidden bg-slate-950 aspect-[4/3] shadow-2xl">
        {/* Flash overlay */}
        {flash && <div className="absolute inset-0 bg-white z-50 pointer-events-none" />}

        {capturedImage ? (
          <img src={capturedImage} className="w-full h-full object-cover" alt="Captured frame" />
        ) : (
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        )}

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

        {/* Identifying overlay */}
        {identifying && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-10">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-indigo-500/30 rounded-full" />
              <div className="absolute inset-0 w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white animate-pulse">
              Identifying Product...
            </p>
          </div>
        )}

        {/* Inactive state */}
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
          Try Again
        </button>
      )}

      {/* Results */}
      {identified && !identifying && (
        <div className="premium-card p-6 space-y-5 animate-fade-in">
          {/* AI result header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                AI Identified
              </p>
              <h3 className="text-xl font-black text-slate-900 dark:text-white leading-tight">
                {[identified.brand, identified.name].filter(Boolean).join(' ') || 'Unknown Product'}
              </h3>
              {identified.variant && (
                <p className="text-sm font-medium text-slate-500 mt-0.5">{identified.variant}</p>
              )}
              {identified.category && (
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">
                  {identified.category.replace('_', ' ')}
                </p>
              )}
            </div>
            <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider shrink-0 ${confidenceColor(identified.confidence)}`}>
              {Math.round(identified.confidence * 100)}% match
            </div>
          </div>

          {/* Database matches */}
          {matches.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {matches.length} product{matches.length > 1 ? 's' : ''} found in inventory
              </p>
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => onProductFound(m)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 transition-all text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-900 dark:text-white text-sm truncate">{m.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{m.sku} · ${parseFloat(m.retailPrice).toFixed(2)}</p>
                  </div>
                  <svg className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50">
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
                Not in inventory
              </p>
              <p className="text-sm text-amber-600 dark:text-amber-300 font-medium">
                This product wasn't found in your database.
              </p>
              <button
                onClick={() => onNoMatch(identified)}
                className="mt-3 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-400 hover:underline"
              >
                Register as new product →
              </button>
            </div>
          )}
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
