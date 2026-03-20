import { useQuery } from '@tanstack/react-query';
import api from '../services/api';

export default function Dashboard() {
  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get('/products').then((res) => res.data),
  });

  const { data: inventoryData } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get('/inventory').then((res) => res.data),
  });

  // Extract data arrays from API response
  const products = productsData?.data || [];
  const inventory = inventoryData?.data || [];

  const stats = {
    total: productsData?.pagination?.total || products.length || 0,
    lowStock: inventory.length || 0,
    criticalItems: inventory.filter((item: any) => item.quantity <= (item.product?.reorderLevel || 5)).length || 0,
    categories: [
      { name: 'Fresh Produce', count: 42, color: 'bg-emerald-500' },
      { name: 'Dairy & Eggs', count: 28, color: 'bg-sky-500' },
      { name: 'Meat & Seafood', count: 15, color: 'bg-rose-500' },
      { name: 'Dry Goods', count: 156, color: 'bg-amber-500' },
    ]
  };

  const cards = [
    { 
      label: 'Total SKU Inventory', 
      value: stats.total.toLocaleString(), 
      trend: '+12.5%', 
      status: 'success',
      icon: (
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      )
    },
    { 
      label: 'Critically Low Stock', 
      value: stats.criticalItems, 
      trend: '-2 today', 
      status: 'error',
      icon: (
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      )
    },
    { 
      label: 'Inventory Health', 
      value: '94%', 
      trend: 'Optimal', 
      status: 'success',
      icon: (
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  ];

  return (
    <div className="space-y-8 animate-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Store Overview</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Real-time grocery inventory & supply health</p>
        </div>
        <div className="flex items-center gap-3">
           <button className="btn-secondary">Export Report</button>
           <button className="btn-primary">New Stock Order</button>
        </div>
      </div>

      {/* Metric Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card) => (
          <div key={card.label} className="premium-card p-6 group">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2.5 rounded-lg ${card.status === 'error' ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                {card.icon}
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                card.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
              }`}>
                {card.trend}
              </span>
            </div>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{card.label}</p>
            <h3 className="text-4xl font-bold mt-1 text-slate-900 dark:text-white">{card.value}</h3>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Category Breakdown */}
        <div className="lg:col-span-2 premium-card p-8">
           <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-bold">Category Distribution</h3>
              <button className="text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:underline">View All</button>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {stats.categories.map((cat) => (
                <div key={cat.name} className="flex items-center gap-4 group cursor-pointer p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <div className={`w-3 h-12 rounded-full ${cat.color} group-hover:scale-y-110 transition-transform`} />
                  <div className="flex-1">
                     <p className="text-sm font-bold text-slate-900 dark:text-white">{cat.name}</p>
                     <p className="text-xs font-medium text-slate-500">{cat.count} Unique SKUs</p>
                  </div>
                  <div className="text-right">
                     <p className="text-sm font-bold">{(cat.count / stats.total * 100).toFixed(0)}%</p>
                  </div>
                </div>
              ))}
           </div>
        </div>

        {/* Quick Actions / Recent Activity */}
        <div className="premium-card p-8 flex flex-col">
           <h3 className="text-xl font-bold mb-6">Critical Alerts</h3>
           <div className="space-y-4 flex-1">
              {stats.criticalItems > 0 ? (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/20">
                  <p className="text-sm font-bold text-red-700 dark:text-red-400">Stock Depletion Imminent</p>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-1">{stats.criticalItems} items require immediate reorder to avoid out-of-stock.</p>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/20">
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Stock Health: Optimal</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">All high-velocity SKUs are properly maintained.</p>
                </div>
              )}
           </div>
           
           <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Neural Scanner</p>
              <button className="w-full btn-primary py-4 gap-2">
                 <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                 </svg>
                 Launch AI Scanner
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
