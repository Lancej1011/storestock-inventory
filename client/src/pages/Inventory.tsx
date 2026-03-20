import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export default function Inventory() {
  const { data: inventory, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get('/inventory').then((res) => res.data),
  });

  const lowStockCount = inventory?.filter((item: any) => item.quantity <= (item.product.minStock || 5)).length || 0;
  const criticalCount = inventory?.filter((item: any) => item.quantity <= 2).length || 0;

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const stats = [
    { label: 'Total Stocked Items', value: inventory?.length || 0, icon: 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z', color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
    { label: 'Low Stock Alert', value: lowStockCount, icon: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-500/10' },
    { label: 'Critical Depletion', value: criticalCount, icon: 'M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-500/10' },
  ];

  return (
    <div className="space-y-8 animate-in">
      <div>
        <h1 className="text-3xl font-bold">Stock Management</h1>
        <p className="text-slate-500 dark:text-slate-400 font-medium italic">Monitor and optimize grocery inventory levels</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="premium-card p-6 group hover:border-emerald-500/30">
            <div className="flex items-center justify-between mb-2">
               <p className="text-3xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
               <div className={`p-2.5 rounded-lg ${stat.bg} ${stat.color} shadow-sm group-hover:scale-110 transition-transform`}>
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                     <path strokeLinecap="round" strokeLinejoin="round" d={stat.icon} />
                  </svg>
               </div>
            </div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="premium-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500">Product Asset</th>
                <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500">Stock Count</th>
                <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500">Health State</th>
                <th className="px-8 py-5 text-xs font-bold uppercase tracking-widest text-slate-500">Last Synced</th>
                <th className="px-8 py-5 text-right text-xs font-bold uppercase tracking-widest text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {inventory?.map((item: any) => {
                const isLowStock = item.quantity <= (item.product.minStock || 5);
                const isCritical = item.quantity <= 2;
                
                return (
                  <tr key={item.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold shadow-sm transition-all duration-300 group-hover:scale-105 ${isCritical ? 'bg-red-500' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                          <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 dark:text-white">{item.product.name}</p>
                          <p className="text-xs text-slate-500 font-medium">SKU: {item.product.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{item.quantity} Units</p>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`badge ${isCritical ? 'badge-error' : isLowStock ? 'badge-warning' : 'badge-success'}`}>
                        {isCritical ? 'Critical' : isLowStock ? 'Low Stock' : 'Optimal'}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-xs font-medium text-slate-500">{new Date(item.updatedAt).toLocaleDateString()} at {new Date(item.updatedAt).toLocaleTimeString()}</p>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline uppercase tracking-widest">Update Stock</button>
                    </td>
                  </tr>
                );
              })}
              
              {!inventory?.length && (
                <tr>
                  <td colSpan={5} className="py-32">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6 text-slate-300">
                        <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold">No Active Inventory</h3>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Start scanning products to populate your real-time stock levels.</p>
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
