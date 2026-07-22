// 최소 preload — contextIsolation 유지, 렌더러에 안전한 데스크톱 정보만 노출.
// 렌더러 코드에서 window.desktop 으로 데스크톱 여부/플랫폼을 확인할 수 있다.
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
})
