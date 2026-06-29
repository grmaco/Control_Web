import type { SemiCnvAutoStatus, SemiCnvUnitRuntime } from '../types/semicnv'

export type CalloutTransferStatus = 'LD' | 'ULD' | 'BUSY'

export const CALLOUT_TRANSFER_STATUS_LABEL: Record<CalloutTransferStatus, string> = {
  LD: 'LD',
  ULD: 'ULD',
  BUSY: 'BUSY',
}

/** V3 런타임 — CST 유무 + autoStatus 기반 LD / ULD / BUSY */
export function resolveLiveTransferStatus(
  runtime: SemiCnvUnitRuntime | undefined,
  hasCst: boolean,
): CalloutTransferStatus {
  const autoStatus: SemiCnvAutoStatus = runtime?.autoStatus ?? 'None'

  if (autoStatus === 'Busy') return 'BUSY'
  if (autoStatus === 'Load') return 'LD'
  if (autoStatus === 'Unload') return 'ULD'

  return hasCst ? 'ULD' : 'LD'
}
