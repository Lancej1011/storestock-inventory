import React from 'react';

interface ProductFormProps {
  formData: {
    name: string;
    sku: string;
    costPrice: string;
    retailPrice: string;
    description: string;
    size: string;
  };
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  loading: boolean;
}

export const ProductForm: React.FC<ProductFormProps> = ({
  formData,
  onChange,
  onSubmit,
  onCancel,
  loading
}) => {
  return (
    <div className="premium-card p-6 animate-fade-in-up border-l-4 border-orange-500">
      <div className="mb-6">
        <h2 className="text-xl font-black text-slate-900 dark:text-white font-heading tracking-tight">Register New Product</h2>
        <p className="text-xs text-slate-400 font-medium tracking-tight">Item not found in database. Please initialize catalog entry.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Product Name</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={onChange}
            className="input-premium w-full"
            placeholder="e.g. Doritos Nacho Cheese"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">SKU / Model Number</label>
          <input
            type="text"
            name="sku"
            value={formData.sku}
            onChange={onChange}
            className="input-premium w-full font-mono text-sm"
            placeholder="SKU-XXX-XXX"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Cost Price</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input
                type="number"
                name="costPrice"
                value={formData.costPrice}
                onChange={onChange}
                className="input-premium w-full pl-8"
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Retail Price</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input
                type="number"
                name="retailPrice"
                value={formData.retailPrice}
                onChange={onChange}
                className="input-premium w-full pl-8"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Size / Weight</label>
          <input
            type="text"
            name="size"
            value={formData.size}
            onChange={onChange}
            className="input-premium w-full"
            placeholder="e.g. 9.25oz, 500ml, 1kg"
          />
        </div>
        <div>
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={onChange}
            className="input-premium w-full min-h-[80px]"
            placeholder="Product specifications and details..."
          />
        </div>
      </div>

      <div className="flex gap-3 mt-8">
        <button
          onClick={onSubmit}
          disabled={loading}
          className="btn-premium flex-1 py-4 text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-sky-500/20 disabled:opacity-50"
        >
          {loading ? 'SAVING...' : 'REGISTER IN CATALOG'}
        </button>
        <button
          onClick={onCancel}
          className="px-6 border border-slate-200 dark:border-slate-700 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          DISCARD
        </button>
      </div>
    </div>
  );
};
