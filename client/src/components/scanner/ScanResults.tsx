import React, { useState } from 'react';
import { CountedItem } from '../../utils/countManager';

interface Product {
  id: string;
  sku: string;
  name: string;
  brand?: string;
  price: number;
  category?: string;
  image?: string;
  count?: number;
  confidence?: number;
  matchType?: 'barcode' | 'ocr' | 'visual' | 'fused';
}

interface ScanResultsProps {
  scanResult: Product | null;
  productMatches: Product[];
  batchResults: CountedItem[];
  shelfCounts?: Map<string, { name: string; count: number; barcode?: string }>;
  onSelectProduct: (product: Product) => void;
  onClear: () => void;
  onCommitBatch: (batch: CountedItem[]) => Promise<void>;
  onAdjustCount?: (productId: string, newCount: number) => void;
  loading?: boolean;
}

export const ScanResults: React.FC<ScanResultsProps> = ({
  scanResult,
  productMatches,
  batchResults,
  shelfCounts = new Map(),
  onSelectProduct,
  onClear,
  onCommitBatch,
  onAdjustCount,
  loading: _loading = false
}) => {
  const [editingCount, setEditingCount] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [committing, setCommitting] = useState(false);

  if (!scanResult && productMatches.length === 0 && batchResults.length === 0) return null;

  const handleStartEdit = (productId: string, currentCount: number) => {
    setEditingCount(productId);
    setEditValue(currentCount.toString());
  };

  const handleSaveEdit = (productId: string) => {
    const newCount = parseInt(editValue, 10);
    if (!isNaN(newCount) && newCount >= 0 && onAdjustCount) {
      onAdjustCount(productId, newCount);
    }
    setEditingCount(null);
    setEditValue('');
  };

  const handleCommitBatch = async () => {
    setCommitting(true);
    try {
      await onCommitBatch(batchResults);
    } finally {
      setCommitting(false);
    }
  };

  // Calculate total items from shelf counts
  const totalShelfCount = Array.from(shelfCounts.values()).reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="space-y-6">
      {/* Active Scan Result */}
      {scanResult && (
        <div className={`p-4 rounded-xl animate-in ${
          (scanResult as any).notFound
            ? 'bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/20'
            : 'bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/20'
        }`}>
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-lg flex items-center justify-center font-bold border shadow-sm overflow-hidden ${
              (scanResult as any).notFound
                ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 border-amber-200 dark:border-amber-700'
                : 'bg-white dark:bg-slate-800 text-emerald-600 border-emerald-100 dark:border-slate-700'
            }`}>
              {scanResult.image ? (
                <img src={scanResult.image} alt="" className="w-full h-full object-cover" />
              ) : (scanResult as any).notFound ? (
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                </svg>
              ) : (
                scanResult.name.charAt(0)
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${
                (scanResult as any).notFound
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {(scanResult as any).notFound
                  ? 'Product Not Found'
                  : (scanResult as any).isExternal
                    ? 'New Product Detected'
                    : scanResult.matchType
                      ? `Matched via ${scanResult.matchType.toUpperCase()}`
                      : 'Authenticated Asset'}
              </p>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white truncate">{scanResult.name}</h4>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {(scanResult as any).notFound ? 'Barcode' : 'SKU'}: {scanResult.sku}
              </p>
              {(scanResult as any).errorMessage && (
                <p className="text-xs text-red-500 mt-1">{(scanResult as any).errorMessage}</p>
              )}
              {scanResult.confidence && scanResult.matchType && (
                <p className="text-xs text-slate-400 mt-1">
                  Confidence: {Math.round(scanResult.confidence * 100)}%
                </p>
              )}
              {!(scanResult as any).notFound && (
                <div className="flex items-center gap-4 mt-3">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">${typeof scanResult.price === 'number' ? scanResult.price.toFixed(2) : parseFloat(scanResult.price || '0').toFixed(2)}</p>
                  <span className="badge badge-success text-[10px]">{scanResult.category || 'Product'}</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-emerald-100 dark:border-emerald-500/10 flex gap-2">
            {(scanResult as any).notFound ? (
              <button onClick={() => onSelectProduct(scanResult)} className="flex-1 btn-primary py-2 text-xs bg-amber-600 hover:bg-amber-700 border-amber-600">
                Add New Product
              </button>
            ) : (scanResult as any).isExternal ? (
              <button onClick={() => onSelectProduct(scanResult)} className="flex-1 btn-primary py-2 text-xs bg-sky-600 hover:bg-sky-700 border-sky-600">Register Product</button>
            ) : (
              <button onClick={() => onSelectProduct(scanResult)} className="flex-1 btn-primary py-2 text-xs">Update Stock</button>
            )}
            <button onClick={onClear} className="px-4 py-2 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors">Dismiss</button>
          </div>
        </div>
      )}

      {/* Shelf Scan Counts Summary */}
      {shelfCounts.size > 0 && (
        <div className="premium-card overflow-hidden animate-in">
          <div className="p-4 bg-gradient-to-r from-emerald-500/10 to-sky-500/10 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                Live Shelf Count
              </h4>
              <span className="badge badge-success text-[10px] animate-pulse">
                {totalShelfCount} Total Items
              </span>
            </div>
          </div>
          <div className="max-h-[200px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {Array.from(shelfCounts.entries()).map(([productId, item]) => (
              <div key={productId} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center text-[10px] font-bold text-emerald-600">
                    {item.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</p>
                    {item.barcode && (
                      <p className="text-[10px] text-slate-500">{item.barcode}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editingCount === productId ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-16 px-2 py-1 text-sm font-bold text-center border border-slate-300 rounded-lg dark:bg-slate-700 dark:border-slate-600"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(productId);
                          if (e.key === 'Escape') setEditingCount(null);
                        }}
                      />
                      <button
                        onClick={() => handleSaveEdit(productId)}
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <>
                      <span
                        className="badge badge-success text-[10px] cursor-pointer hover:bg-emerald-600 hover:text-white"
                        onClick={() => onAdjustCount && handleStartEdit(productId, item.count)}
                        title="Click to adjust count"
                      >
                        {item.count} {item.count === 1 ? 'unit' : 'units'}
                      </span>
                      {onAdjustCount && (
                        <button
                          onClick={() => handleStartEdit(productId, item.count)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded"
                          title="Adjust count"
                        >
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50">
            <button
              onClick={handleCommitBatch}
              disabled={committing || batchResults.length === 0}
              className="w-full btn-primary py-3 text-xs shadow-emerald-500/20 disabled:opacity-50"
            >
              {committing ? 'Committing...' : 'Commit to Inventory'}
            </button>
          </div>
        </div>
      )}

      {/* Batch Results */}
      {batchResults.length > 0 && shelfCounts.size === 0 && (
        <div className="premium-card overflow-hidden animate-in">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">Batch Queue ({batchResults.length})</h4>
            <button onClick={onClear} className="text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase">Clear</button>
          </div>
          <div className="max-h-[240px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {batchResults.map((item, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-[10px] font-bold text-slate-400">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{item.name || 'Unknown Product'}</p>
                    <p className="text-[10px] text-slate-500">{item.barcode || item.productId}</p>
                  </div>
                </div>
                <span className="badge badge-success text-[10px]">{item.count} Units</span>
              </div>
            ))}
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50">
            <button
              onClick={handleCommitBatch}
              disabled={committing}
              className="w-full btn-primary py-3 text-xs shadow-emerald-500/20"
            >
              {committing ? 'Committing...' : 'Commit Batch to Ledger'}
            </button>
          </div>
        </div>
      )}

      {/* Scanned Products List - always visible when items exist */}
      {productMatches.length > 0 && (
        <div className="space-y-3 animate-in">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">
            Scanned Products ({productMatches.length})
          </p>
          {productMatches.map((product) => (
            <button
              key={product.id}
              onClick={() => onSelectProduct(product)}
              className="w-full premium-card p-4 flex items-center gap-4 hover:border-emerald-500/50 text-left group transition-all"
            >
              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 font-bold group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                {product.image ? (
                  <img src={product.image} alt="" className="w-full h-full object-cover rounded-lg" />
                ) : (
                  product.name.charAt(0)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{product.name}</p>
                <p className="text-[10px] text-slate-500 font-medium">SKU: {product.sku}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-900 dark:text-white">${typeof product.price === 'number' ? product.price.toFixed(2) : parseFloat(product.price || '0').toFixed(2)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
