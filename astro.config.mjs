import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://hnpaper-news-labs.gaidot.net',
  vite: {
    plugins: [tailwindcss()]
  }
});
