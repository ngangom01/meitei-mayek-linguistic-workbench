import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [],
      manifest: {
        name: 'Meitei Mayek Linguistic Review Workbench',
        short_name: 'Mayek Review',
        description: 'A simple local-first linguistic review tool.',
        theme_color: '#f8f7f3',
        background_color: '#f8f7f3',
        display: 'standalone',
        start_url: './',
        icons: []
      }
    })
  ]
})
