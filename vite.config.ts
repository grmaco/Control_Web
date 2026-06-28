import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** npm run dev:mobile — Cloudflare 터널용 HMR (PC localhost dev에는 영향 없음) */
const useTunnelHmr = process.env.VITE_TUNNEL === '1'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    /** 같은 Wi‑Fi의 다른 기기(iPhone 등)에서 접속 가능하도록 LAN에 바인딩 */
    host: true,
    port: 5173,
    /** localtunnel·Cloudflare 등 외부 터널 호스트 허용 */
    allowedHosts: true,
    hmr: useTunnelHmr
      ? { protocol: 'wss', clientPort: 443 }
      : true,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
})
