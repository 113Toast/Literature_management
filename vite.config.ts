import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './', // HashRouter + 相對路徑，部署在任何 repo 子路徑皆可
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '文獻庫', short_name: '文獻庫', start_url: './', scope: './',
        display: 'standalone', background_color: '#f6f5f1', theme_color: '#1f3a5f',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
        ],
        // 手機系統「分享」→ 開啟 ./?url=...&title=...，由 Library 讀取並預填
        share_target: { action: './', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
      } as any,
    }),
  ],
});
