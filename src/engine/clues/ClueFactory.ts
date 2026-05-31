import { Clue } from './Clue.ts'
import {
  AtWallClue,
  CornerClue,
  InColClue,
  InRoomClue,
  InRowClue,
  NearObjectClue,
  NearWindowClue,
  OnObjectClue,
} from './unaryClues.ts'
import { DirectionClue, OffsetClue, SameRoomClue } from './relationalClues.ts'
import { UniqueOnObjectClue, UniqueNearWindowClue } from './uniquenessClues.ts'
import { AloneClue, RoomAttributeClue, RoomCompanionClue, RoomExistsClue } from './socialClues.ts'
import type { Quantifier } from './socialClues.ts'
import { AndClue, NotClue, OrClue } from './compositeClues.ts'
import type { AttributeValue, Direction, PersonId } from '../model/types.ts'

/** JSON shape of a clue, mirroring the Clue class hierarchy. */
export type ClueJson =
  | { type: 'onObject'; object: string }
  | { type: 'nearObject'; object: string }
  | { type: 'nearWindow' }
  | { type: 'inRoom'; room: string }
  | { type: 'inRow'; row: number }
  | { type: 'inCol'; col: number }
  | { type: 'corner' }
  | { type: 'atWall' }
  | { type: 'uniqueOnObject'; object: string }
  | { type: 'uniqueNearWindow' }
  | { type: 'alone' }
  | {
      type: 'roomAttribute'
      quantifier: Quantifier
      attribute: string
      value: AttributeValue
      excludeSelf?: boolean
    }
  | { type: 'direction'; of: PersonId; dir: Direction }
  | { type: 'offset'; of: PersonId; dir: Direction; distance: number }
  | { type: 'sameRoom'; as: PersonId }
  | { type: 'roomCompanion'; count: number; attribute: string; value: AttributeValue }
  | { type: 'roomExists'; attribute: string; value: AttributeValue; object: string }
  | { type: 'not'; clue: ClueJson }
  | { type: 'and'; clues: ClueJson[] }
  | { type: 'or'; clues: ClueJson[] }

/** Build a Clue instance from its JSON representation. */
export function createClue(json: ClueJson): Clue {
  switch (json.type) {
    case 'onObject':
      return new OnObjectClue(json.object)
    case 'nearObject':
      return new NearObjectClue(json.object)
    case 'nearWindow':
      return new NearWindowClue()
    case 'inRoom':
      return new InRoomClue(json.room)
    case 'inRow':
      return new InRowClue(json.row)
    case 'inCol':
      return new InColClue(json.col)
    case 'corner':
      return new CornerClue()
    case 'atWall':
      return new AtWallClue()
    case 'uniqueOnObject':
      return new UniqueOnObjectClue(json.object)
    case 'uniqueNearWindow':
      return new UniqueNearWindowClue()
    case 'alone':
      return new AloneClue()
    case 'roomAttribute':
      return new RoomAttributeClue(
        json.quantifier,
        json.attribute,
        json.value,
        json.excludeSelf ?? false,
      )
    case 'direction':
      return new DirectionClue(json.of, json.dir)
    case 'offset':
      return new OffsetClue(json.of, json.dir, json.distance)
    case 'sameRoom':
      return new SameRoomClue(json.as)
    case 'roomCompanion':
      return new RoomCompanionClue(json.count, json.attribute, json.value)
    case 'roomExists':
      return new RoomExistsClue(json.attribute, json.value, json.object)
    case 'not':
      return new NotClue(createClue(json.clue))
    case 'and':
      return new AndClue(json.clues.map(createClue))
    case 'or':
      return new OrClue(json.clues.map(createClue))
  }
}
