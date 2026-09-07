import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    // The UI reads everything from the API — no verdict, mpe or applicability decision is
    // ever computed in the browser (see src/lib/api.ts). Proxying keeps the client on a
    // same-origin `/api` path in development and in production alike, so there is no
    // CORS setup and no environment-specific base URL to get wrong.
    proxy: {
      '/api': {
        target: process.env['TULASETU_API'] ?? 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
