import { Technique } from './Technique.ts'
import type { Axis, SolveContext } from '../SolveContext.ts'
import type { DeductionStep, Elimination } from '../DeductionStep.ts'
import type { Cell } from '../../model/types.ts'

/**
 * In a full permutation every row and column holds exactly one person. If a line
 * (row or column) has only ONE still-open cell, SOMEBODY must stand there — so the
 * PERPENDICULAR line through that cell is taken too, and every other cell of that
 * perpendicular line is dead for everyone. ("Zeile 1 hat nur noch Z1/S8 frei → dort
 * muss jemand stehen → Spalte 8 ist belegt → restliche S8-Felder streichen.")
 *
 * The dual of the hidden single (which keys on the only PERSON for a line); this one
 * keys on the only CELL. Pure, transparent forward logic — no trial.
 */
export class ForcedCellTechnique extends Technique {
  readonly name = 'forcedCell'
  readonly difficulty = 1

  apply(ctx: SolveContext): DeductionStep | null {
    if (!ctx.fullPermutation) return null
    // ONE pass over every (person, cell) pair fills the open-cell info for BOTH axes:
    // -1 = no open cell yet, -2 = more than one distinct cell, otherwise THE open cell.
    // The old shape re-walked every domain once per line (lines × persons × domain), and
    // this technique was 9% of the generator's whole runtime. Results are identical: the
    // per-line scan below still visits axes and lines in the same order.
    const openRow = new Int32Array(ctx.board.height).fill(-1)
    const openCol = new Int32Array(ctx.board.width).fill(-1)
    for (const id of ctx.state.unplaced()) {
      for (const c of ctx.state.domain(id)) {
        const r = ctx.axisOf(c, 'row')
        const col = ctx.axisOf(c, 'col')
        if (openRow[r] !== c) openRow[r] = openRow[r] === -1 ? c : -2
        if (openCol[col] !== c) openCol[col] = openCol[col] === -1 ? c : -2
      }
    }
    for (const axis of ['row', 'col'] as Axis[]) {
      const span = axis === 'row' ? ctx.board.height : ctx.board.width
      const open = axis === 'row' ? openRow : openCol
      const used = ctx.usedLines(axis)
      for (let line = 0; line < span; line++) {
        if (used.has(line)) continue
        if (open[line] < 0) continue // none open, or more than one
        const cell: Cell = open[line]
        const perp: Axis = axis === 'row' ? 'col' : 'row'
        const perpLine = ctx.axisOf(cell, perp)

        // The occupant of `cell` consumes its perpendicular line → drop every other cell
        // of that line from everyone (the cell itself stays for whoever ends up there).
        const eliminated: Elimination[] = []
        for (const id of ctx.state.unplaced()) {
          const removed = ctx.removeWhere(id, (c) => c !== cell && ctx.axisOf(c, perp) === perpLine)
          if (removed.length > 0) eliminated.push({ personId: id, cells: removed })
        }
        if (eliminated.length > 0) {
          return {
            technique: 'forcedCell',
            eliminated,
            explanation: {
              key: axis === 'row' ? 'step.forcedCellRow' : 'step.forcedCellCol',
              params: { cell, line: line + 1, perpLine: perpLine + 1 },
            },
          }
        }
      }
    }
    return null
  }
}
