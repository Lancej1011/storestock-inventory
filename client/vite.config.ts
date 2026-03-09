import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    build: {
      rollupOptions: {
        external: [
          '@tensorflow-models/coco-ssd',
        ],
      },
    },
    server: {
      port: 5174,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://localhost:3000',
          ws: true,
        },
      },
    },
    // In production, use relative API path for proxy or absolute URL
    base: env.VITE_API_URL === '/api' && mode === 'production' 
      ? '/' 
      : '/',
  };
});
