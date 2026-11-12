import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  // Local development uses /. Production uses this repository's GitHub Pages path.
  base: mode === 'production' ? '/meitei-mayek-linguistic-workbench/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Meitei Mayek Linguistic Review Workbench',
        short_name: 'Mayek Review',
        description: 'A local-first Meitei Mayek linguistic review tool.',
        theme_color: '#f8f7f3',
        background_color: '#f8f7f3',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,svg,woff2}']
      }
    })
  ]
}))
