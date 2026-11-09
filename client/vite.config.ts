import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Pre-launch testing runs through a TryCloudflare quick tunnel whose hostname changes on every restart.
// A leading dot allows any *.trycloudflare.com subdomain (plus localhost) and nothing else. Tighten this
// to the real domain once a named tunnel / custom domain exists.
const allowedHosts = ['.trycloudflare.com'];

export default defineConfig({
  plugins: [svelte()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    proxy: { '/api': 'http://localhost:8787' },
    allowedHosts,
  },
  preview: {
    allowedHosts,
  },
});
