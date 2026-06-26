import { useEffect, useState } from 'react'
import { useConveyorStore } from '../../store/useConveyorStore'

export function LineSelector({ selectOnly = false }: { selectOnly?: boolean }) {
  const lines = useConveyorStore((s) => s.lines)
  const selectedLineId = useConveyorStore((s) => s.selectedLineId)
  const selectLine = useConveyorStore((s) => s.selectLine)
  const createLine = useConveyorStore((s) => s.createLine)
  const logApplication = useConveyorStore((s) => s.logApplication)

  if (lines.length === 0) {
    if (selectOnly) {
      return (
        <span className="app-chip text-slate-500">
          등록된 라인 없음
        </span>
      )
    }

    return (
      <button
        type="button"
        onClick={async () => {
          const line = await createLine('새 라인')
          void logApplication({
            title: 'Button Click',
            comment: `Line Create: ${line.name}`,
            lineId: line.id,
          })
        }}
        className="app-btn app-btn-primary app-btn-md"
      >
        첫 라인 만들기
      </button>
    )
  }

  return (
    <select
      value={selectedLineId ?? ''}
      onChange={(e) => {
        const lineId = e.target.value || null
        selectLine(lineId)
        if (lineId) {
          const line = lines.find((item) => item.id === lineId)
          void logApplication({
            title: 'Button Click',
            comment: `Line Select: ${line?.name ?? lineId}`,
            lineId,
          })
        }
      }}
      className="app-input w-full rounded-md px-3 py-1.5 text-sm text-slate-100"
    >
      {lines.map((line) => (
        <option key={line.id} value={line.id}>
          {line.name}
        </option>
      ))}
    </select>
  )
}

interface LineSelectorPanelProps {
  onCreateLine?: () => void
  /** true: 드롭다운 선택만 (주화면·라인 현황) */
  selectOnly?: boolean
}

export function LineSelectorPanel({ onCreateLine, selectOnly = false }: LineSelectorPanelProps) {
  if (selectOnly) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <LineSelector selectOnly />
      </div>
    )
  }

  return <LineSelectorPanelFull onCreateLine={onCreateLine} />
}

function LineSelectorPanelFull({ onCreateLine }: Pick<LineSelectorPanelProps, 'onCreateLine'>) {
  const lines = useConveyorStore((s) => s.lines)
  const selectedLineId = useConveyorStore((s) => s.selectedLineId)
  const createLine = useConveyorStore((s) => s.createLine)
  const renameLine = useConveyorStore((s) => s.renameLine)
  const deleteLine = useConveyorStore((s) => s.deleteLine)
  const logApplication = useConveyorStore((s) => s.logApplication)

  const selectedLine = lines.find((line) => line.id === selectedLineId) ?? null
  const [draftName, setDraftName] = useState(selectedLine?.name ?? '')

  useEffect(() => {
    setDraftName(selectedLine?.name ?? '')
  }, [selectedLineId, selectedLine?.name])

  const commitRename = async () => {
    if (!selectedLineId) return

    const trimmed = draftName.trim()
    if (!trimmed) {
      setDraftName(selectedLine?.name ?? '')
      return
    }

    if (trimmed !== selectedLine?.name) {
      await renameLine(selectedLineId, trimmed)
      void logApplication({
        title: 'Button Click',
        comment: `Line Rename: ${trimmed}`,
        lineId: selectedLineId,
      })
    }
  }

  const handleDelete = async () => {
    if (!selectedLineId || !selectedLine) return

    const confirmed = window.confirm(
      `"${selectedLine.name}" 라인을 삭제할까요?\n배치한 유닛과 설정이 모두 삭제됩니다.`,
    )
    if (!confirmed) return

    const deletedName = selectedLine.name
    const deletedId = selectedLineId
    await deleteLine(deletedId)
    void logApplication({
      title: 'Button Click',
      comment: `Line Delete: ${deletedName}`,
      lineId: deletedId,
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-400">라인</span>
      <LineSelector />
      {selectedLine && (
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={() => commitRename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            }
            if (e.key === 'Escape') {
              setDraftName(selectedLine.name)
              e.currentTarget.blur()
            }
          }}
          placeholder="라인 이름"
          className="app-input w-40 rounded-md px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
        />
      )}
      <button
        type="button"
        onClick={async () => {
          const line = await createLine(`라인 ${Date.now().toString().slice(-4)}`)
          void logApplication({
            title: 'Button Click',
            comment: `Line Create: ${line.name}`,
            lineId: line.id,
          })
          onCreateLine?.()
        }}
        className="app-btn app-btn-secondary app-btn-sm"
      >
        + 새 라인
      </button>
      {selectedLine && (
        <button
          type="button"
          onClick={() => void handleDelete()}
          className="app-btn app-btn-danger app-btn-sm"
        >
          라인 삭제
        </button>
      )}
    </div>
  )
}

export function useInitializeStore() {
  const initialize = useConveyorStore((s) => s.initialize)
  const isLoading = useConveyorStore((s) => s.isLoading)
  const error = useConveyorStore((s) => s.error)

  useEffect(() => {
    initialize()
  }, [initialize])

  return { isLoading, error }
}
