import type { ClueJson } from '../clues/ClueFactory.ts'
import type { AttributeValue, Side } from '../model/types.ts'

/** JSON definition of one suspect. */
export interface SuspectJson {
  id: string
  name: string
  attributes?: Record<string, AttributeValue>
  clues?: ClueJson[]
}

/**
 * A board-wide clue not tied to one suspect (shown separately in the UI):
 *  - countOnObject: exactly `count` people stand on cells with this object;
 *  - emptyRooms: exactly `count` rooms hold nobody (0 = "no room is empty");
 *  - roomOccupancy: one comparison every room must satisfy (at least / at most / exactly /
 *    not exactly `count`);
 *  - countWithAttr: exactly `count` carriers of a trait are inside / outside.
 *
 * `scope` picks who is counted — every person (victim included) or only the suspects;
 * it defaults to each clue's historical behaviour so old level JSON keeps its meaning.
 */
export type BoardClueJson =
  | { type: 'countOnObject'; object: string; count: number }
  | { type: 'emptyRooms'; count: number }
  /** LEGACY (pre-roomOccupancy): identical to roomOccupancy 'exactly' over people. Still
   *  loaded so older level files keep working; the editor normalises it on open. */
  | { type: 'everyRoomCount'; count: number }
  /** The murder rule bounds `count` per op/scope — see RoomOccupancyClue. */
  | {
      type: 'roomOccupancy'
      op: 'atLeast' | 'atMost' | 'exactly' | 'notExactly'
      count: number
      scope?: 'people' | 'suspects'
    }
  /** scope 'people' is only legal for `attribute: 'gender'` — the victim's other traits
   *  are hidden from the player, so counting them would be uncheckable. */
  | {
      type: 'countWithAttr'
      attribute: string
      value: AttributeValue
      area: 'inside' | 'outside'
      count: number
      scope?: 'people' | 'suspects'
    }

/** JSON definition of a complete level (see levels/demo-4x4.json). */
export interface LevelJson {
  schema: 1
  id: string
  /** Optional display name (e.g. a player-given name for a saved level). */
  title?: string
  /** Optional per-language title overrides ({ de, en, … }); the active language is
   *  looked up here first, falling back to `title`. Lets one level read in any UI
   *  language without separate files. */
  titles?: Record<string, string>
  /** Optional credit shown while playing ("A case by …"); omitted when unset. */
  author?: string
  size: { width: number; height: number }
  /** char -> room metadata; chars are used in `roomMap`. `outside` marks outdoor areas. */
  rooms: Record<string, { nameKey: string; color: string; outside?: boolean }>
  /** char -> object metadata; chars are used in `groundMap` / `topMap`. */
  objects?: Record<string, { type: string; occupiable: boolean }>
  /** height strings of width chars; each char is a room id. */
  roomMap: string[]
  /** Occupiable ground layer (e.g. carpet). "." = empty. */
  groundMap?: string[]
  /** Objects on top (chair/bed/table/…). "." = empty. */
  topMap?: string[]
  windows?: { r: number; c: number; side: Side }[]
  /** Doors sit on a wall like windows but are two-sided ("beside" on both cells). */
  doors?: { r: number; c: number; side: Side }[]
  suspects: SuspectJson[]
  victim: { name: string; attributes?: Record<string, AttributeValue> }
  globalClues?: ClueJson[]
  /** Board-wide clues (counts / empty rooms), shown separately from suspects. */
  boardClues?: BoardClueJson[]
  difficulty?: string
}
