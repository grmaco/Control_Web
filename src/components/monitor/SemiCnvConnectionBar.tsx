import { useState } from 'react'
import { useLineCommStatus } from '../../hooks/useLineCommStatus'
import { DEFAULT_SEMICNV_WS_URL } from '../../constants/semicnv'
import { formatLastReceived } from '../../semicnv/lineCommStatus'
import { useConveyorStore } from '../../store/useConveyorStore'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import type { SemiCnvConnectionState } from '../../types/semicnv'
import { LineCommIndicator } from './LineCommIndicator'

const SERVER_STATE_LABEL: Record<SemiCnvConnectionState, string> = {
  disconnected: '연결 끊김',
  connecting: '연결 중…',
  connected: '연결됨',
  error: '오류',
}

const SERVER_STATE_COLOR: Record<SemiCnvConnectionState, string> = {
  disconnected: 'bg-slate-600',
  connecting: 'bg-amber-500 animate-pulse',
  connected: 'bg-emerald-500',
  error: 'bg-red-500',
}

export function SemiCnvConnectionBar() {
  const settings = useSemiCnvStore((s) => s.settings)
  const connectionState = useSemiCnvStore((s) => s.connectionState)
  const siteStatus = useSemiCnvStore((s) => s.siteStatus)
  const lines = useConveyorStore((s) => s.lines)
  const selectedLineId = useConveyorStore((s) => s.selectedLineId)
  const updateSettings = useConveyorStore((s) => s.updateSettings)
  const appSettings = useConveyorStore((s) => s.settings)

  const selectedLine = lines.find((line) => line.id === selectedLineId) ?? null
  const comm = useLineCommStatus(selectedLine)

  const [showConfig, setShowConfig] = useState(false)
  const [inputUrl, setInputUrl] = useState('')

  function openConfig() {
    setInputUrl(settings.wsUrl ?? DEFAULT_SEMICNV_WS_URL)
    setShowConfig(true)
  }

  function applyConfig() {
    const trimmed = inputUrl.trim()
    if (!trimmed) return
    updateSettings({
      ...appSettings,
      semiCnv: {
        ...(appSettings.semiCnv ?? {}),
        wsUrl: trimmed,
        enabled: true,
      },
    })
    setShowConfig(false)
  }

  function toggleEnabled() {
    updateSettings({
      ...appSettings,
      semiCnv: {
        ...(appSettings.semiCnv ?? {}),
        enabled: !settings.enabled,
      },
    })
  }

  if (!settings.enabled) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="h-2 w-2 rounded-full bg-slate-700" />
        Semi C/V · 로컬
        <button
          onClick={toggleEnabled}
          className="ml-1 rounded px-1.5 py-0.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-slate-200"
        >
          연결 켜기
        </button>
      </div>
    )
  }

  const site = comm?.siteId ? siteStatus[comm.siteId] : null
  const siteOnline = site?.online ?? false

  return (
    <div className="relative flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
      {/* 서버 상태 */}
      <span
        className="flex cursor-pointer items-center gap-1.5"
        title={`관제 서버 · ${settings.wsUrl ?? DEFAULT_SEMICNV_WS_URL}`}
        onClick={openConfig}
      >
        <span className={`h-2 w-2 rounded-full ${SERVER_STATE_COLOR[connectionState]}`} />
        서버 · {SERVER_STATE_LABEL[connectionState]}
        {settings.mockMode ? ' (Mock)' : ''}
        {/* 설정 아이콘 */}
        <svg
          className="ml-0.5 h-3 w-3 opacity-50 hover:opacity-100"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
            clipRule="evenodd"
          />
        </svg>
      </span>

      {!selectedLine ? (
        <span className="text-slate-500">라인 미선택</span>
      ) : comm ? (
        <>
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="font-medium">{selectedLine.name}</span>
            <LineCommIndicator comm={comm} compact />
          </span>

          {comm.siteId ? (
            <span
              className={siteOnline ? 'text-emerald-400' : 'text-red-400'}
              title={
                comm.lastMessageAt
                  ? `마지막 수신: ${formatLastReceived(comm.lastMessageAt)}`
                  : undefined
              }
            >
              현장 {siteOnline ? 'Online' : 'Offline'}
              {comm.siteName || comm.siteId ? ` · ${comm.siteName ?? comm.siteId}` : ''}
            </span>
          ) : null}
        </>
      ) : null}

      {/* 설정 팝오버 */}
      {showConfig && (
        <>
          {/* 배경 클릭으로 닫기 */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowConfig(false)}
          />
          <div className="absolute left-0 top-6 z-50 w-80 rounded-lg border border-slate-600 bg-slate-800 p-4 shadow-xl">
            <p className="mb-3 text-sm font-medium text-slate-200">V3 서버 연결 설정</p>

            <label className="mb-1 block text-xs text-slate-400">
              WebSocket URL (V3 PC의 IP 입력)
            </label>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyConfig()}
              placeholder="ws://192.168.0.10:8765/ws/dashboard"
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              V3와 Web이 같은 PC면 <code className="text-slate-400">localhost</code>
              , 다른 PC면 V3 PC의 IP 주소
            </p>

            <div className="mt-3 flex items-center justify-between">
              <button
                onClick={toggleEnabled}
                className="text-xs text-slate-500 hover:text-red-400"
              >
                연결 끄기
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfig(false)}
                  className="rounded px-3 py-1 text-xs text-slate-400 hover:bg-slate-700"
                >
                  취소
                </button>
                <button
                  onClick={applyConfig}
                  className="rounded bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-500"
                >
                  적용
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
