import { Technique } from './Technique.ts'
import type { Axis, SolveContext } from '../SolveContext.ts'
import type { DeductionStep, Elimination } from '../DeductionStep.ts'
import type { PersonId } from '../../model/types.ts'

/** Number of set bits — lines are 0..11, so masks fit a plain number comfortably. */
function popcount(mask: number): number {
  let n = 0
  while (mask) {
    mask &= mask - 1
    n++
  }
  return n
}

/**
 * If k people can only occupy k lines (rows or columns), those people fill
 * those lines exactly — so no one else may use them. Generalises the rulebook's
 * "overlapping fields" tip (k=1 confines one person; k=2 is a naked pair, …).
 * Sound regardless of full permutation.
 *
 * Implementation note: line sets are BITMASKS (union = OR, size = popcount, zero
 * allocation) and the subsets are enumerated by a lexicographic DFS that prunes any
 * prefix whose union already exceeds k lines — such a prefix can only grow, so every
 * pruned subset would have failed the old `union.size !== k` check anyway. The DFS
 * visits the qualifying subsets in EXACTLY the order the previous generic
 * `combinations()` enumeration did, so the first hit — and with it every elimination
 * and explanation — is identical (verified via fixed-seed level fingerprints).
 * Measured before: 16% of the generator's entire runtime, nearly all of it Sets built
 * for subsets that failed the size check.
 */
export class NakedGroupTechnique extends Technique {
  readonly name: string
  readonly difficulty = 3

  constructor(private readonly axis: Axis) {
    super()
    this.name = `nakedGroup-${axis}`
  }

  apply(ctx: SolveContext): DeductionStep | null {
    const unplaced = ctx.state.unplaced()
    const n = unplaced.length
    if (n < 2) return null

    const masks = unplaced.map((id) => {
      let m = 0
      for (const line of ctx.linesOf(id, this.axis)) m |= 1 << line
      return m
    })

    // Cap group size: naked quads are the practical ceiling, and the subset count
    // explodes (2^n) on big boards, so never enumerate beyond k = 4.
    const maxK = Math.min(4, n - 1)
    const chosen: number[] = []
    for (let k = 1; k <= maxK; k++) {
      const step = this.dfs(ctx, unplaced, masks, k, chosen, 0, 0)
      if (step) return step
    }
    return null
  }

  private dfs(
    ctx: SolveContext,
    unplaced: readonly PersonId[],
    masks: readonly number[],
    k: number,
    chosen: number[],
    start: number,
    union: number,
  ): DeductionStep | null {
    if (chosen.length === k) {
      if (popcount(union) !== k) return null
      return this.eliminate(ctx, unplaced, chosen, union)
    }
    const need = k - chosen.length
    for (let i = start; i <= unplaced.length - need; i++) {
      const grown = union | masks[i]
      if (popcount(grown) > k) continue // supersets only grow — old size check failed these too
      chosen.push(i)
      const step = this.dfs(ctx, unplaced, masks, k, chosen, i + 1, grown)
      chosen.pop()
      if (step) return step
    }
    return null
  }

  private eliminate(
    ctx: SolveContext,
    unplaced: readonly PersonId[],
    chosen: readonly number[],
    union: number,
  ): DeductionStep | null {
    const inGroup = new Set(chosen)
    const eliminated: Elimination[] = []
    for (let i = 0; i < unplaced.length; i++) {
      if (inGroup.has(i)) continue
      const removed = ctx.removeWhere(unplaced[i], (c) => ((union >> ctx.axisOf(c, this.axis)) & 1) === 1)
      if (removed.length > 0) eliminated.push({ personId: unplaced[i], cells: removed })
    }
    if (eliminated.length === 0) return null

    const lines: number[] = []
    for (let line = 0; union >> line; line++) if ((union >> line) & 1) lines.push(line)
    return {
      technique: this.axis === 'row' ? 'nakedGroupRows' : 'nakedGroupCols',
      eliminated,
      explanation: {
        key: this.axis === 'row' ? 'step.nakedGroupRows' : 'step.nakedGroupCols',
        params: {
          people: chosen.map((i) => unplaced[i]).join(','),
          lines: lines.map((line) => line + 1).join(', '),
        },
      },
    }
  }
}
