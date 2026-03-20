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
  loading?: boolean;
}

export const ScanResults: React.FC<ScanResultsProps> = ({
  scannedItems,
  continuousMode,
  onClear,
  onAddAll,
  loading = false,
}) => {
  // Only render in continuous/batch mode with items
  if (!continuousMode || scannedItems.length === 0) return null;

  const totalUnits = scannedItems.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="premium-card overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-sky-500/10 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
            Batch Queue
          </p>
          <p className="font-black text-slate-900 dark:text-white mt-0.5">
            {scannedItems.length} product{scannedItems.length !== 1 ? 's' : ''} &middot;{' '}
            <span className="text-emerald-500">{totalUnits} units</span>
          </p>
        </div>
        <button
          onClick={onClear}
          className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors"
        >
          Clear
        </button>
      </div>

      {/* Items list */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[300px] overflow-y-auto">
        {scannedItems.map((item) => {
          const primaryImage = item.product.images?.find((img) => img.isPrimary);
          return (
            <div
              key={item.product.id}
              className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
              {/* Thumbnail */}
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                {primaryImage ? (
                  <img src={primaryImage.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-black text-slate-400">
                    {item.product.name.charAt(0)}
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="font-black text-slate-900 dark:text-white text-sm truncate">
                  {item.product.name}
                </p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  {item.product.sku} &middot; ${parseFloat(item.product.retailPrice).toFixed(2)}
                </p>
              </div>

              {/* Count badge */}
              <div className="shrink-0 w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {item.count}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer — Add All button */}
      <div className="p-4 bg-slate-50 dark:bg-slate-800/50">
        <button
          onClick={onAddAll}
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white py-4 rounded-2xl font-black uppercase tracking-[0.2em] text-sm shadow-xl shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Adding...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add All to Inventory
            </>
          )}
        </button>
      </div>
    </div>
  );
};
