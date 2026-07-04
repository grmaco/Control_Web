import { useState } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import { useConveyorStore } from '../../store/useConveyorStore'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import { useLineCommStatus } from '../../hooks/useLineCommStatus'
import { COMM_STATE_DOT, COMM_STATE_LABEL } from '../../semicnv/lineCommStatus'

interface Props {
  line: ConveyorLine
}

export function LineV3UrlSetting({ line }: Props) {
  const saveLine = useConveyorStore((s) => s.saveLine)
  const connect = useSemiCnvStore((s) => s.connect)
  const comm = useLineCommStatus(line)

  const [open, setOpen] = useState(false)
  const [inputUrl, setInputUrl] = useState('')

  const currentUrl = line.semiCnvWsUrl?.trim() ?? ''

  function openPanel() {
    setInputUrl(currentUrl)
    setOpen(true)
  }

  async function apply() {
    const url = inputUrl.trim()
    await saveLine({ ...line, semiCnvWsUrl: url || undefined })
    connect()
    setOpen(false)
  }

  const dotClass = comm ? COMM_STATE_DOT[comm.state] : 'bg-slate-600'
  const statusLabel = comm ? COMM_STATE_LABEL[comm.state] : '미선택'

  return (
    <>
      <button
        type="button"
        onClick={openPanel}
        className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
      >
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        V3 연결 · {statusLabel}
        {currentUrl && (
          <span className="max-w-[140px] truncate text-slate-500">
            {currentUrl.replace('ws://', '').replace('/ws/dashboard', '').replace('/', '')}
          </span>
        )}
        <svg className="h-3 w-3 opacity-50" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-slate-600 bg-slate-800 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-sm font-medium text-slate-200">
              {line.name} · V3 연결 설정
            </p>
            <p className="mb-3 text-xs text-slate-500">
              이 라인 전용 V3 URL (비우면 전역 URL 사용)
            </p>

            <label className="mb-1 block text-xs text-slate-400">V3 PC WebSocket URL</label>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void apply()}
              placeholder="ws://192.168.0.10:8765/ws/dashboard"
              className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-base text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none sm:py-1.5 sm:text-xs"
            />
            <p className="mt-1 text-xs text-slate-500">
              예) <code className="text-slate-400">ws://10.200.31.191:8765/ws/dashboard</code>
            </p>

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-700 sm:py-1 sm:text-xs"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void apply()}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 sm:py-1 sm:text-xs"
              >
                적용 및 재연결
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
