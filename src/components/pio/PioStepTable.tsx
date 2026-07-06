import type { PioStepMeasure } from '../../types/pio'

const STATUS_STYLE: Record<
  PioStepMeasure['status'],
  { label: string; text: string; dot: string }
> = {
  ok: { label: '정상', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  warn: { label: '주의', text: 'text-amber-300', dot: 'bg-amber-400' },
  over: { label: '기준 초과', text: 'text-red-400', dot: 'bg-red-500' },
  missing: { label: '미측정', text: 'text-slate-500', dot: 'bg-slate-600' },
}

/** 단계별 응답시간(ms) 자동 측정 표 — 기준 대비 편차 표시 */
export function PioStepTable({ measures }: { measures: PioStepMeasure[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-700 text-left text-[10px] uppercase tracking-wider text-slate-500">
            <th className="px-2 py-1.5">단계</th>
            <th className="px-2 py-1.5 text-right">측정 (ms)</th>
            <th className="px-2 py-1.5 text-right">기준 (ms)</th>
            <th className="px-2 py-1.5 text-right">편차</th>
            <th className="px-2 py-1.5">상태</th>
          </tr>
        </thead>
        <tbody>
          {measures.map((m) => {
            const style = STATUS_STYLE[m.status]
            return (
              <tr key={m.step} className="border-b border-slate-800/60">
                <td className="px-2 py-1.5 text-slate-300">{m.label}</td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-200">
                  {m.durationMs != null ? m.durationMs : '—'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-slate-500">
                  {m.baselineMs}
                </td>
                <td
                  className={`px-2 py-1.5 text-right font-mono ${
                    m.deviationMs == null
                      ? 'text-slate-600'
                      : m.deviationMs > 0
                        ? style.text
                        : 'text-cyan-300'
                  }`}
                >
                  {m.deviationMs == null
                    ? '—'
                    : `${m.deviationMs > 0 ? '+' : ''}${m.deviationMs}`}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`inline-flex items-center gap-1.5 ${style.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                    {style.label}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
