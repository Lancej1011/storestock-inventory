import { useState, useRef, useCallback, useEffect } from 'react';
import { loadDetectionModel, detectProducts, DetectedObject } from '../../utils/shelfScanner';
import api from '../../services/api';

interface IdentifiedClass {
  cocoClass: string;
  label: string;
  brand: string | null;
  variant: string | null;
}

interface ShelfCountResult {
  label: string;
  count: number;
  cocoClass: string;
}

interface ShelfCounterProps {
  onCountConfirmed: (results: ShelfCountResult[]) => void;
}

export function ShelfCounter({ onCountConfirmed }: ShelfCounterProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [detectedObjects, setDetectedObjects] = useState<DetectedObject[]>([]);
  const [identifiedClass, setIdentifiedClass] = useState<IdentifiedClass | null>(null);
  const [identifyingId, setIdentifyingId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ShelfCountResult[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionLoopRef = useRef<number | null>(null);
  const isRunning = useRef(false);

  const stopCamera = useCallback(() => {
    isRunning.current = false;
    if (detectionLoopRef.current) {
      clearTimeout(detectionLoopRef.current);
      detectionLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setDetectedObjects([]);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const drawBoxes = useCallback(
    (objects: DetectedObject[], video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const scaleX = canvas.width / (video.videoWidth || 1);
      const scaleY = canvas.height / (video.videoHeight || 1);

      objects.forEach((obj) => {
        const [x, y, w, h] = obj.bbox;
        const sx = x * scaleX;
        const sy = y * scaleY;
        const sw = w * scaleX;
        const sh = h * scaleY;

        const isTracked = identifiedClass && obj.class === identifiedClass.cocoClass;
        const color = isTracked ? '#22c55e' : '#38bdf8';

        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(sx, sy, sw, sh);

        // Label background
        const label = isTracked ? identifiedClass!.label : obj.class;
        ctx.font = 'bold 11px sans-serif';
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = color + 'dd';
        ctx.fillRect(sx, sy > 18 ? sy - 18 : sy, textWidth + 10, 18);
        ctx.fillStyle = '#fff';
        ctx.fillText(label, sx + 5, sy > 18 ? sy - 4 : sy + 14);
      });
    },
    [identifiedClass]
  );

  const runDetection = useCallback(async () => {
    if (!isRunning.current || !videoRef.current || !canvasRef.current) return;

    try {
      const objects = await detectProducts(videoRef.current);
      setDetectedObjects(objects);
      drawBoxes(objects, videoRef.current, canvasRef.current);

      // Update count for the currently tracked class
      if (identifiedClass) {
        const visibleCount = objects.filter((o) => o.class === identifiedClass.cocoClass).length;
        if (visibleCount > 0) {
          setCounts((prev) => {
            const existing = prev.get(identifiedClass.label) ?? 0;
            const updated = new Map(prev);
            // Only increase — don't drop count when objects temporarily leave frame
            updated.set(identifiedClass.label, Math.max(existing, visibleCount));
            return updated;
          });
        }
      }
    } catch {
      // silent — detection errors are transient
    }

    if (isRunning.current) {
      detectionLoopRef.current = window.setTimeout(runDetection, 200);
    }
  }, [drawBoxes, identifiedClass]);

  // Restart detection loop when identifiedClass changes so drawBoxes gets fresh closure
  useEffect(() => {
    if (!cameraActive) return;
    if (detectionLoopRef.current) clearTimeout(detectionLoopRef.current);
    if (isRunning.current) {
      detectionLoopRef.current = window.setTimeout(runDetection, 200);
    }
  }, [identifiedClass, cameraActive, runDetection]);

  const startCamera = async () => {
    setError(null);
    setModelLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      await loadDetectionModel();
      setCameraActive(true);
      isRunning.current = true;
      detectionLoopRef.current = window.setTimeout(runDetection, 200);
    } catch {
      setError('Failed to start camera or load detection model.');
    } finally {
      setModelLoading(false);
    }
  };

  const handleCanvasTap = useCallback(
    async (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !videoRef.current || identifyingId) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const tapX = e.clientX - rect.left;
      const tapY = e.clientY - rect.top;

      const scaleX = (videoRef.current.videoWidth || 1) / canvasRef.current.width;
      const scaleY = (videoRef.current.videoHeight || 1) / canvasRef.current.height;

      // Find which bounding box was tapped
      const hit = detectedObjects.find((obj) => {
        const [x, y, w, h] = obj.bbox;
        const sx = x / scaleX;
        const sy = y / scaleY;
        const sw = w / scaleX;
        const sh = h / scaleY;
        return tapX >= sx && tapX <= sx + sw && tapY >= sy && tapY <= sy + sh;
      });

      if (!hit) return;
      setIdentifyingId(hit.id);

      // Crop the hit region from the video
      const cropCanvas = document.createElement('canvas');
      const [cx, cy, cw, ch] = hit.bbox;
      cropCanvas.width = Math.round(cw);
      cropCanvas.height = Math.round(ch);
      const ctx = cropCanvas.getContext('2d')!;
      ctx.drawImage(videoRef.current, cx, cy, cw, ch, 0, 0, cw, ch);

      const base64 = cropCanvas.toDataURL('image/jpeg', 0.85).split(',')[1];

      try {
        const response = await api.post('/scan/identify', {
          image: base64,
          mimeType: 'image/jpeg',
        });
        const { identified } = response.data;
        if (identified && identified.confidence > 0.2) {
          const label = [identified.brand, identified.name, identified.variant]
            .filter(Boolean)
            .join(' ') || hit.class;

          setIdentifiedClass({
            cocoClass: hit.class,
            label,
            brand: identified.brand,
            variant: identified.variant,
          });

          // Seed initial count
          setCounts((prev) => {
            const updated = new Map(prev);
            if (!updated.has(label)) updated.set(label, 0);
            return updated;
          });
        }
      } catch {
        setError('Could not identify that product. Try tapping it again.');
      } finally {
        setIdentifyingId(null);
      }
    },
    [detectedObjects, identifyingId]
  );

  const resetTracking = () => {
    setIdentifiedClass(null);
  };

  const finalize = () => {
    const built: ShelfCountResult[] = [];
    counts.forEach((count, label) => {
      built.push({ label, count, cocoClass: identifiedClass?.cocoClass ?? '' });
    });
    setResults(built);
    stopCamera();
    onCountConfirmed(built);
  };

  const trackedCount = identifiedClass ? (counts.get(identifiedClass.label) ?? 0) : 0;

  return (
    <div className="space-y-4">
      {/* Viewfinder */}
      <div className="relative rounded-3xl overflow-hidden bg-slate-950 aspect-[4/3] shadow-2xl">
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />

        {/* Clickable canvas overlay */}
        <canvas
          ref={canvasRef}
          onClick={handleCanvasTap}
          className="absolute inset-0 w-full h-full z-10"
          style={{ cursor: cameraActive ? 'crosshair' : 'default' }}
        />

        {/* Status badges */}
        {cameraActive && (
          <div className="absolute top-4 left-4 right-4 flex flex-col items-center gap-2 z-20 pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur-xl text-white px-5 py-2.5 rounded-2xl text-[10px] font-black flex items-center gap-3 border border-white/10 shadow-xl">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
              <span className="tracking-[0.2em] uppercase">Shelf Counter Active</span>
            </div>

            {identifiedClass && (
              <div className="bg-emerald-500 text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-500/40 flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Tracking: {identifiedClass.label} · Count: {trackedCount}
              </div>
            )}

            {!identifiedClass && detectedObjects.length > 0 && (
              <div className="bg-sky-500 text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-sky-500/40">
                {detectedObjects.length} object{detectedObjects.length !== 1 ? 's' : ''} detected — tap one to identify
              </div>
            )}

            {identifyingId && (
              <div className="bg-indigo-600 text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl animate-pulse">
                Identifying...
              </div>
            )}
          </div>
        )}

        {/* Inactive state */}
        {!cameraActive && results.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm z-20">
            <div className="text-center px-8">
              <div className="w-20 h-20 bg-white/5 rounded-3xl border border-white/10 flex items-center justify-center mx-auto mb-6 shadow-2xl">
                <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </div>
              {modelLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/60 animate-pulse">Loading detection model...</p>
                </div>
              ) : (
                <button onClick={startCamera} className="btn-premium px-10 py-4 text-sm font-black uppercase tracking-widest">
                  Start Shelf Scan
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      {cameraActive && !identifiedClass && (
        <div className="premium-card p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">How to use</p>
          <ol className="space-y-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">
            <li className="flex items-start gap-2">
              <span className="text-[10px] font-black text-indigo-500 mt-0.5 w-4 shrink-0">1.</span>
              Point camera at a shelf section
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[10px] font-black text-indigo-500 mt-0.5 w-4 shrink-0">2.</span>
              Tap any detected box to identify that product
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[10px] font-black text-indigo-500 mt-0.5 w-4 shrink-0">3.</span>
              Pan across the shelf — counter tracks without double-counting
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[10px] font-black text-indigo-500 mt-0.5 w-4 shrink-0">4.</span>
              Confirm count when done
            </li>
          </ol>
        </div>
      )}

      {/* Active tracking controls */}
      {cameraActive && identifiedClass && (
        <div className="premium-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Currently Tracking</p>
              <p className="font-black text-slate-900 dark:text-white text-lg">{identifiedClass.label}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Count</p>
              <p className="text-4xl font-black text-emerald-500 tabular-nums">{trackedCount}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={resetTracking}
              className="flex-1 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:border-amber-400 hover:text-amber-500 transition-all"
            >
              Change Product
            </button>
            <button
              onClick={finalize}
              className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition-all"
            >
              Confirm Count
            </button>
          </div>
        </div>
      )}

      {/* Stop button */}
      {cameraActive && (
        <button
          onClick={stopCamera}
          className="w-full py-4 rounded-2xl border-2 border-red-200 dark:border-red-900/50 text-[10px] font-black uppercase tracking-[0.2em] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-[0.98] transition-all"
        >
          Stop Scanner
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50">
          <p className="text-sm font-bold text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
