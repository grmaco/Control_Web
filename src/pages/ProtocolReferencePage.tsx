import { Fragment, useMemo, useState } from 'react'
import { useInitializeStore } from '../components/common/LineSelector'
import { PageHeader, PageState } from '../components/common/PageUi'
import {
  PROTOCOL_PROGRAMS,
  type ProtocolMessageDef,
  type ProtocolProgramDef,
} from '../constants/protocolCatalog'

function directionBadge(direction: 'rx' | 'tx') {
  return direction === 'rx'
    ? { label: '수신', cls: 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60' }
    : { label: '송신', cls: 'bg-sky-900/60 text-sky-300 border-sky-700/60' }
}

function messageMatches(message: ProtocolMessageDef, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  if (message.type.toLowerCase().includes(q)) return true
  if (message.name.toLowerCase().includes(q)) return true
  if (message.description.toLowerCase().includes(q)) return true
  return message.fields.some(
    (f) => f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q),
  )
}

function ProgramSummary({ program }: { program: ProtocolProgramDef }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
        <span className="text-slate-400">
          통신 <span className="ml-1 font-mono text-slate-200">{program.transport}</span>
        </span>
        <span className="text-slate-400">
          메시지 <span className="ml-1 font-semibold text-slate-200">{program.messages.length}종</span>
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
            program.status === 'active'
              ? 'border-emerald-700/60 bg-emerald-900/60 text-emerald-300'
              : 'border-slate-600 bg-slate-800 text-slate-400'
          }`}
        >
          {program.status === 'active' ? '운영 중' : '정의 예정'}
        </span>
      </div>
      {program.envelopeNote && (
        <p className="mt-2 text-xs leading-relaxed text-slate-500">{program.envelopeNote}</p>
      )}
    </div>
  )
}

function MessageDetail({ message }: { message: ProtocolMessageDef }) {
  return (
    <div className="space-y-3 px-3 py-3">
      {/* 필드 정의 */}
      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead className="bg-slate-800/80 text-slate-400">
            <tr>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">필드</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">타입</th>
              <th className="whitespace-nowrap px-3 py-2 font-semibold">필수</th>
              <th className="px-3 py-2 font-semibold">설명</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {message.fields.map((field) => (
              <tr key={field.name} className="text-slate-300">
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-cyan-300/90">{field.name}</td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-slate-400">{field.type}</td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  {field.required ? (
                    <span className="text-amber-300">필수</span>
                  ) : (
                    <span className="text-slate-500">옵션</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-slate-400">{field.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 예시 JSON */}
      <div>
        <p className="mb-1 text-[11px] font-semibold tracking-wide text-slate-500">예시</p>
        <pre className="max-h-72 overflow-auto rounded border border-slate-800 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-emerald-200/90">
          {JSON.stringify(message.example, null, 2)}
        </pre>
      </div>
    </div>
  )
}

export function ProtocolReferencePage() {
  const { isLoading, error } = useInitializeStore()
  const [programId, setProgramId] = useState(PROTOCOL_PROGRAMS[0].id)
  const [query, setQuery] = useState('')
  const [expandedType, setExpandedType] = useState<string | null>(null)

  const program = useMemo(
    () => PROTOCOL_PROGRAMS.find((p) => p.id === programId) ?? PROTOCOL_PROGRAMS[0],
    [programId],
  )

  const filtered = useMemo(
    () => program.messages.filter((m) => messageMatches(m, query)),
    [program, query],
  )

  if (isLoading) {
    return <PageState message="데이터를 불러오는 중..." />
  }

  if (error) {
    return <PageState message={error} variant="error" />
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="데이터"
        subtitle="각 프로그램과 주고받는 프로토콜 정의를 조회합니다. 메시지를 클릭하면 필드 정의와 예시 JSON이 표시됩니다."
      />

      {/* 프로그램 선택 */}
      <div className="flex flex-wrap gap-2">
        {PROTOCOL_PROGRAMS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => { setProgramId(p.id); setExpandedType(null) }}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              p.id === programId
                ? 'border-cyan-500/50 bg-cyan-950/40 text-cyan-200'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {p.name}
            {p.status === 'planned' && (
              <span className="ml-1.5 text-[10px] text-slate-500">예정</span>
            )}
          </button>
        ))}
      </div>

      <ProgramSummary program={program} />

      {program.status === 'planned' ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-12 text-center text-sm text-slate-400">
          {program.plannedNote}
        </div>
      ) : (
        <>
          {/* 검색 */}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="타입·이름·필드 검색 (예: CST, cmd, 알람)"
            className="w-full max-w-sm rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
          />

          {/* 메시지 목록 */}
          <div className="overflow-hidden rounded-lg border border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold">방향</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold">TYPE</th>
                    <th className="whitespace-nowrap px-3 py-2.5 font-semibold">이름</th>
                    <th className="px-3 py-2.5 font-semibold">설명</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">필드</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 bg-slate-950/60">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                        검색 결과가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((message) => {
                      const badge = directionBadge(message.direction)
                      const expanded = expandedType === message.type
                      return (
                        <Fragment key={message.type}>
                          <tr
                            onClick={() => setExpandedType(expanded ? null : message.type)}
                            className={`cursor-pointer text-slate-200 hover:bg-slate-900/60 ${
                              expanded ? 'bg-slate-900/80' : ''
                            }`}
                          >
                            <td className="whitespace-nowrap px-3 py-2.5">
                              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 font-mono font-semibold text-cyan-300/90">
                              {message.type}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5">{message.name}</td>
                            <td className="px-3 py-2.5 text-slate-400">{message.description}</td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-400">
                              {message.fields.length}
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-slate-950">
                              <td colSpan={5}>
                                <MessageDetail message={message} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
