import React from 'react';

interface Store {
  id: string;
  name: string;
}

interface Location {
  id: string;
  aisle: string;
  shelf: string;
}

interface Inventory {
  quantity: number;
  store: { name: string };
}

interface StockUpdateFormProps {
  product: { name: string; sku: string; barcode: string };
  inventory: Inventory | null;
  quantity: number;
  onQuantityChange: (val: number) => void;
  selectedStoreId: string;
  onStoreChange: (id: string) => void;
  selectedLocationId: string;
  onLocationChange: (id: string) => void;
  stores: Store[];
  locations: Location[];
  onUpdate: () => void;
  loading: boolean;
  success: boolean;
}

export const StockUpdateForm: React.FC<StockUpdateFormProps> = ({
  product,
  inventory,
  quantity,
  onQuantityChange,
  selectedStoreId,
  onStoreChange,
  selectedLocationId,
  onLocationChange,
  stores,
  locations,
  onUpdate,
  loading,
  success
}) => {
  if (success) {
    return (
      <div className="premium-card p-8 text-center animate-fade-in-up border-b-4 border-emerald-500">
        <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-emerald-100">
          <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-black text-slate-900 font-heading mb-2">Audit Complete</h3>
        <p className="text-sm text-slate-400 font-medium mb-8">Stock levels have been synchronized with the master node.</p>
        <button
          onClick={() => window.location.reload()}
          className="btn-premium px-10 py-4 text-[10px] uppercase tracking-widest shadow-lg shadow-sky-500/20"
        >
          READY FOR NEW SCAN
        </button>
      </div>
    );
  }

  return (
    <div className="premium-card p-6 mt-6 animate-fade-in-up border-l-4 border-indigo-500">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h3 className="text-xl font-black text-slate-900 font-heading tracking-tight">{product.name}</h3>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{product.sku}</p>
        </div>
        {inventory && (
          <div className="bg-sky-50 px-4 py-2 rounded-xl border border-sky-100 text-right">
            <p className="text-[8px] font-black text-sky-400 uppercase tracking-tighter">Current Network Stock</p>
            <p className="text-lg font-black text-sky-600 font-heading">{inventory.quantity} Units</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block underline decoration-sky-500 underline-offset-4">Allocation Node</label>
          <select 
            className="input-premium w-full py-3.5 appearance-none bg-slate-50 border-slate-100 font-bold text-xs"
            value={selectedStoreId}
            onChange={(e) => onStoreChange(e.target.value)}
          >
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block underline decoration-indigo-500 underline-offset-4">Cluster Location</label>
          <select 
            className="input-premium w-full py-3.5 appearance-none bg-slate-50 border-slate-100 font-bold text-xs"
            value={selectedLocationId}
            onChange={(e) => onLocationChange(e.target.value)}
          >
            <option value="">Aisle/Shelf Allocation</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.aisle}-{l.shelf}</option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="flex items-center justify-between mb-8 bg-slate-50 p-6 rounded-2xl border border-slate-100 shadow-inner">
        <div>
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Quantity Delta</h4>
          <p className="text-xs text-slate-500 font-medium italic">Adjusting inventory volume</p>
        </div>
        <div className="flex items-center gap-6">
          <button 
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-xl font-black text-slate-400 hover:text-sky-500 hover:border-sky-200 shadow-sm transition-all active:scale-95"
          >
            -
          </button>
          <input 
            type="number" 
            className="w-12 text-center text-2xl font-black text-slate-900 bg-transparent border-none focus:ring-0"
            value={quantity}
            onChange={(e) => onQuantityChange(parseInt(e.target.value) || 1)}
          />
          <button 
            onClick={() => onQuantityChange(quantity + 1)}
            className="w-12 h-12 bg-white border border-slate-200 rounded-2xl flex items-center justify-center text-xl font-black text-slate-400 hover:text-sky-500 hover:border-sky-200 shadow-sm transition-all active:scale-95"
          >
            +
          </button>
        </div>
      </div>
      
      <button
        onClick={onUpdate}
        disabled={loading}
        className="btn-premium w-full py-4 text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-sky-500/20 disabled:opacity-50"
      >
        {loading ? 'SYNCHRONIZING...' : 'UPDATE SYSTEM STOCK'}
      </button>
    </div>
  );
};
