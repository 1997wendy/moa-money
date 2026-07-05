import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '모아 · 자산·일정 관리',
        short_name: '모아',
        description: '내 자산·소비·투자·일정을 한 곳에서 관리',
        theme_color: '#0e9c8d',
        background_color: '#f5f7fa',
        display: 'standalone',
        lang: 'ko',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
})
