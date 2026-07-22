// PCP AI — Electron 메인 프로세스 (데스크톱 셸)
// 순수 클라이언트 SPA를 감싸는 창을 띄운다. 백엔드 서버는 없다.
// 개발: Vite dev 서버(http://localhost:5173) 로드 · 배포: 번들된 dist/index.html 로드.
const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('node:path')

const isDev = !app.isPackaged
const DEV_URL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'

/** 단일 인스턴스 — 두 번째 실행 시 기존 창을 앞으로 */
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    // 로드 전 흰 화면 깜빡임 방지 — 앱 배경(slate-950)과 맞춤
    backgroundColor: '#020617',
    show: false,
    autoHideMenuBar: true,
    title: 'PCP AI',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // 페이지의 <title>(PC제어 관제시스템)이 창 제목을 덮어쓰지 않도록 고정 — 항상 'PCP AI'
  mainWindow.on('page-title-updated', (e) => e.preventDefault())

  // 준비되면 표시 (레이아웃 안착 후 노출)
  mainWindow.once('ready-to-show', () => mainWindow.show())

  // 외부 링크(http/https)는 OS 기본 브라우저로 — 앱 창 안에서 열지 않음
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  if (isDev) {
    void mainWindow.loadURL(DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // 배포 빌드는 HashRouter(file:// 대응)로 동작 — App.tsx에서 protocol 감지
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 두 번째 인스턴스 실행 시 기존 창 복원·포커스
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  // 배포 빌드에서는 기본 메뉴바 제거 (개발 중에는 유지 — DevTools 등 편의)
  if (!isDev) Menu.setApplicationMenu(null)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
