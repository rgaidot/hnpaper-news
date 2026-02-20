import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://hnpaper-news-labs.gaidot.net',
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    AstroPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'HNPaper News',
        short_name: 'HNPaper',
        description: 'Daily news digest from HNPaper',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: null,
      },
    }),
  ],
});
