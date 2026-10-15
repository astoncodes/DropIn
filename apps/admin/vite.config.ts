import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // Default configuration lives at the repository root. The explicit dev
  // launcher supplies process variables, which take precedence over this file.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),

  server: {
    port: 5173,
    strictPort: true,
  },
});
