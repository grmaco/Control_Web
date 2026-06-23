import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    /** 같은 Wi‑Fi의 다른 기기(iPhone 등)에서 접속 가능하도록 LAN에 바인딩 */
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
})
