import { useState } from 'react'
import type { ConveyorLine } from '../../types/conveyor'
import { useSemiCnvStore } from '../../store/useSemiCnvStore'
import { MonitorDashboard } from './MonitorDashboard'
import { IOStatusPanel } from './IOStatusPanel'
import { CvStatusPanel } from './CvStatusPanel'

type Tab = 'map' | 'io' | 'cv'

const TABS: { key: Tab; label: string }[] = [
  { key: 'map', label: '모니터링 맵' },
  { key: 'io',  label: 'I/O 상태' },
  { key: 'cv',  label: 'CV 현황' },
]

interface MonitorTabViewProps {
  line: ConveyorLine
  lines: ConveyorLine[]
  selectedLineId: string | null
}

export function MonitorTabView({ line, lines, selectedLineId }: MonitorTabViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('map')
  const ioStatus = useSemiCnvStore((s) => s.ioStatus)
  const unitRuntime = useSemiCnvStore((s) => s.unitRuntime)

  return (
    <div className="space-y-0">
      {/* 탭 헤더 */}
      <div className="flex border-b border-slate-700">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`relative px-5 py-2.5 text-sm font-medium transition-colors ${
              activeTab === key
                ? 'text-cyan-400 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-cyan-500'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="pt-4">
        {activeTab === 'map' && (
          <div className="space-y-6">
            {/* 3-panel 그리드를 I/O 패널(Safety/Auto/Program)로 교체한 대시보드 */}
            <MonitorDashboard
              line={line}
              lines={lines}
              selectedLineId={selectedLineId}
              showIOPanels
            />

            {/* CV 현황 그리드 */}
            <section>
              <h3 className="mb-3 text-sm font-semibold tracking-wide text-slate-400">
                CV 현황
              </h3>
              <CvStatusPanel lines={lines} unitRuntime={unitRuntime} />
            </section>
          </div>
        )}

        {activeTab === 'io' && (
          <IOStatusPanel ioStatus={ioStatus} />
        )}

        {activeTab === 'cv' && (
          <CvStatusPanel lines={lines} unitRuntime={unitRuntime} />
        )}
      </div>
    </div>
  )
}
