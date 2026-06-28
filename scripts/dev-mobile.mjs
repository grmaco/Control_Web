/**
 * 모바일 즉시 확인 — Vite + Cloudflare Quick Tunnel
 *
 * npm run dev:mobile          → dev(5173) + HMR, 코드 저장 시 모바일 자동 반영
 * npm run dev:mobile:preview  → build --watch + preview(4173), 저장 후 모바일 새로고침
 */
import { spawn, spawnSync } from 'node:child_process'
import { createConnection } from 'node:net'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const previewMode = process.argv.includes('--preview')
const port = previewMode ? 4173 : 5173
const children = []
let tunnelUrlPrinted = false

function getLanIp() {
  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address
      }
    }
  }
  return null
}

function waitForPort(targetPort, host = '127.0.0.1', timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now()

    const attempt = () => {
      const socket = createConnection({ port: targetPort, host })
      socket.on('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.on('error', () => {
        socket.destroy()
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`포트 ${targetPort} 대기 시간 초과`))
          return
        }
        setTimeout(attempt, 400)
      })
    }

    attempt()
  })
}

function spawnLogged(label, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    shell: true,
    env: { ...process.env, ...env },
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  child.stdout?.on('data', (chunk) => process.stdout.write(chunk))
  child.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk)
    maybePrintTunnelUrl(chunk.toString())
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`\n[${label}] 종료 (${signal})`)
    } else if (code && code !== 0) {
      console.log(`\n[${label}] 종료 (code ${code})`)
    }
  })

  children.push(child)
  return child
}

function maybePrintTunnelUrl(text) {
  if (tunnelUrlPrinted) return
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)
  if (!match) return

  tunnelUrlPrinted = true
  const lan = getLanIp()

  console.log('\n========================================')
  console.log('  모바일 접속 (LTE/5G · IP 입력 없음)')
  console.log(`  ${match[0]}`)
  if (lan) {
    console.log('')
    console.log('  같은 Wi-Fi')
    console.log(`  http://${lan}:${port}`)
  }
  if (previewMode) {
    console.log('')
    console.log('  preview 모드 — 저장 후 모바일에서 새로고침')
  } else {
    console.log('')
    console.log('  dev 모드 — 저장하면 모바일 HMR 자동 반영')
  }
  console.log('========================================\n')
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

async function main() {
  console.log('')
  console.log(previewMode ? '▶ 모바일 preview (watch build)' : '▶ 모바일 dev (HMR)')
  console.log('  종료: Ctrl+C')
  console.log('')

  if (previewMode) {
    console.log('[build] 초기 빌드...')
    const initial = spawnSync('npx', ['vite', 'build'], {
      cwd: projectRoot,
      shell: true,
      stdio: 'inherit',
    })
    if (initial.status !== 0) process.exit(initial.status ?? 1)

    spawnLogged('watch', 'npx', ['vite', 'build', '--watch'])
    spawnLogged('preview', 'npx', ['vite', 'preview', '--host', '--port', '4173'])
  } else {
    spawnLogged('dev', 'npx', ['vite', '--host'], { VITE_TUNNEL: '1' })
  }

  console.log(`[wait] localhost:${port} 준비 대기...`)
  await waitForPort(port)
  console.log(`[ok] localhost:${port} 준비됨`)

  spawnLogged('tunnel', 'npx', [
    '--yes',
    'cloudflared',
    'tunnel',
    '--url',
    `http://localhost:${port}`,
  ])
}

main().catch((error) => {
  console.error(error.message ?? error)
  shutdown()
})
