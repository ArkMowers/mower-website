export type OperatorAction = 'Relax' | 'Move' | 'Interact' | 'Sit' | 'Sleep' | 'Special'

export const OPERATOR_ACTIONS: readonly { id: OperatorAction; name: string }[] = [
  { id: 'Relax', name: '闲置' },
  { id: 'Move', name: '走动' },
  { id: 'Interact', name: '互动' },
  { id: 'Sit', name: '坐下' },
  { id: 'Sleep', name: '睡眠' },
  { id: 'Special', name: '特殊动作' },
]
const BASE_ACTIONS = OPERATOR_ACTIONS.filter(action => action.id !== 'Special').map(action => action.id)

export interface OperatorSkin {
  id: string
  name: string
  stem: string
  floor: Partial<Record<OperatorAction, number>>
  actions: readonly OperatorAction[]
}

export const OPERATOR_SKINS: readonly OperatorSkin[] = [
  {
    id: 'default',
    name: '默认',
    stem: 'build_char_4032_provs',
    // Sit's root is the seat anchor; its negative-Y legs hang over the edge.
    floor: { Sit: 0, Sleep: -32.88 },
    actions: BASE_ACTIONS,
  },
  {
    id: 'holiday',
    name: '悠然假日 HD78',
    stem: 'build_char_4032_provs_summer-17',
    floor: { Sit: 0, Sleep: -30.77 },
    actions: [...BASE_ACTIONS, 'Special'],
  },
  {
    id: 'autumn',
    name: '秋高气爽',
    stem: 'build_char_4032_provs_wild-7',
    floor: { Sit: 0, Sleep: -21.63 },
    actions: [...BASE_ACTIONS, 'Special'],
  },
]

export function modelUrl(skin: OperatorSkin, extension: string) {
  return `/models/proviso/${skin.id}/${encodeURIComponent(skin.stem)}.${extension}`
}

export function posterUrl(skin: OperatorSkin) {
  return `/models/proviso/${skin.id}/poster.webp`
}
