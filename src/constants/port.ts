import type { PortDirection, PortLinkedUnit, PortRecipe } from '../types/conveyor'

export const PORT_DIRECTIONS: PortDirection[] = ['IN', 'OUT']

export const PORT_RECIPES: PortRecipe[] = ['2BP1ST', '2BPCV']

export const PORT_LINKED_UNITS: PortLinkedUnit[] = ['OHT', 'STK', 'AGV']

export const DEFAULT_PORT_DIRECTION: PortDirection = 'IN'
export const DEFAULT_PORT_RECIPE: PortRecipe = '2BP1ST'
export const DEFAULT_PORT_LINKED_UNIT: PortLinkedUnit = 'OHT'

/** 라인 빌더에서 포트 최초 배치 시 할당되는 코드·이름 시작값 */
export const DEFAULT_PORT_NUMBER_START = 30101

export function portDirectionLabel(direction: PortDirection): string {
  return direction
}

export function portRecipeLabel(recipe: PortRecipe): string {
  return recipe
}

export function portLinkedUnitLabel(unit: PortLinkedUnit): string {
  return unit
}
