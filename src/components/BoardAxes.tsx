import { useTranslation } from 'react-i18next'

/** Space the coordinate margins take away from the board (px): left strip + gap.
 *  Kept tight — on phones every pixel belongs to the board. */
export const AXES_W = 21
/** Top strip + gap (px). */
export const AXES_H = 15

interface Props {
  cols: number
  rows: number
  /** Cell edge length in px — labels align to the board grid. */
  cell: number
  /** Hovered board cell (0-based row/col) — its two labels light up white. */
  active?: { row: number; col: number } | null
}

/**
 * Quiet coordinate margins around a board canvas: column labels on top, row
 * labels on the left — the same Z/S (de) or R/C (en) coordinates that clues and
 * hints use. Only the first label carries the letter ("Z1, 2, 3 …") so narrow
 * cells never crowd. Mount inside a `.mk-axes` grid next to the canvas.
 */
export default function BoardAxes({ cols, rows, cell, active = null }: Props) {
  const { t } = useTranslation()
  const label = (prefix: string, i: number) => (i === 0 ? `${prefix}1` : String(i + 1))
  return (
    <>
      <div className="mk-axes__cols" aria-hidden="true">
        {Array.from({ length: cols }, (_, i) => (
          <span key={i} style={{ width: cell }} data-active={i === active?.col || undefined}>
            {label(t('coord.col'), i)}
          </span>
        ))}
      </div>
      <div className="mk-axes__rows" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} style={{ height: cell }} data-active={i === active?.row || undefined}>
            {label(t('coord.row'), i)}
          </span>
        ))}
      </div>
    </>
  )
}
