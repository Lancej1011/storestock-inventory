import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, accessToken, refreshToken } = response.data;
      login(user, accessToken, refreshToken);
      navigate('/');
    } catch (err: unknown) {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-3/5 bg-slate-900 relative overflow-hidden">
        {/* Animated Background Mesh */}
        <div className="absolute inset-0 opacity-40">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-sky-500 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-indigo-600 rounded-full blur-[100px] animate-pulse delay-700" />
        </div>
        
        <div className="relative z-10 flex flex-col justify-center px-20 xl:px-32">
          <div className="flex items-center gap-5 mb-12 group cursor-default">
            <div className="w-16 h-16 bg-gradient-to-tr from-sky-400 to-indigo-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-sky-500/20 group-hover:scale-110 transition-transform duration-500">
              <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <div>
              <h1 className="text-4xl font-black text-white font-heading tracking-tight">StoreStock</h1>
              <p className="text-sky-400/80 text-[10px] uppercase font-bold tracking-[0.3em] mt-1">Intelligence Division</p>
            </div>
          </div>
          
          <h2 className="text-6xl font-black text-white leading-[1.1] mb-8 font-heading tracking-tight">
            Master your<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-indigo-400">Inventory Ecosystem</span>
          </h2>
          <p className="text-slate-400 text-xl max-w-lg font-medium leading-relaxed mb-12">
            The elite command center for retail logistics. Track, analyze, and automate your stock with precision neural scanning and real-time syncing.
          </p>

          <div className="flex items-center gap-8 border-t border-white/5 pt-12">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-slate-900 bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400">
                  {i}
                </div>
              ))}
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Trusted by 5,000+ Enterprise Hubs</p>
          </div>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="w-full lg:w-2/5 flex items-center justify-center p-8 lg:p-16 bg-white dark:bg-slate-950 relative overflow-hidden transition-colors duration-500">
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 dark:bg-sky-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        
        <div className="w-full max-w-sm relative z-10">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-4 mb-12">
            <div className="w-14 h-14 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-sky-500/20">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <div>
              <span className="text-2xl font-black text-slate-900 dark:text-white font-heading tracking-tight">StoreStock</span>
              <p className="text-[10px] font-bold text-sky-500 dark:text-sky-400 uppercase tracking-widest">Inventory Elite</p>
            </div>
          </div>

          <div className="mb-10">
            <h2 className="text-4xl font-black text-slate-900 dark:text-white font-heading tracking-tight mb-2">Access Hub</h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Identify yourself to proceed into the system.</p>
          </div>

          {error && (
            <div className="mb-8 p-5 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl text-red-600 dark:text-red-400 text-sm font-bold flex items-center gap-3 animate-shake shadow-lg shadow-red-500/5">
              <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 px-1">
                Identity Credentials
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-premium"
                placeholder="you@store-elite.com"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 px-1 flex justify-between">
                <span>Access Key</span>
                <span className="text-sky-500 dark:text-sky-400 cursor-pointer hover:underline lowercase tracking-normal font-bold">Lost Key?</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-premium"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-gradient w-full py-5 text-base shadow-xl shadow-sky-500/20 group transform active:scale-[0.98] transition-all"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  AUTHENTICATING...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  SECURE SIGN IN
                  <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </span>
              )}
            </button>
          </form>

          <div className="mt-12 pt-8 border-t border-slate-100 dark:border-slate-800">
            <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 shadow-inner group">
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                 <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                 System Override Credentials
              </p>
              <div className="space-y-3 text-sm font-medium">
                <div className="text-slate-600 dark:text-slate-400 flex justify-between items-center group-hover:translate-x-1 transition-transform">
                  <span className="text-[10px] uppercase font-black opacity-50">Identity</span>
                  <code className="text-sky-600 dark:text-sky-400 font-black bg-sky-50 dark:bg-sky-500/10 px-2 py-1 rounded-lg">admin@store.com</code>
                </div>
                <div className="text-slate-600 dark:text-slate-400 flex justify-between items-center group-hover:translate-x-1 transition-transform">
                  <span className="text-[10px] uppercase font-black opacity-50">Access Key</span>
                  <code className="text-sky-600 dark:text-sky-400 font-black bg-sky-50 dark:bg-sky-500/10 px-2 py-1 rounded-lg">password123</code>
                </div>
              </div>
            </div>
            
            <p className="text-center mt-8 text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em]">
               &copy; 2026 StoreStock Elite Intelligence
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
