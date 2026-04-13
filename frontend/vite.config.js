// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    react({
      // ensure Babel mode (not SWC)
      jsxRuntime: 'automatic',
      jsxImportSource: '@emotion/react',
      // pass Emotion plugin explicitly to the Babel transform
      babel: {
        plugins: [
          ['@emotion/babel-plugin', { sourceMap: true, autoLabel: 'dev-only', labelFormat: '[local]' }]
        ]
      }
    }),
    tailwindcss()
  ]
});
