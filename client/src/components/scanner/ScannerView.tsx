import { forwardRef } from 'react';

interface ScannerViewProps {
  scanning: boolean;
  shelfScanMode: boolean;
  continuousMode: boolean;
  detectedObjectsCount: number;
  onStartSingle: () => void;
}

export const ScannerView = forwardRef<HTMLVideoElement, ScannerViewProps>(
  ({ scanning, shelfScanMode, continuousMode, detectedObjectsCount, onStartSingle }, ref) => {
    return (
      <div className="premium-card overflow-hidden mb-6 group relative">
        <div className="relative aspect-square max-h-[400px] bg-slate-900 shadow-2xl overflow-hidden rounded-3xl">
          <video 
            ref={ref} 
            className="w-full h-full object-cover opacity-90 transition-opacity duration-700"
            style={{ opacity: scanning ? 1 : 0.4 }}
            playsInline
            muted
          />
          {/* We'll pass the canvas ref separately or handle it here if needed */}
          <canvas 
            id="scanner-canvas"
            className="absolute inset-0 w-full h-full pointer-events-none z-20"
          />
          
          {/* Scanning laser animation */}
          {scanning && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-sky-400 shadow-[0_0_20px_#38bdf8] animate-[scanLaser_3s_ease-in-out_infinite]" />
            </div>
          )}
          
          {/* Scanning frame overlay */}
          {scanning && !shelfScanMode && (
            <div className="absolute inset-0 flex items-center justify-center p-10 z-10">
              <div className="w-full h-56 border-2 border-white/10 rounded-[2.5rem] relative backdrop-blur-[1px]">
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-sky-400 rounded-tl-2xl shadow-[-5px_-5px_15px_rgba(56,189,248,0.3)]" />
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-sky-400 rounded-tr-2xl shadow-[5px_-5px_15px_rgba(56,189,248,0.3)]" />
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-sky-400 rounded-bl-2xl shadow-[-5px_5px_15px_rgba(56,189,248,0.3)]" />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-sky-400 rounded-br-2xl shadow-[5px_5px_15px_rgba(56,189,248,0.3)]" />
                
                {/* Status Badge */}
                <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-full shadow-2xl">
                  <span className="text-[9px] font-black text-white uppercase tracking-[0.25em] animate-pulse">
                    {continuousMode ? 'Multi-Stream Active' : 'Align Barcode'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {shelfScanMode && (
            <div className="absolute top-8 left-8 right-8 flex flex-col items-center gap-3 z-30">
              <div className="bg-slate-900/90 backdrop-blur-2xl text-white px-6 py-3 rounded-2xl text-[10px] font-black shadow-2xl flex items-center gap-4 border border-white/10">
                <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping shadow-[0_0_10px_#ef4444]" />
                <span className="tracking-[0.2em] uppercase">Shelf Intelligence Engaged</span>
              </div>
              {detectedObjectsCount > 0 && (
                <div className="bg-sky-500 text-white px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-sky-500/40 animate-bounce">
                  {detectedObjectsCount} Objects Identified
                </div>
              )}
            </div>
          )}
          
          {!scanning && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm transition-all duration-700">
              <div className="text-center px-8">
                <div className="w-20 h-20 bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 flex items-center justify-center mx-auto mb-8 shadow-2xl group-hover:scale-110 transition-transform duration-500 rotate-3">
                  <svg className="w-10 h-10 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                </div>
                <h3 className="text-white font-black text-xl mb-2 tracking-tight">Camera Inactive</h3>
                <p className="text-slate-400 text-sm mb-10 font-medium">Ready for real-time stock processing</p>
                <button
                  onClick={onStartSingle}
                  className="btn-premium px-12 py-5 text-base shadow-[0_0_30px_rgba(56,189,248,0.3)] hover:shadow-[0_0_50px_rgba(56,189,248,0.5)] transform hover:-translate-y-1 active:translate-y-0 transition-all duration-300"
                >
                  INITIALIZE SCANNER
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
);

ScannerView.displayName = 'ScannerView';
