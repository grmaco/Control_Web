import { useEffect, useState } from 'react'
import { useConveyorStore } from '../../store/useConveyorStore'

export function LineSelector() {
  const lines = useConveyorStore((s) => s.lines)
  const selectedLineId = useConveyorStore((s) => s.selectedLineId)
  const selectLine = useConveyorStore((s) => s.selectLine)
  const createLine = useConveyorStore((s) => s.createLine)

  if (lines.length === 0) {
    return (
      <button
        type="button"
        onClick={() => createLine('새 라인')}
        className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
      >
        첫 라인 만들기
      </button>
    )
  }

  return (
    <select
      value={selectedLineId ?? ''}
      onChange={(e) => selectLine(e.target.value || null)}
      className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
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
}

export function LineSelectorPanel({ onCreateLine }: LineSelectorPanelProps) {
  const lines = useConveyorStore((s) => s.lines)
  const selectedLineId = useConveyorStore((s) => s.selectedLineId)
  const createLine = useConveyorStore((s) => s.createLine)
  const renameLine = useConveyorStore((s) => s.renameLine)

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

    await renameLine(selectedLineId, trimmed)
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
          className="w-40 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
        />
      )}
      <button
        type="button"
        onClick={async () => {
          await createLine(`라인 ${Date.now().toString().slice(-4)}`)
          onCreateLine?.()
        }}
        className="rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
      >
        + 새 라인
      </button>
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
