import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export default function Products() {
  const { data: productsData, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/products').then((res) => res.data),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">Product Registry</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium italic">Global master data and SKU intelligence</p>
        </div>
        <button className="btn-primary px-8 py-3.5 shadow-lg shadow-emerald-500/10 group">
          <svg width="20" height="20" className="mr-3 group-hover:rotate-90 transition-all duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          REGISTER NEW ASSET
        </button>
      </div>

      {/* Modern Search/Filter Bar */}
      <div className="premium-card p-4 group focus-within:ring-2 focus-within:ring-emerald-500 dark:focus-within:ring-emerald-500/20 transition-all">
        <div className="relative flex items-center">
          <div className="absolute left-4 text-slate-400">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <input 
            type="text" 
            placeholder="Search SKUs, Brands, or Categories..." 
            className="w-full pl-12 pr-6 py-3 bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white font-medium placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Product Table */}
      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500">Asset Identity</th>
                <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500">Category</th>
                <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500">SKU / UPC</th>
                <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500">Price</th>
                <th className="px-8 py-5 text-right text-xs font-bold uppercase tracking-widest text-slate-500">Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {productsData?.products?.map((product: any) => (
                <tr key={product.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 font-bold border border-slate-200 dark:border-slate-700">
                        {product.image ? (
                          <img src={product.image} alt="" className="w-full h-full object-cover rounded-xl" />
                        ) : (
                          product.name.charAt(0)
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{product.name}</p>
                        <p className="text-xs text-slate-500 font-medium">{product.brand || 'Neural Asset'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="badge badge-success text-[10px]">{product.category || 'General'}</span>
                  </td>
                  <td className="px-8 py-6">
                    <code className="text-xs font-mono font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                      {product.sku}
                    </code>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">${product.price?.toFixed(2)}</p>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 text-slate-400 hover:text-emerald-500 transition-colors bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                        </svg>
                      </button>
                      <button className="p-2 text-slate-400 hover:text-indigo-500 transition-colors bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm">
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              
              {!productsData?.products?.length && (
                <tr>
                  <td colSpan={5} className="py-32">
                    <div className="text-center group">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6 text-slate-300 group-hover:rotate-12 transition-transform duration-500">
                        <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold">No Assets Logged</h3>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Initialize your inventory by registering your first SKU above.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
