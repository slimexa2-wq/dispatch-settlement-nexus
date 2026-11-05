import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup.ts']
  },
  plugins: [
    react(),
    ...(process.env.VITE_DISABLE_PWA === '1' ? [] : [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand-mark.svg'],
      manifest: {
        name: '祥能人员与招聘信息管理系统',
        short_name: '祥能招聘',
        description: '求职、人员管理与供应商结算一体化平台',
        theme_color: '#1769f7',
        background_color: '#f5f8fd',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/brand-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/brand-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html'
      }
    })])
  ],
  server: {
    host: true,
    port: 4320,
    allowedHosts: true,
    proxy: { '/api': { target: 'http://127.0.0.1:3310', changeOrigin: true } }
  },
  build: { sourcemap: true }
});
