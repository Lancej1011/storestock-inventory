import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export default function Dashboard() {
  const queryClient = useQueryClient();
  
  const { data: inventory } = useQuery({
    queryKey: ['inventory', 'low-stock'],
    queryFn: () => api.get('/inventory/low-stock').then((res) => res.data),
  });

  useEffect(() => {
    const socket = io(SOCKET_URL);
    
    socket.on('connect', () => {
      console.log('Dashboard connected to socket');
      // In a real app, join specific store room: socket.emit('join-store', user.storeId);
    });

    socket.on('stock:low', (data) => {
      console.log('Low stock alert received:', data);
      // Invalidate query to refresh low stock list
      queryClient.invalidateQueries({ queryKey: ['inventory', 'low-stock'] });
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  const { data: productsData } = useQuery({
    queryKey: ['products', 'count'],
    queryFn: () => api.get('/products?limit=1').then((res) => res.data),
  });

  const stats = [
    { 
      label: 'Low Stock Items', 
      value: inventory?.length || 0, 
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ),
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/50',
      description: 'Needs Attention',
    },
    { 
      label: 'Total Products', 
      value: productsData?.total?.toLocaleString() || '0', 
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
      ),
      color: 'text-sky-500',
      bgColor: 'bg-sky-500/10',
      borderColor: 'border-sky-500/50',
      description: 'Live Catalog',
    },
    { 
      label: 'Active Orders', 
      value: '5', 
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
        </svg>
      ),
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/50',
      description: 'Pending Sync',
    },
  ];

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white font-heading tracking-tight">
            Dashboard
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">Real-time inventory intelligence & asset monitoring</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          System Operational
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {stats.map((stat, index) => (
          <div 
            key={stat.label} 
            className="premium-card p-8 group relative overflow-hidden active:scale-[0.98] transition-transform"
            style={{ 
              animationDelay: `${index * 150}ms`,
            }}
          >
            {/* Background Glow */}
            <div className={`absolute -right-12 -bottom-12 w-48 h-48 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-700 ${stat.bgColor}`} />
            
            <div className="relative z-10 flex flex-col h-full">
              <div className="flex items-start justify-between mb-8">
                <div className={`p-4 rounded-[1.25rem] shadow-xl shadow-current transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 ${stat.bgColor} ${stat.color}`}>
                  {stat.icon}
                </div>
                <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-current opacity-30 group-hover:opacity-100 transition-opacity ${stat.color}`}>
                  {stat.description}
                </div>
              </div>
              
              <div className="mt-auto">
                <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] mb-2">{stat.label}</p>
                <div className="flex items-baseline gap-2">
                  <p className="text-5xl font-black text-slate-900 dark:text-white font-heading tracking-tighter">
                    {stat.value}
                  </p>
                  <span className="text-xs font-bold text-slate-400">+12% vs last month</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Critical Section */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Low Stock Alerts */}
        <div className="xl:col-span-2 premium-card overflow-hidden">
          <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
            <div className="flex items-center gap-4">
              <div className="w-2 h-8 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.5)]" />
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white font-heading tracking-tight">Critical Stock Alerts</h2>
                <p className="text-xs text-slate-400 font-medium">Immediate replenishment recommended</p>
              </div>
            </div>
            {inventory && inventory.length > 0 && (
              <div className="flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                 <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">
                  {inventory.length} Conflicts
                </span>
              </div>
            )}
          </div>
          
          <div className="p-2">
            {inventory && inventory.length > 0 ? (
              <div className="space-y-1">
                {inventory.slice(0, 5).map((item: { id: string; product: { name: string }; quantity: number; reorderLevel: number }) => (
                  <div 
                    key={item.id} 
                    className="flex items-center justify-between p-6 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-2xl transition-all duration-500 group"
                  >
                    <div className="flex items-center gap-6">
                      <div className={`w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-black text-sm shadow-inner transition-all duration-500 group-hover:scale-105 group-hover:rotate-2 ${
                        item.quantity === 0 
                        ? 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20' 
                        : 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-500/20'
                      }`}>
                        <span className="text-2xl leading-none">{item.quantity}</span>
                        <span className="text-[8px] uppercase tracking-tighter opacity-70">Units</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-black text-slate-900 dark:text-white truncate tracking-tight mb-1 group-hover:text-red-500 transition-colors">
                          {item.product.name}
                        </p>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Threshold: {item.reorderLevel}</span>
                          <div className={`w-1 h-1 rounded-full ${item.quantity === 0 ? 'bg-red-500' : 'bg-orange-500'}`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest ${item.quantity === 0 ? 'text-red-500' : 'text-orange-500'}`}>
                            {item.quantity === 0 ? 'CRITICAL DEPLETION' : 'REORDER POINT'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button className="btn-premium px-6 py-2.5 text-[10px] uppercase tracking-[0.2em] transform translate-x-4 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-500">
                      RESOLVE
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-24 group">
                <div className="w-24 h-24 bg-slate-50 dark:bg-slate-800 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner rotate-3 group-hover:rotate-12 transition-transform duration-700">
                  <svg className="w-12 h-12 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white font-heading tracking-tight">System Status: Optimal</h3>
                <p className="text-sm text-slate-400 dark:text-slate-500 mt-2 font-medium italic">All managed assets are within safe operational thresholds.</p>
              </div>
            )}
          </div>
          
          <div className="p-6 bg-slate-50/50 dark:bg-slate-800/10 text-center">
             <button className="text-[10px] font-black text-slate-400 hover:text-sky-500 transition-colors uppercase tracking-[0.3em]">
               VIEW COMPREHENSIVE AUDIT REPORT
             </button>
          </div>
        </div>

        {/* Quick Actions / Activity */}
        <div className="premium-card p-8 flex flex-col">
          <h2 className="text-xl font-black text-slate-900 dark:text-white font-heading tracking-tight mb-8 flex items-center gap-3">
             <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
             Quick Actions
          </h2>
          
          <div className="grid grid-cols-1 gap-4 flex-1">
             <button className="flex items-center gap-4 p-5 rounded-2xl bg-sky-50 dark:bg-sky-500/10 border border-sky-100 dark:border-sky-500/20 group hover:bg-sky-500 transition-all duration-500">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl text-sky-500 shadow-sm group-hover:scale-110 transition-transform">
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 4.5v15m7.5-7.5h-15" /></svg>
                </div>
                <span className="text-sm font-black text-sky-700 dark:text-sky-400 uppercase tracking-widest group-hover:text-white transition-colors">Add New Product</span>
             </button>
             
             <button className="flex items-center gap-4 p-5 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 group hover:bg-indigo-500 transition-all duration-500">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-xl text-indigo-500 shadow-sm group-hover:scale-110 transition-transform">
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" /></svg>
                </div>
                <span className="text-sm font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest group-hover:text-white transition-colors">Launch Batch Scan</span>
             </button>
             
             <div className="mt-8 pt-8 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Live Sync Status</p>
                <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                   <div className="flex -space-x-2">
                      {[1,2,3].map(i => <div key={i} className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-700" />)}
                   </div>
                   <span className="text-xs font-bold text-slate-500">3 nodes syncing...</span>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
