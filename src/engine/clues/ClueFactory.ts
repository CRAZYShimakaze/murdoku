import { Clue } from './Clue.ts'
import {
  AtWallClue,
  CornerClue,
  InColClue,
  InRoomClue,
  InRowClue,
  NearAnyObjectClue,
  NearDoorClue,
  NearObjectClue,
  NearWindowClue,
  OnObjectClue,
  OutsideClue,
} from './unaryClues.ts'
import { DirectionClue, InsideXorClue, OffsetClue, SameRoomClue } from './relationalClues.ts'
import { UniqueOnObjectClue, UniqueNearWindowClue } from './uniquenessClues.ts'
import {
  AloneClue,
  AloneWithClue,
  NotAloneClue,
  RoomAttributeClue,
  RoomCompanionClue,
  RoomExistsClue,
} from './socialClues.ts'
import type { Quantifier } from './socialClues.ts'
import { AndClue, NotClue, OrClue } from './compositeClues.ts'
import type { AttributeValue, Direction, PersonId } from '../model/types.ts'

/** JSON shape of a clue, mirroring the Clue class hierarchy. */
export type ClueJson =
  | { type: 'onObject'; object: string }
  | { type: 'nearObject'; object: string }
  | { type: 'nearObjectAny'; objects: string[] }
  | { type: 'nearWindow' }
  | { type: 'nearDoor' }
  | { type: 'inside' }
  | { type: 'outside' }
  | { type: 'inRoom'; room: string }
  | { type: 'inRow'; row: number }
  | { type: 'inCol'; col: number }
  | { type: 'corner' }
  | { type: 'atWall' }
  | { type: 'uniqueOnObject'; object: string }
  | { type: 'uniqueNearWindow' }
  | { type: 'alone' }
  | { type: 'notAlone' }
  | {
      type: 'aloneWith'
      people: PersonId[]
      attribute: string
      value: AttributeValue
      extraCount: number
      dir?: Direction
    }
  | {
      type: 'roomAttribute'
      quantifier: Quantifier
      attribute: string
      value: AttributeValue
      excludeSelf?: boolean
    }
  | { type: 'direction'; of: PersonId; dir: Direction }
  | { type: 'insideXor'; with: PersonId }
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
    case 'nearObjectAny':
      return new NearAnyObjectClue(json.objects)
    case 'nearWindow':
      return new NearWindowClue()
    case 'nearDoor':
      return new NearDoorClue()
    case 'inside':
      return new OutsideClue(false)
    case 'outside':
      return new OutsideClue(true)
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
    case 'notAlone':
      return new NotAloneClue()
    case 'aloneWith':
      return new AloneWithClue(
        json.people,
        json.attribute,
        json.value,
        json.extraCount,
        json.dir ?? null,
      )
    case 'insideXor':
      return new InsideXorClue(json.with)
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
