import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import ObjectIcon from './ObjectIcon.tsx'
import { OBJECT_CATALOG, type Puzzle } from '../engine/index.ts'

/** type → its position in the shared catalog, so the legend groups thematically
 *  (furniture, plants, animals, …) exactly like the editor palette. */
const CATALOG_ORDER = new Map(OBJECT_CATALOG.map((o, i) => [o.type, i]))

interface Item {
  type: string
  name: string
  status: 'occupiable' | 'blocked' | 'wall'
}

/** Explains which icon means what and whether a tile can be occupied. */
function Legend({ puzzle }: { puzzle: Puzzle }) {
  const { t } = useTranslation()

  const items = useMemo<Item[]>(() => {
    const board = puzzle.board
    const types = new Map<string, boolean>() // object type → occupiable
    let hasWindow = false
    let hasDoor = false
    for (let c = 0; c < board.width * board.height; c++) {
      for (const obj of board.tileAt(c).objects()) {
        if (!types.has(obj.type)) types.set(obj.type, obj.occupiable)
      }
      if (board.windowSides(c).length > 0) hasWindow = true
      if (board.doorSides(c).length > 0) hasDoor = true
    }
    const list: Item[] = [{ type: 'floor', name: t('objName.floor'), status: 'occupiable' }]
    for (const [type, occ] of types) {
      list.push({ type, name: t(`objName.${type}`), status: occ ? 'occupiable' : 'blocked' })
    }
    if (hasWindow) list.push({ type: 'window', name: t('objName.window'), status: 'wall' })
    if (hasDoor) list.push({ type: 'door', name: t('objName.door'), status: 'wall' })
    // Group by what the tile lets you do: walkable first, blocked next, walls
    // last; within a group, follow the catalog order (so the animals/plants/…
    // clusters read the same as the editor palette). 'floor' stays first.
    const rank = { occupiable: 0, blocked: 1, wall: 2 }
    const order = (it: Item) =>
      it.type === 'floor' ? -1 : (CATALOG_ORDER.get(it.type) ?? 999)
    return list.sort((a, b) => rank[a.status] - rank[b.status] || order(a) - order(b))
  }, [puzzle, t])

  return (
    <div className="mk-legend">
      <span className="mk-legend__title">{t('legend.title')}</span>
      <ul>
        {items.map((it) => (
          <li key={it.type} className="mk-leg" data-status={it.status}>
            <ObjectIcon
              type={it.type}
              occupiable={it.status === 'occupiable'}
              className="mk-leg__icon"
            />
            <span className="mk-leg__name">{it.name}</span>
            <span className="mk-leg__status">{t(`legend.${it.status}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Memoized: `puzzle` is stable for the whole play-through, so the legend never needs to
// follow the game screen's frequent local-state renders.
export default memo(Legend)
