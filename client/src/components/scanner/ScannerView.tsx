import { forwardRef } from 'react';

interface ScannerViewProps {
  scanning: boolean;
  shelfScanMode: boolean;
  continuousMode: boolean;
  detectedObjectsCount: number;
  onStartSingle: () => void;
  isDemoMode?: boolean;
  demoImageRef?: React.RefObject<HTMLImageElement>;
  canvasRef?: React.RefObject<HTMLCanvasElement>;
  onCanvasClick?: (event: React.MouseEvent<HTMLCanvasElement>) => void;
}

export const ScannerView = forwardRef<HTMLVideoElement, ScannerViewProps>(
  ({ scanning, shelfScanMode, continuousMode, detectedObjectsCount, onStartSingle, isDemoMode, demoImageRef, canvasRef, onCanvasClick }, ref) => {
    return (
      <div className="relative bg-slate-900 overflow-hidden rounded-2xl" style={{ height: '60vh' }}>
        {isDemoMode ? (
          <img
            ref={demoImageRef}
            src="/demo_shelf.png"
            alt="Demo Shelf"
            className="w-full h-full object-contain"
          />
        ) : (
          <video
            ref={ref}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
        )}

        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full z-20 cursor-pointer"
          style={{ pointerEvents: 'auto' }}
          onClick={onCanvasClick}
        />

        {/* Object count badge for shelf mode */}
        {shelfScanMode && scanning && detectedObjectsCount > 0 && (
          <div className="absolute top-4 left-4 z-30">
            <div className="bg-slate-900/70 backdrop-blur text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg">
              {detectedObjectsCount} objects
            </div>
          </div>
        )}

        {/* Dim overlay when not scanning - handled by parent */}
        {!scanning && (
          <div className="absolute inset-0 bg-slate-900/50" />
        )}
      </div>
    );
  }
);

ScannerView.displayName = 'ScannerView';
