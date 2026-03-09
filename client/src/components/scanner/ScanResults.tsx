import React from 'react';

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

interface ScanResultsProps {
  product: Product | null;
  scannedItems: ScannedItem[];
  continuousMode: boolean;
  onClear: () => void;
  onAddAll: () => void;
  loading: boolean;
  visualPredictions?: { className: string, probability: number }[];
  ocrResult?: { possibleBrand?: string | null, possibleProductName?: string | null, rawText: string } | null;
  smartSearchMode?: boolean;
}

export const ScanResults: React.FC<ScanResultsProps> = ({ 
  product, 
  scannedItems, 
  continuousMode, 
  onClear, 
  onAddAll,
  loading,
  visualPredictions = [],
  ocrResult = null,
  smartSearchMode = false
}) => {
  if (!product && scannedItems.length === 0 && visualPredictions.length === 0 && !ocrResult) return null;

  return (
    <div className="animate-fade-in-up mt-6">
      {continuousMode ? (
        <div className="premium-card overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              Batch Queue ({scannedItems.length})
            </h2>
            <button onClick={onClear} className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-tighter transition-colors">
              Reset Session
            </button>
          </div>
          <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-100">
            {scannedItems.map((item, idx) => (
              <div key={item.product.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-xs text-slate-500">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 tracking-tight">{item.product.name}</p>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">{item.product.sku}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-sky-100 text-sky-700 text-xs font-black rounded-lg">
                    {item.count} Units
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="p-5 bg-slate-50/50 border-t border-slate-100">
            <button
              onClick={onAddAll}
              disabled={loading || scannedItems.length === 0}
              className="btn-premium w-full py-4 text-xs font-black uppercase tracking-[0.2em] shadow-lg shadow-sky-500/20 disabled:opacity-50"
            >
              {loading ? 'PROCESSING BATCH...' : 'COMMIT BATCH TO INVENTORY'}
            </button>
          </div>
        </div>
      ) : product ? (
        <div className="premium-card p-6 border-l-4 border-sky-500 animate-fade-in">
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 bg-slate-100 rounded-3xl overflow-hidden shadow-inner flex-shrink-0 border border-slate-200/50">
              {product.images?.[0] ? (
                <img src={product.images[0].imageUrl} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-500 text-[8px] font-black uppercase tracking-widest rounded mb-2">
                Barcode: {product.barcode}
              </span>
              <h2 className="text-xl font-black text-slate-900 font-heading tracking-tight mb-1 truncate">{product.name}</h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-3">{product.sku}</p>
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Retail Price</span>
                  <span className="text-lg font-black text-slate-900 font-heading">${parseFloat(product.retailPrice).toFixed(2)}</span>
                </div>
                <div className="w-px h-8 bg-slate-100" />
                <div className="flex flex-col">
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Unit Cost</span>
                  <span className="text-sm font-bold text-slate-500 tracking-tight">${parseFloat(product.costPrice).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (visualPredictions.length > 0 || ocrResult) && !product && !continuousMode ? (
        <div className="space-y-4 mb-6 animate-fade-in">
          {visualPredictions.length > 0 && (
            <div className="premium-card p-5 border-l-4 border-purple-500">
              <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                Shape Intelligence {smartSearchMode && '(Combined)'}
              </h3>
              <div className="space-y-2">
                {visualPredictions.slice(0, 3).map((pred, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-700">{pred.className}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pred.probability * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{(pred.probability * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ocrResult && (
            <div className="premium-card p-5 border-l-4 border-orange-500">
              <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                Text Recognition {smartSearchMode && '(Combined)'}
              </h3>
              <div className="space-y-3">
                {ocrResult.possibleBrand && (
                  <div>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter block mb-0.5">Potential Brand</span>
                    <span className="text-sm font-bold text-slate-900">{ocrResult.possibleBrand}</span>
                  </div>
                )}
                {ocrResult.possibleProductName && (
                  <div>
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter block mb-0.5">Identified Text</span>
                    <span className="text-sm font-bold text-slate-900">{ocrResult.possibleProductName}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-50">
                  <span className="text-[8px] font-black text-slate-300 uppercase tracking-tighter block mb-1">Raw OCR Stream</span>
                  <p className="text-[10px] text-slate-400 font-medium italic truncate">{ocrResult.rawText}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
