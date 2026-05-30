import type { ClueJson } from '../clues/ClueFactory.ts'
import type { AttributeValue, Side } from '../model/types.ts'

/** JSON definition of one suspect. */
export interface SuspectJson {
  id: string
  name: string
  attributes?: Record<string, AttributeValue>
  clues?: ClueJson[]
}

/** JSON definition of a complete level (see levels/demo-4x4.json). */
export interface LevelJson {
  schema: 1
  id: string
  size: { width: number; height: number }
  /** char -> room metadata; chars are used in `roomMap`. */
  rooms: Record<string, { nameKey: string; color: string }>
  /** char -> object metadata; chars are used in `groundMap` / `topMap`. */
  objects?: Record<string, { type: string; occupiable: boolean }>
  /** height strings of width chars; each char is a room id. */
  roomMap: string[]
  /** Occupiable ground layer (e.g. carpet). "." = empty. */
  groundMap?: string[]
  /** Objects on top (chair/bed/table/…). "." = empty. */
  topMap?: string[]
  windows?: { r: number; c: number; side: Side }[]
  suspects: SuspectJson[]
  victim: { name: string; attributes?: Record<string, AttributeValue> }
  globalClues?: ClueJson[]
  difficulty?: string
}
