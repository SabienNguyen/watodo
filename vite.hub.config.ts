import path from 'node:path'
import { defineConfig } from 'vite'

// The hub's notifier planner: the domain code bundled for Node (see hub/notify-entry.ts). tinybase stays
// external and is resolved from node_modules when the hub loads the file.
export default defineConfig({
  // The app's public/ (icons, service worker) belongs to the app build, not the notifier bundle.
  publicDir: false,
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    outDir: 'dist-hub',
    emptyOutDir: true,
    ssr: 'hub/notify-entry.ts',
    minify: false,
    rollupOptions: {
      external: ['tinybase'],
      output: {
        format: 'es',
        entryFileNames: 'notify-entry.js',
      },
    },
  },
})
