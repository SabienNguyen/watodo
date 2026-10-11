/// <reference types="vitest/config" />
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Home-screen app and offline app shell. The plugin is off in `vite dev` (its default), so dev and demo mode are unaffected.
    VitePWA({
      registerType: 'autoUpdate',
      filename: 'sw.js',
      manifestFilename: 'manifest.webmanifest',
      manifest: {
        name: 'watodo',
        short_name: 'watodo',
        description: 'What to do, right now',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        // The hub's own paths (/hub/time and the WebSocket) must always reach the network, never the cached shell.
        navigateFallbackDenylist: [/^\/(sync|hub)/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // `npm run dev` with `npm run hub` running: the app syncs and reads the hub's clock through these paths.
  server: {
    proxy: {
      '/sync': { target: 'http://127.0.0.1:4780', ws: true },
      '/hub': { target: 'http://127.0.0.1:4780' },
    },
  },
  test: {
    // Default is node. React component tests opt in with `// @vitest-environment jsdom`.
    environment: 'node',
    globals: true,
    setupFiles: ['./src/vitest.setup.ts'],
  },
})
