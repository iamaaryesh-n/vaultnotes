import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: false,
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/_/],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        cleanupOutdatedCaches: true,
      },
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'],
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('firebase')) return 'firebase'
          if (id.includes('@tiptap') || id.includes('tiptap') || id.includes('prosemirror')) return 'tiptap'
          if (id.includes('framer-motion')) return 'framer-motion'
        },
      },
    },
  },
})
