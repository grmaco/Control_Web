import { useMemo, useState } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import { STATUS_COLORS } from '../../constants/statusColors'
import { MonitorCanvas } from './MonitorCanvas'
import { MonitorDashboard } from './MonitorDashboard'
import { CvStatusPanel } from './CvStatusPanel'
import { V3LogPanel } from './V3LogPanel'

type Tab = 'canvas' | 'map' | 'cv' | 'v3log'

const TABS: { key: Tab; label: string }[] = [
  { key: 'canvas', label: '모니터링' },
  { key: 'map',    label: 'I/O 상태' },
  { key: 'cv',     label: 'CV 현황' },
  { key: 'v3log',  label: 'V3 이력' },
]

interface MonitorTabViewProps {
  line: ConveyorLine
  lines: ConveyorLine[]
  selectedLineId: string | null
}

export function MonitorTabView({ line, lines, selectedLineId }: MonitorTabViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('canvas')
  const unitRuntime = useSemiCnvStore((s) => s.unitRuntime)
  const v3Logs = useSemiCnvStore((s) => s.v3Logs)
  const newLogCount = useMemo(() => v3Logs.length, [v3Logs])

  return (
    <div className="space-y-0">
      {/* 탭 헤더 — 모바일에서 가로 스크롤 */}
      <div className="flex overflow-x-auto border-b border-slate-700 scrollbar-none">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`relative flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors sm:px-5 sm:py-2.5 ${
              activeTab === key
                ? 'text-cyan-400 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-cyan-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
            {key === 'v3log' && newLogCount > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-600 px-1.5 py-0.5 text-[10px] text-slate-300">
                {newLogCount > 999 ? '999+' : newLogCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {/* 모니터링 큰 맵 — 탭 전환 시 상태 유지를 위해 hidden으로 처리 */}
        <div className={activeTab === 'canvas' ? undefined : 'hidden'} aria-hidden={activeTab !== 'canvas'}>
          <div className="mb-3 flex flex-wrap gap-3 text-xs">
            {Object.entries(STATUS_COLORS).map(([status, colors]) => (
              <span key={status} className="flex items-center gap-1.5 text-slate-400">
                <span className={`h-3 w-3 rounded-sm ${colors.bg}`} />
                {colors.label}
              </span>
            ))}
          </div>
          <MonitorCanvas line={line} />
        </div>

        {activeTab === 'map' && (
          <MonitorDashboard
            line={line}
            lines={lines}
            selectedLineId={selectedLineId}
            showIOPanels
          />
        )}

        {activeTab === 'cv' && (
          <CvStatusPanel lines={lines} unitRuntime={unitRuntime} selectedLine={line} />
        )}

        {activeTab === 'v3log' && (
          <V3LogPanel logs={v3Logs} />
        )}
      </div>
    </div>
  )
}
