import type { ReactNode } from 'react'

/**
 * The six "reasoning families" a deduction line can belong to. Each hint-box reason
 * (a place-hint's eliminations, a cross-out's argument) is tagged with its family so
 * the player instantly reads WHAT KIND of logic is at work — line/room/proximity/
 * company/murder/what-if. Purely presentational: derived from the `step.*` (and a few
 * `why.*`/`contra.*`) explanation keys the engine already produces.
 */
export type HintFamily = 'line' | 'room' | 'near' | 'social' | 'murder' | 'if'

/** Stable display order for family summaries. */
export const FAMILY_ORDER: readonly HintFamily[] = ['line', 'room', 'near', 'social', 'murder', 'if']

/** Explanation key → family. Keys are the base i18n keys the engine emits (plural `_one`
 *  variants share the base). Unknown keys → null (rendered as a plain reason, no tag). */
const FAMILY_OF: Record<string, HintFamily> = {
  // Linie — row/column bookkeeping (Latin-square logic).
  'step.nakedSingle': 'line',
  'step.victim': 'line',
  'step.hiddenSingleRow': 'line',
  'step.hiddenSingleCol': 'line',
  'step.hiddenSingleRowVictim': 'line',
  'step.hiddenSingleColVictim': 'line',
  'step.forcedCellRow': 'line',
  'step.forcedCellCol': 'line',
  'step.nakedGroupRows': 'line',
  'step.nakedGroupCols': 'line',
  'step.crossCenter': 'line',
  'step.rectangle': 'line',
  'step.uniqueConstraint': 'line',
  'why.rowTaken': 'line',
  'why.colTaken': 'line',
  'why.rowConfined': 'line',
  'why.colConfined': 'line',
  'why.crossConfined': 'line',
  // Räume — room structure, capacity, empties, counts on objects.
  'step.emptyRoomsAllOccupied': 'room',
  'step.emptyRoomsConfine': 'room',
  'step.emptyRoomsLine': 'room',
  'step.emptyRoomForcing': 'room',
  'step.roomAssignmentReserve': 'room',
  'step.roomAssignmentConfine': 'room',
  'step.roomCoverageReserve': 'room',
  'step.roomCoverageConfine': 'room',
  'step.roomCapacityFull': 'room',
  'step.roomCapacityPair': 'room',
  'step.roomBijection': 'room',
  'step.boardCountFull': 'room',
  'step.boardCountConfine': 'room',
  'step.boardCountLine': 'room',
  'step.boardCountLines': 'room',
  // Nähe — direction/neighbour, same/different room, same object.
  'step.relationalDirection': 'near',
  'step.relationalDirectionAttr': 'near',
  'step.relationalSameRoom': 'near',
  'step.differentRoom': 'near',
  'step.sameObject': 'near',
  'step.sameObjectForce': 'near',
  'step.insideXor': 'near',
  // Gesellschaft — alone / not-alone / companions / traits in a room.
  'step.aloneExcludeRoom': 'social',
  'step.aloneExcludeLine': 'social',
  'step.aloneReserve': 'social',
  'step.notAloneRoom': 'social',
  'step.notAloneForce': 'social',
  'step.notAloneOccupied': 'social',
  'step.companionRoom': 'social',
  'step.companionRoomBusy': 'social',
  'step.companionForce': 'social',
  'step.companionReserve': 'social',
  'step.companionFit': 'social',
  'step.companionPairing': 'social',
  'step.roomExistsRoom': 'social',
  'step.roomExistsSpot': 'social',
  'step.roomExistsOccupant': 'social',
  'step.roomExistsOnlyMatcher': 'social',
  'step.aloneWithRoom': 'social',
  'step.aloneWithReserve': 'social',
  'step.groupRoomMemberOut': 'social',
  'step.groupRoomForeign': 'social',
  'step.groupRoomNoExtra': 'social',
  'step.groupRoomCapacity': 'social',
  'step.groupRoomMember': 'social',
  'step.groupRoomFull': 'social',
  'step.groupRoomDir': 'social',
  'step.groupRoomDirExtra': 'social',
  'step.groupRoomDirSubject': 'social',
  'step.attrSomeRoom': 'social',
  'step.attrExactRoom': 'social',
  'step.attrAllRoom': 'social',
  'step.attrForce': 'social',
  'step.attrExcludeRoom': 'social',
  'step.attrExcludeRoomGender': 'social',
  'step.attrReserve': 'social',
  'step.attrReserveGender': 'social',
  'step.attrPigeonhole': 'social',
  'step.attrPigeonholeGender': 'social',
  'why.aloneOccupied': 'social',
  // Mörder — victim alone with exactly one suspect.
  'step.murderVictimNotRoom': 'murder',
  'step.murderRoomFill': 'murder',
  'step.murderIdentified': 'murder',
  'step.murderConfine': 'murder',
  'step.murderNoMurderer': 'murder',
  'step.murderNoVictimCell': 'murder',
  'step.murderer': 'murder',
  'step.murdererAmbiguous': 'murder',
  // Wenn-dann — case split / forcing / contradiction.
  'step.caseSplitCommon': 'if',
  'step.caseSplitContradiction': 'if',
  'step.shortExclude': 'if',
  'step.forcing': 'if',
  'step.assume': 'if',
  'why.caseAssume': 'if',
  'contra.empty': 'if',
  'contra.murder': 'if',
  'contra.general': 'if',
  'contra.exhausted': 'if',
}

export function familyOf(key: string): HintFamily | null {
  return FAMILY_OF[key] ?? null
}

/** i18n label key + hand-drawn line-art glyph for each family (no emoji, on-theme). */
export const FAMILY_META: Record<HintFamily, { labelKey: string; icon: ReactNode }> = {
  line: {
    labelKey: 'fam.line',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 9h16M4 15h16M9 4v16M15 4v16" />
      </svg>
    ),
  },
  room: {
    labelKey: 'fam.room',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16v16H4z" />
        <path d="M4 12h7V4" />
      </svg>
    ),
  },
  near: {
    labelKey: 'fam.near',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="7" cy="7" r="2.2" />
        <circle cx="17" cy="17" r="2.2" />
        <path d="M9 9l6 6" />
      </svg>
    ),
  },
  social: {
    labelKey: 'fam.social',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="9" r="2.4" />
        <circle cx="16" cy="9" r="2.4" />
        <path d="M3.5 19c0-2.8 2-4.5 4.5-4.5M16 14.5c2.5 0 4.5 1.7 4.5 4.5" />
      </svg>
    ),
  },
  murder: {
    labelKey: 'fam.murder',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="9" r="5" />
        <path d="M9.5 8.5v1M14.5 8.5v1M8 19l4-5 4 5" />
      </svg>
    ),
  },
  if: {
    labelKey: 'fam.if',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H6v14M6 12h6M18 12a2.5 2.5 0 1 0-2.4-3.2M18 8v.01" />
      </svg>
    ),
  },
}
