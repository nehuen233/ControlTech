import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// El proxy envia /api al servidor Express para evitar problemas de CORS en desarrollo.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 127.0.0.1 evita que en Windows "localhost" se resuelva a IPv6 (::1).
      '/api': process.env.VITE_API_TARGET || 'http://127.0.0.1:4000',
    },
  },
})
