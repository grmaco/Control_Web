import type { ConveyorLine } from '../types/conveyor'

export function applyLineOrder(
  lines: ConveyorLine[],
  order?: string[],
): ConveyorLine[] {
  if (!order?.length) return lines

  const byId = new Map(lines.map((line) => [line.id, line]))
  const ordered: ConveyorLine[] = []
  const seen = new Set<string>()

  for (const id of order) {
    const line = byId.get(id)
    if (!line) continue
    ordered.push(line)
    seen.add(id)
  }

  for (const line of lines) {
    if (!seen.has(line.id)) ordered.push(line)
  }

  return ordered
}

export function syncLineOrder(
  order: string[] | undefined,
  lines: ConveyorLine[],
): string[] {
  return applyLineOrder(lines, order).map((line) => line.id)
}

export function reorderLineIds(
  order: string[],
  activeId: string,
  overId: string,
): string[] {
  const oldIndex = order.indexOf(activeId)
  const newIndex = order.indexOf(overId)
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return order

  const next = [...order]
  const [removed] = next.splice(oldIndex, 1)
  next.splice(newIndex, 0, removed)
  return next
}
