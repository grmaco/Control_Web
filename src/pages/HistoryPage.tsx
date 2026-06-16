import { useEffect, useState } from 'react'
import { useInitializeStore } from '../components/common/LineSelector'
import type { HistoryEventType } from '../types/conveyor'
import { useConveyorStore } from '../store/useConveyorStore'

const EVENT_LABELS: Record<HistoryEventType, string> = {
  start: '가동 시작',
  stop: '정지',
  error: '오류',
  maintenance: '점검',
  statusChange: '상태 변경',
}

export function HistoryPage() {
  const { isLoading, error } = useInitializeStore()
  const lines = useConveyorStore((s) => s.lines)
  const history = useConveyorStore((s) => s.history)
  const fetchHistory = useConveyorStore((s) => s.fetchHistory)

  const [lineFilter, setLineFilter] = useState('')
  const [eventFilter, setEventFilter] = useState<HistoryEventType | ''>('')

  useEffect(() => {
    fetchHistory({
      lineId: lineFilter || undefined,
      eventType: eventFilter || undefined,
    })
  }, [fetchHistory, lineFilter, eventFilter])

  if (isLoading) {
    return <StateBox message="이력을 불러오는 중..." />
  }

  if (error) {
    return <StateBox message={error} error />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">이력</h2>
          <p className="mt-1 text-sm text-slate-400">최근 {history.length}건</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={lineFilter}
            onChange={(e) => setLineFilter(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm"
          >
            <option value="">전체 라인</option>
            {lines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.name}
              </option>
            ))}
          </select>

          <select
            value={eventFilter}
            onChange={(e) =>
              setEventFilter((e.target.value as HistoryEventType | '') || '')
            }
            className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm"
          >
            <option value="">전체 이벤트</option>
            {Object.entries(EVENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {history.length === 0 ? (
        <StateBox message="표시할 이력이 없습니다." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">시각</th>
                <th className="px-4 py-3 font-medium">이벤트</th>
                <th className="px-4 py-3 font-medium">메시지</th>
                <th className="px-4 py-3 font-medium">작업자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-950/50">
              {history.map((record) => (
                <tr key={record.id} className="text-slate-300">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                    {new Date(record.timestamp).toLocaleString('ko-KR')}
                  </td>
                  <td className="px-4 py-3">
                    {EVENT_LABELS[record.eventType] ?? record.eventType}
                  </td>
                  <td className="px-4 py-3">{record.message}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {record.operator ?? '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        Milestone 4: 상태 변경 시 자동 이력 기록 · CSV 내보내기 예정
      </p>
    </div>
  )
}

function StateBox({ message, error }: { message: string; error?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-12 text-center text-sm ${
        error
          ? 'border-red-900 bg-red-950/30 text-red-300'
          : 'border-slate-800 bg-slate-900 text-slate-400'
      }`}
    >
      {message}
    </div>
  )
}
