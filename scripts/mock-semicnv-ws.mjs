/**
 * Semi C/V WebSocket Mock Server (개발용)
 *
 * SemiCnv 프로그램(Client)이 접속하는 중앙 서버 역할을 흉내 내고,
 * Web 대시보드(/ws/dashboard)에는 CONVEYOR_STATUS 등을 브로드캐스트합니다.
 *
 * 실행: npm run dev:semicnv-mock
 */
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.SEMICNV_MOCK_PORT ?? 8765)
const SITE_ID = 'SITE_DEV_FAB1'

const dashboardClients = new Set()
const siteClients = new Set()

function nowIso() {
  return new Date().toISOString()
}

function broadcastDashboard(payload) {
  const json = JSON.stringify(payload)
  for (const client of dashboardClients) {
    if (client.readyState === 1) client.send(json)
  }
}

function buildSiteConnect() {
  return {
    type: 'SITE_CONNECT',
    siteId: SITE_ID,
    timestamp: nowIso(),
    data: {
      siteName: 'Mock A공장 1라인',
      programVersion: 'Semi_Conv_V3.2.1-mock',
      lineCount: 1,
      conveyorCount: 4,
    },
  }
}

function buildLineStatus(running) {
  return {
    type: 'LINE_STATUS',
    siteId: SITE_ID,
    timestamp: nowIso(),
    data: [
      {
        lineId: 1,
        lineName: '1라인',
        safetyStatus: 'OK',
        keyStatus: 'Auto',
        autoCondition: 'Possible',
        operationStatus: 'Auto',
        controlMode: 'MasterMode',
        totalConveyors: 4,
        runningConveyors: running,
        alarmConveyors: 0,
      },
    ],
  }
}

function buildConveyorStatus(tick) {
  const busy = tick % 4
  return {
    type: 'CONVEYOR_STATUS',
    siteId: SITE_ID,
    timestamp: nowIso(),
    data: [
      {
        id: 1,
        lineId: 1,
        name: 'CV-01',
        conveyorType: 'Normal',
        controlMode: 'MasterMode',
        runStatus: busy === 0 ? 'Run' : 'Stop',
        operationStatus: 'Auto',
        autoStatus: busy === 0 ? 'Busy' : 'Idle',
        autoStep: 110 + (tick % 90),
        power: 'On',
        alarm: false,
        cstId: busy === 0 ? 'FOUP00231' : null,
        destination: busy === 0 ? 45 : 0,
      },
      {
        id: 2,
        lineId: 1,
        name: 'CV-02',
        conveyorType: 'Turn',
        controlMode: 'MasterMode',
        runStatus: busy === 1 ? 'Run' : 'Stop',
        operationStatus: 'Auto',
        autoStatus: busy === 1 ? 'Load' : 'Idle',
        autoStep: 320,
        power: 'On',
        alarm: false,
        cstId: null,
        destination: 0,
        currentDegree: 'Degree90_Pos',
      },
      {
        id: 3,
        lineId: 1,
        name: 'CV-03',
        conveyorType: 'Normal',
        controlMode: 'MasterMode',
        runStatus: 'Stop',
        operationStatus: 'Manual',
        autoStatus: 'Idle',
        autoStep: 0,
        power: 'On',
        alarm: false,
        cstId: null,
        destination: 0,
      },
      {
        id: 4,
        lineId: 1,
        name: 'CV-04',
        conveyorType: 'Up_Down',
        controlMode: 'MasterMode',
        runStatus: 'Stop',
        operationStatus: 'Auto',
        autoStatus: 'Idle',
        autoStep: 0,
        power: 'On',
        alarm: busy === 3,
        cstId: null,
        destination: 0,
      },
    ],
  }
}

function buildHeartbeat() {
  return {
    type: 'HEARTBEAT',
    siteId: SITE_ID,
    timestamp: nowIso(),
    data: { status: 'ALIVE' },
  }
}

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Semi C/V Mock WebSocket Server\n')
})

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  if (url.pathname !== '/ws/dashboard' && url.pathname !== '/ws') {
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (url.pathname === '/ws/dashboard') {
      dashboardClients.add(ws)
      ws.on('close', () => dashboardClients.delete(ws))
      ws.send(JSON.stringify(buildSiteConnect()))
      ws.send(JSON.stringify(buildLineStatus(1)))
      ws.send(JSON.stringify(buildConveyorStatus(0)))
      console.log('[dashboard] connected')
      return
    }

    siteClients.add(ws)
    ws.on('close', () => siteClients.delete(ws))
    ws.send(JSON.stringify({ type: 'ACK', siteId: SITE_ID, timestamp: nowIso(), data: { ok: true } }))
    console.log('[site-client] connected')
  })
})

let tick = 0
setInterval(() => {
  tick += 1
  broadcastDashboard(buildConveyorStatus(tick))
  if (tick % 3 === 0) broadcastDashboard(buildLineStatus((tick % 4) + 1))
  if (tick % 5 === 0) broadcastDashboard(buildHeartbeat())
}, 2000)

server.listen(PORT, () => {
  console.log(`Semi C/V mock WS server: ws://localhost:${PORT}/ws/dashboard`)
})
