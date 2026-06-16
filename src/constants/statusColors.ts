import type { ConveyorStatus } from '../types/conveyor'

export const STATUS_COLORS: Record<
  ConveyorStatus,
  { bg: string; border: string; label: string }
> = {
  running: { bg: 'bg-emerald-500', border: 'border-emerald-600', label: '가동' },
  idle: { bg: 'bg-slate-400', border: 'border-slate-500', label: '대기' },
  error: { bg: 'bg-red-500', border: 'border-red-600', label: '오류' },
  maintenance: {
    bg: 'bg-amber-500',
    border: 'border-amber-600',
    label: '점검',
  },
}
