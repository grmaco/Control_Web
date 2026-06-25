import type { ConveyorLine, ConveyorUnit } from '../types/conveyor'
import type { SemiCnvUnitRuntime } from '../types/semicnv'

/** CV 컨베이어 유닛 (포트·적재창고 제외) */
export function isCvUnit(unit: ConveyorUnit): boolean {
  return unit.type !== 'port' && unit.type !== 'storage'
}

/** 라인 내 CV 유닛 수 */
export function countCvUnits(line: ConveyorLine): number {
  return line.units.filter(isCvUnit).length
}

/** 모듈 위 CST(자재) 존재 — 테스트 플래그 또는 Semi C/V 런타임 */
export function unitHasMaterial(
  unit: Pick<ConveyorUnit, 'id' | 'testMaterial'>,
  unitRuntime: Record<string, SemiCnvUnitRuntime>,
): boolean {
  if (unit.testMaterial === 1) return true

  const cstId = unitRuntime[unit.id]?.cstId
  return Boolean(cstId && cstId.trim())
}

/** 미니맵 자재(CST) 네온 — 시뮬 중 테스트 자재는 이동 위치만 표시 */
export function unitShowsMinimapMaterial(
  unit: Pick<ConveyorUnit, 'id' | 'testMaterial'>,
  unitRuntime: Record<string, SemiCnvUnitRuntime>,
  options: {
    simulating: boolean
    simulationCstActive: boolean
    staticTestAtOrigin: boolean
  },
): boolean {
  if (options.simulationCstActive) return true

  if (unit.testMaterial === 1) {
    if (options.simulating) return options.staticTestAtOrigin
    return true
  }

  const cstId = unitRuntime[unit.id]?.cstId
  return Boolean(cstId && cstId.trim())
}

/** 라인 내 CST(자재) 보유 모듈 수 */
export function countLineMaterialUnits(
  line: ConveyorLine,
  unitRuntime: Record<string, SemiCnvUnitRuntime> = {},
): number {
  return line.units.filter(
    (unit) => isCvUnit(unit) && unitHasMaterial(unit, unitRuntime),
  ).length
}
