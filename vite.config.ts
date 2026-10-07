import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/epub+zip': ['.epub'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
  'application/rtf': ['.rtf'],
  'text/plain': ['.txt', '.srt', '.vtt'],
  'text/markdown': ['.md', '.markdown'],
  'text/html': ['.html', '.htm'],
};

export default defineConfig({
  base: './',
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Lumen — Speed Reading Trainer',
        short_name: 'Lumen',
        description: 'Evidence-based speed reading trainer for any text or file.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f7f6f2',
        theme_color: '#f7f6f2',
        categories: ['education', 'productivity', 'books'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // share text/links from other apps into Lumen (Android, desktop Chrome)
        share_target: { action: './', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        // "Open with Lumen" for documents (desktop Chromium)
        file_handlers: [{ action: './', accept: ACCEPT }],
        launch_handler: { client_mode: 'focus-existing' },
      },
      workbox: {
        // first install takes control right away (offline + OCR prefetch); updates still wait for the user's OK
        clientsClaim: true,
        // app shell incl. PDF worker; OCR engine is cached on first use instead
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,webmanifest}'],
        globIgnores: ['ocr/**'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/ocr/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ocr', expiration: { maxEntries: 10 } },
          },
        ],
      },
    }),
  ],
});
