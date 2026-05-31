import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { OBJECT_GLYPHS } from '../game/glyphs.ts'
import type { Puzzle } from '../engine/index.ts'

interface Item {
  type: string
  glyph: string
  name: string
  status: 'occupiable' | 'blocked' | 'wall'
}

/** Explains which icon means what and whether a tile can be occupied. */
export default function Legend({ puzzle }: { puzzle: Puzzle }) {
  const { t } = useTranslation()

  const items = useMemo<Item[]>(() => {
    const board = puzzle.board
    const types = new Map<string, boolean>() // object type → occupiable
    let hasWindow = false
    for (let c = 0; c < board.width * board.height; c++) {
      for (const obj of board.tileAt(c).objects()) {
        if (!types.has(obj.type)) types.set(obj.type, obj.occupiable)
      }
      if (board.windowSides(c).length > 0) hasWindow = true
    }
    const list: Item[] = [{ type: 'floor', glyph: '⬜', name: t('objName.floor'), status: 'occupiable' }]
    for (const [type, occ] of types) {
      list.push({
        type,
        glyph: OBJECT_GLYPHS[type] ?? '•',
        name: t(`objName.${type}`),
        status: occ ? 'occupiable' : 'blocked',
      })
    }
    if (hasWindow) {
      list.push({ type: 'window', glyph: OBJECT_GLYPHS.window, name: t('objName.window'), status: 'wall' })
    }
    return list
  }, [puzzle, t])

  return (
    <div className="mk-legend">
      <span className="mk-legend__title">{t('legend.title')}</span>
      <ul>
        {items.map((it) => (
          <li key={it.type} className="mk-leg" data-status={it.status}>
            <span className="mk-leg__glyph">{it.glyph}</span>
            <span className="mk-leg__name">{it.name}</span>
            <span className="mk-leg__status">{t(`legend.${it.status}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
