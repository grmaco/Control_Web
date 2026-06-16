export const APPLICATION_UNIT_ID = 'application'
export const GLOBAL_LINE_ID = 'global'

export interface ApplicationLogInput {
  title: string
  comment: string
  lineId?: string | null
}
