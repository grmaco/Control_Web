import { useEffect, useRef, useState } from 'react'
import { useConveyorStore } from '../../store/useConveyorStore'
import {
  applyImportToStorage,
  downloadJson,
  exportAllData,
  parseImportFile,
} from '../../utils/exportImport'

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
      <div className="w-full min-w-0 sm:w-80">
        <LineSelector selectOnly />
      </div>
    )
  }

  return <LineSelectorPanelFull onCreateLine={onCreateLine} />
}

function LineSelectorPanelFull({ onCreateLine }: Pick<LineSelectorPanelProps, 'onCreateLine'>) {
  const lines = useConveyorStore((s) => s.lines)
  const history = useConveyorStore((s) => s.history)
  const selectedLineId = useConveyorStore((s) => s.selectedLineId)
  const createLine = useConveyorStore((s) => s.createLine)
  const renameLine = useConveyorStore((s) => s.renameLine)
  const deleteLine = useConveyorStore((s) => s.deleteLine)
  const logApplication = useConveyorStore((s) => s.logApplication)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const data = exportAllData(lines, history)
    downloadJson(data)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = parseImportFile(ev.target?.result as string)
        if (!window.confirm(`라인 ${data.lines.length}개를 불러옵니다.\n현재 데이터를 덮어씁니다. 계속할까요?`)) return
        applyImportToStorage(data)
        window.location.reload()
      } catch {
        alert('파일 형식이 올바르지 않습니다.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

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
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
      <div className="flex w-full min-w-0 flex-col gap-1.5 sm:w-auto sm:contents">
        <h3 className="shrink-0 text-sm font-medium text-slate-300 sm:mr-0">라인</h3>
        <div
          className={`grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center ${
            selectedLine ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          <div className="min-w-0 sm:w-72">
            <LineSelector />
          </div>
          {selectedLine && (
            <div className="flex min-w-0 items-center gap-2 sm:contents">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void commitRename()
                  }
                  if (e.key === 'Escape') {
                    setDraftName(selectedLine.name)
                    e.currentTarget.blur()
                  }
                }}
                placeholder="라인 이름"
                title="라인 이름 입력 후 변경 버튼으로 적용"
                className="app-input min-w-0 flex-1 rounded-md px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 sm:w-36 sm:flex-none"
              />
              <button
                type="button"
                onClick={() => void commitRename()}
                title="라인 이름 변경"
                aria-label="라인 이름 변경"
                className="app-btn app-btn-secondary app-btn-sm inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center p-0"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
                  />
                </svg>
              </button>
            </div>
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
            className="app-btn app-btn-accent app-btn-sm w-full sm:w-auto"
          >
            라인 추가
          </button>
          {selectedLine && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="app-btn app-btn-danger app-btn-sm w-full sm:w-auto"
            >
              라인 삭제
            </button>
          )}
        </div>
      </div>
      <span className="mx-0.5 hidden h-5 w-px bg-slate-700 sm:block" aria-hidden />
      <div className="flex w-full justify-end gap-2 sm:w-auto">
        <button
          type="button"
          onClick={handleExport}
          title="내보내기"
          aria-label="내보내기"
          className="app-btn app-btn-secondary app-btn-sm inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center p-0"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="불러오기"
          aria-label="불러오기"
          className="app-btn app-btn-secondary app-btn-sm inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center p-0"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
            />
          </svg>
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImport}
      />
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
