import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change far less often than app code, so they get their own long-cached files.
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          gsap: ['gsap', 'gsap/ScrollTrigger', 'gsap/ScrollSmoother', 'gsap/SplitText'],
        },
      },
    },
  },
});
