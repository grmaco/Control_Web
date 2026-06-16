import { useEffect, useRef, useState } from 'react'

export function BufferStoragePanel({ utilization }: { utilization: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [gaugeSize, setGaugeSize] = useState(0)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateSize = () => {
      const { clientWidth, clientHeight } = element
      const size = Math.min(clientWidth, clientHeight)
      setGaugeSize(Math.floor(size * 0.92))
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const radius = 52
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (utilization / 100) * circumference
  const labelSize = gaugeSize > 0 ? Math.max(14, Math.round(gaugeSize * 0.14)) : 20
  const subLabelSize = gaugeSize > 0 ? Math.max(9, Math.round(gaugeSize * 0.07)) : 10

  return (
    <div className="flex min-h-[280px] flex-col rounded border border-slate-700 bg-slate-900/80 p-4">
      <h3 className="text-xs font-semibold tracking-wide text-slate-400">
        BUFFER STORAGE
      </h3>

      <div
        ref={containerRef}
        className="mt-4 flex min-h-0 flex-1 items-center justify-center"
      >
        {gaugeSize > 0 ? (
          <div
            className="relative shrink-0"
            style={{ width: gaugeSize, height: gaugeSize }}
          >
            <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                className="text-slate-800"
              />
              <circle
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className="text-emerald-500 transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="font-bold text-white"
                style={{ fontSize: labelSize }}
              >
                {utilization.toFixed(2)}%
              </span>
              <span className="text-slate-500" style={{ fontSize: subLabelSize }}>
                Utilization
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
