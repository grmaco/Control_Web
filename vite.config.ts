import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** npm run dev:mobile — Cloudflare 터널용 HMR (PC localhost dev에는 영향 없음) */
const useTunnelHmr = process.env.VITE_TUNNEL === '1'

/**
 * Electron 배포 빌드는 file:// 로 로드되므로 자산 경로가 상대(./)여야 한다.
 * 웹 빌드/개발에는 영향 없음 (기본 '/').
 */
const isElectronBuild = process.env.ELECTRON === '1'

export default defineConfig({
  base: isElectronBuild ? './' : '/',
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
    /**
     * Electron 설치 파일 산출물은 감시 대상에서 제외 — dev 서버가 켜진 채로
     * electron-builder를 돌리면 감시자가 release 폴더를 잠가 rename EPERM이 난다.
     */
    watch: {
      ignored: ['**/release/**', '**/dist/**', '**/release*.zip', '**/*.zip'],
    },
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
})
