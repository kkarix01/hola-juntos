import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg'],
    manifest: {
      name: 'Hola Juntos — hiszpański we dwoje',
      short_name: 'Hola Juntos',
      description: 'Wspólne fiszki do nauki hiszpańskiego',
      theme_color: '#f6f4ef', background_color: '#f6f4ef', display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' }
      ]
    }
  })]
})
