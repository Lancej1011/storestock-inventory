import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export default function Inventory() {
  const { data, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get('/inventory?limit=50').then((res) => res.data),
  });

  const { data: stats } = useQuery({
    queryKey: ['inventory', 'stats'],
    queryFn: () => api.get('/inventory/stats').then((res) => res.data),
  });

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 animate-fade-in">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white font-heading tracking-tight">Active Inventory</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium tracking-tight">Real-time Stock Audit & Replenishment Intelligence</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200/50 dark:border-slate-700/50 text-[10px] font-black uppercase tracking-widest text-slate-500 shadow-sm">
             Node Status: <span className="text-emerald-500 animate-pulse">Synced</span>
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Unit Count', value: stats?.totalUnits?.toLocaleString() || '0', icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5', color: 'text-sky-500', bg: 'bg-sky-500/10', border: 'border-sky-500/30' },
          { label: 'Location Clusters', value: stats?.totalRecords?.toLocaleString() || '0', icon: 'M15 10.5a3 3 0 11-6 0 3 3 0 016 0z', color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30' },
          { label: 'Active Storefronts', value: new Set(data?.data?.map((item: { store: { id: string } }) => item.store?.id)).size || 0, icon: 'M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-10.5 0v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m18.924 0H21.64m-9.48 0h2.71m-7.448 0H10.83m-2.24 0H5.86m12.28 0h2.24m-1.572-7.25h1.572c.414 0 .75-.336.75-.75V4.5a.75.75 0 00-.75-.75h-15a.75.75 0 00-.75.75v3.5c0 .414.336.75.75.75h1.572', color: 'text-slate-900 dark:text-white', bg: 'bg-slate-900/10 dark:bg-white/10', border: 'border-slate-900/30 dark:border-white/30' },
          { label: 'Tracked SKUs', value: new Set(data?.data?.map((item: { product: { id: string } }) => item.product?.id)).size || 0, icon: 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581a2.25 2.25 0 003.182 0l4.318-4.318a2.25 2.25 0 000-3.182L11.159 3.659A2.25 2.25 0 009.568 3z', color: 'text-sky-300', bg: 'bg-sky-300/10', border: 'border-sky-300/30' },
        ].map((stat, i) => (
          <div key={i} className={`premium-card p-6 border-b-4 ${stat.border} group transition-all duration-500 hover:-translate-y-1`}>
            <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-current opacity-5 rounded-full group-hover:scale-150 transition-transform duration-700" />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{stat.label}</p>
            <div className="flex items-center justify-between">
               <p className="text-3xl font-black text-slate-900 dark:text-white font-heading tracking-tighter">{stat.value}</p>
               <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color} shadow-inner group-hover:rotate-6 transition-transform`}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                     <path strokeLinecap="round" strokeLinejoin="round" d={stat.icon} />
                  </svg>
               </div>
            </div>
          </div>
        ))}
      </div>

      {/* Inventory Table */}
      {isLoading ? (
        <div className="premium-card p-32 text-center group">
           <div className="relative w-20 h-20 mx-auto mb-8">
              <div className="absolute inset-0 border-4 border-indigo-100 dark:border-indigo-900/30 rounded-full" />
              <div className="absolute inset-0 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin shadow-xl shadow-indigo-500/20" />
           </div>
           <h3 className="text-2xl font-black text-slate-900 dark:text-white font-heading tracking-tight">Accessing Stock Registry...</h3>
           <p className="text-slate-400 dark:text-slate-500 mt-2 font-medium italic">Synchronizing local data with global inventory mesh.</p>
        </div>
      ) : (
        <div className="premium-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Inventory Designation</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Location Matrix</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 text-center">Volume</th>
                  <th className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 text-right">Operational Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {data?.data?.map((item: { id: string; product: { name: string }; store: { name: string }; quantity: number; reorderLevel: number; location: { aisle: string; shelf: string } }) => {
                  const isLowStock = item.quantity <= (item.reorderLevel || 10);
                  const isCritical = item.quantity === 0;
                  return (
                    <tr key={item.id} className="group hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-all duration-300 leading-relaxed">
                      <td className="px-8 py-7">
                        <div className="flex items-center gap-5">
                          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg transition-all duration-500 group-hover:scale-110 group-hover:-rotate-3 ${isCritical ? 'bg-red-500 shadow-red-500/20' : isLowStock ? 'bg-orange-500 shadow-orange-500/20' : 'bg-emerald-500 shadow-emerald-500/20'}`}>
                            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-lg font-black text-slate-900 dark:text-white font-heading tracking-tight mb-0.5 group-hover:text-indigo-500 transition-colors uppercase">{item.product.name}</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                               <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200/50 dark:border-slate-700/50">{item.store.name}</span>
                               <span className="opacity-30">|</span>
                               <span className="font-mono">{item.id.slice(-8)}</span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-7">
                        <div className="flex items-center gap-3">
                           <div className="w-1.5 h-10 bg-indigo-500/20 rounded-full" />
                           <div className="flex flex-col">
                             <span className="font-mono text-xs font-black text-slate-900 dark:text-slate-200 tracking-[0.2em]">
                               {item.location?.aisle || '00'}-{item.location?.shelf || '00'}
                             </span>
                             <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Zone Coordinates</span>
                           </div>
                        </div>
                      </td>
                      <td className="px-8 py-7 text-center">
                        <div className="flex flex-col items-center">
                           <span className={`text-3xl font-black font-heading tracking-tighter ${isLowStock ? 'text-red-500 animate-pulse' : 'text-slate-900 dark:text-white'}`}>
                             {item.quantity}
                           </span>
                           <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Reserve Units</span>
                        </div>
                      </td>
                      <td className="px-8 py-7 text-right">
                        {isCritical ? (
                           <span className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white text-[9px] font-black uppercase tracking-[0.25em] rounded-xl shadow-lg shadow-red-500/20 border border-red-400/50">
                              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                              CRITICAL DEPLETION
                           </span>
                        ) : isLowStock ? (
                          <span className="inline-flex items-center px-4 py-2 bg-orange-100 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[9px] font-black uppercase tracking-[0.25em] rounded-xl border border-orange-200 dark:border-orange-500/20">
                            REORDER POINT REACHED
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-4 py-2 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase tracking-[0.25em] rounded-xl border border-emerald-200 dark:border-emerald-500/20">
                            OPTIMAL STATUS
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Empty state intelligence */}
          {(!data?.data || data.data.length === 0) && (
            <div className="text-center py-24 bg-slate-50/20 dark:bg-slate-800/10">
              <div className="relative w-32 h-32 mx-auto mb-10 group">
                <div className="absolute inset-0 bg-slate-100 dark:bg-slate-800 rounded-[3rem] rotate-6 group-hover:rotate-12 transition-transform duration-700 shadow-inner" />
                <div className="absolute inset-0 flex items-center justify-center -rotate-6 group-hover:rotate-0 transition-transform duration-700">
                  <svg className="w-16 h-16 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </div>
              </div>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white font-heading tracking-tight uppercase">Null Set Result</h3>
              <p className="text-slate-400 dark:text-slate-500 mt-2 max-w-sm mx-auto font-medium italic">No managed inventory records found. Begin asset registration to populate monitoring mesh.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
