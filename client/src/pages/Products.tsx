import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export default function Products() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => api.get(`/products?search=${search}&limit=20`).then((res) => res.data),
  });

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 animate-fade-in">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white font-heading tracking-tight">Products</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Global Product Registry & Asset Intelligence</p>
        </div>
        <button className="btn-gradient px-8 py-3.5 shadow-xl shadow-sky-500/20 group">
          <svg className="w-5 h-5 mr-3 group-hover:rotate-90 transition-all duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          REGISTER ASSET
        </button>
      </div>

      {/* Search & Intelligence */}
      <div className="premium-card p-3 group focus-within:ring-4 focus-within:ring-sky-500/10 transition-all">
        <div className="relative flex items-center">
          <div className="absolute left-6 pointer-events-none">
            <svg className="w-6 h-6 text-slate-300 group-focus-within:text-sky-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input
            type="search"
            placeholder="Query by SKU, Name, or Category Intelligence..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-16 pr-6 py-5 bg-transparent border-none outline-none text-slate-900 dark:text-white font-bold placeholder:text-slate-300 dark:placeholder:text-slate-600 text-xl tracking-tight"
          />
          <div className="hidden md:flex items-center gap-2 px-6 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 text-[10px] font-black uppercase tracking-widest text-slate-400">
             <kbd className="font-sans">ESC</kbd> to clear
          </div>
        </div>
      </div>

      {/* Registry View */}
      {isLoading ? (
        <div className="premium-card p-32 text-center group">
          <div className="relative w-24 h-24 mx-auto mb-10">
             <div className="absolute inset-0 border-4 border-sky-100 dark:border-sky-900/30 rounded-full" />
             <div className="absolute inset-0 border-4 border-sky-500 border-t-transparent rounded-full animate-spin shadow-lg shadow-sky-500/20" />
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white font-heading tracking-tight">Syncing Registry...</h3>
          <p className="text-slate-400 dark:text-slate-500 mt-2 font-medium italic">Fetching latest asset intelligence from secure node.</p>
        </div>
      ) : (
        <div className="premium-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">ID / Identity</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Asset Designation</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Valuation</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 text-right">Operations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {data?.data?.map((product: { id: string; sku: string; name: string; retailPrice: number }) => (
                  <tr key={product.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-all duration-300">
                    <td className="px-8 py-7">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex flex-col items-center justify-center font-mono text-[9px] font-black text-slate-400 group-hover:bg-sky-500 group-hover:text-white transition-all duration-500 shadow-inner group-hover:rotate-6">
                          <span className="opacity-50">SKU</span>
                          <span className={product.sku ? 'text-slate-900 dark:text-slate-100 group-hover:text-white' : ''}>
                             {product.sku?.slice(-3) || '???'}
                          </span>
                        </div>
                        <div>
                           <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 tracking-[0.15em] mb-0.5">{product.sku}</p>
                           <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Global Ident</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <p className="text-xl font-black text-slate-900 dark:text-white font-heading tracking-tight group-hover:text-sky-500 transition-colors uppercase decoration-sky-500/30 underline-offset-8 group-hover:underline">
                        {product.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                         <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Active Inventory Unit</p>
                      </div>
                    </td>
                    <td className="px-8 py-7">
                      <div className="flex flex-col">
                        <span className="text-2xl font-black text-slate-900 dark:text-white font-heading tracking-tighter">
                          ${product.retailPrice?.toFixed(2)}
                        </span>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] transform -translate-y-1">MSRP VALUATION</span>
                      </div>
                    </td>
                    <td className="px-8 py-7 text-right">
                      <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-8 group-hover:translate-x-0">
                        <button className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-800 text-slate-400 hover:text-sky-500 hover:border-sky-500/20 hover:shadow-xl hover:shadow-sky-500/10 transition-all duration-300">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          </svg>
                        </button>
                        <button className="w-12 h-12 flex items-center justify-center rounded-2xl bg-slate-900 dark:bg-sky-600 text-white hover:bg-sky-600 dark:hover:bg-sky-500 hover:shadow-2xl hover:shadow-sky-500/30 transition-all duration-300">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Empty state intelligence */}
          {(!data?.data || data.data.length === 0) && (
            <div className="text-center py-32 bg-slate-50/20 dark:bg-slate-800/10">
              <div className="relative w-32 h-32 mx-auto mb-10 group">
                <div className="absolute inset-0 bg-slate-100 dark:bg-slate-800 rounded-[3rem] rotate-6 group-hover:rotate-12 transition-transform duration-700 shadow-inner" />
                <div className="absolute inset-0 flex items-center justify-center -rotate-6 group-hover:rotate-0 transition-transform duration-700">
                  <svg className="w-16 h-16 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-3xl font-black text-slate-900 dark:text-white font-heading tracking-tight uppercase">Null Set Result</h3>
              <p className="text-lg text-slate-400 dark:text-slate-500 mt-4 max-w-md mx-auto font-medium italic">Our neural mesh was unable to isolate any assets matching your specific query parameters in the global registry.</p>
              <button 
                onClick={() => setSearch('')}
                className="mt-12 btn-premium px-10 py-4 text-[11px] uppercase tracking-[0.4em] shadow-xl"
              >
                Reset Search Vector
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
