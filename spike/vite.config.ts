import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve(__dirname, 'web-client'),
  server: {
    port: 5199,
    host: '127.0.0.1',
  },
});