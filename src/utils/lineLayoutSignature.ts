import type { ConveyorLine } from '../types/conveyor'

/** 라인 배치 변경 감지 — updatedAt과 무관하게 유닛 위치·연결만 비교 */
export function lineLayoutSignature(line: ConveyorLine): string {
  if (line.units.length === 0) return `${line.id}:empty`

  const units = [...line.units].sort((a, b) => a.id.localeCompare(b.id))
  return units
    .map((unit) => {
      const links = [...unit.connections].sort().join('.')
      return `${unit.id}@${unit.gridX},${unit.gridY}:${unit.type}:${unit.rotation}:${links}`
    })
    .join('|')
}
