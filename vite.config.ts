import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'es2022',
      minify: 'esbuild',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            // Split heavy third-party code into cache-friendly chunks so a
            // React or chart dependency bump doesn't invalidate everything.
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/') || id.includes('/zustand/')) {
              return 'react-vendor';
            }
            if (id.includes('/recharts/') || id.includes('/d3-') || id.includes('/victory-vendor/')) {
              return 'charts';
            }
            if (id.includes('/motion/') || id.includes('/framer-motion/') || id.includes('/popmotion/') || id.includes('/motion-dom/') || id.includes('/motion-utils/')) {
              return 'motion';
            }
            if (id.includes('/lucide-react/')) return 'icons';
            return 'vendor';
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/gametrack_data.json', '**/gametrack_library.json', '**/gametrack.db*']
      },
    },
  };
});
