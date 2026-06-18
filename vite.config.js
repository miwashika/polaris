import { defineConfig } from 'vite';
import react            from '@vitejs/plugin-react';
import { VitePWA }      from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name:             'Polaris — 第2領域ボード',
        short_name:       'Polaris',
        description:      '脳の負荷を下げる第2領域タスク管理',
        theme_color:      '#1C8C84',
        background_color: '#F4F6F8',
        display:          'standalone',
        start_url:        '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
