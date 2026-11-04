import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// El proxy envia /api al servidor Express para evitar problemas de CORS en desarrollo.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_API_TARGET || 'http://localhost:4000',
    },
  },
})
