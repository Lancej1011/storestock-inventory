import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = response.data;
      login(user, accessToken, refreshToken);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-white dark:bg-slate-950 transition-colors duration-500">
      {/* Left Decoration (Brand) */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <svg width="24" height="24" className="text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white uppercase">StoreStock</span>
          </div>
          
          <div className="max-w-md">
            <h1 className="text-5xl font-black text-slate-900 dark:text-white leading-[1.1] mb-6">
              Precision Asset <span className="text-emerald-600 block">Intelligence.</span>
            </h1>
            <p className="text-lg text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
              Professional inventory management for modern grocery retail. Real-time SKU tracking with AI-enhanced visual scanning.
            </p>
          </div>
        </div>
        
        <div className="relative z-10 flex items-center gap-6 text-slate-400 text-xs font-bold uppercase tracking-widest">
           <span>SKU Sync</span>
           <div className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
           <span>Neural Scan</span>
           <div className="w-1 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
           <span>Retail Flow</span>
        </div>

        {/* Abstract pattern */}
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-emerald-500/5 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Right: Login Form */}
      <div className="flex items-center justify-center p-8 lg:p-24 relative overflow-hidden">
        <div className="w-full max-w-sm relative z-10 space-y-10">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">Representative Login</h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Please enter your store credentials</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="animate-shake p-4 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs font-bold flex items-center gap-3">
                 <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                 {error}
              </div>
            )}
            
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest ml-1">Work Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-professional"
                  placeholder="name@store.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest ml-1">Access Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-professional"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-4 text-sm tracking-widest uppercase font-black shadow-emerald-500/20 h-14"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Authenticate Terminal'
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 font-medium">
            Authorized Personnel Only • IP Logged
          </p>
        </div>
      </div>
    </div>
  );
}
