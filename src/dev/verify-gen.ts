/**
 * Blocker-bug hunt: does the generator ever ship a level that is NOT uniquely &
 * forward-solvable? We trust nothing — for every generated level we count its
 * solutions with an INDEPENDENT brute-force backtracker that uses ONLY the two
 * obviously-sound rules (distinct row + distinct column) and checks EVERY clue via
 * `clue.test` at each complete placement (the same final arbiter the SearchSolver
 * uses at its leaf). It deliberately omits ALL of the SearchSolver's clever pruning
 * (relational / room / roomExists propagation, `violatedBy`), so any disagreement
 * between the two counts pinpoints an UNSOUND prune that lets a non-unique level pass
 * the generator's `countSolutions(2) === 1` gate — i.e. exactly the "player got an
 * unsolvable (ambiguous) level" bug.
 *
 *   npx tsx src/dev/verify-gen.ts [seedsPerCell] [--full]
 *
 *   --full : also re-count WITHOUT the candidateCells domain restriction (catches an
 *            unsound candidateCells that both solvers would share). Slower; sizes ≤ 8.
 */
import { generateLevel } from '../engine/generator/index.ts'
import { loadLevel } from '../engine/io/LevelLoader.ts'
import { SearchSolver } from '../engine/solver/SearchSolver.ts'
import { DeductionEngine } from '../engine/solver/DeductionEngine.ts'
import { Solution } from '../engine/model/Solution.ts'
import type { Puzzle, Person } from '../engine/model/Puzzle.ts'
import type { Cell, PersonId } from '../engine/model/types.ts'
import type { GenDifficulty } from '../engine/generator/index.ts'

/**
 * Independent solution counter. Backtracks placing each person on a DISTINCT row and
 * DISTINCT column (the only structural rule), optionally restricting each person's
 * domain to the intersection of their clues' candidateCells (sound per the Clue
 * contract; turn OFF to also test candidateCells itself). A full placement counts iff
 * every person-clue, the murder-alone rule, and every board clue hold. No other pruning.
 */
function bruteCount(
  puzzle: Puzzle,
  limit: number,
  useCandidateDomains: boolean,
  maxNodes = 4_000_000,
): number {
  const board = puzzle.board
  const people: Person[] = puzzle.people()
  const victim = people.find((p) => p.isVictim)!

  // Per-person domain (cell list).
  const domains: { id: PersonId; cells: Cell[]; isVictim: boolean }[] = []
  for (const person of people) {
    let cells = [...board.occupiableCells()]
    if (useCandidateDomains) {
      for (const clue of person.clues) {
        const cand = clue.candidateCells(board)
        if (cand) cells = cells.filter((c) => cand.has(c))
      }
    }
    domains.push({ id: person.id, cells, isVictim: person.isVictim })
  }
  // Most-constrained first → far fewer nodes (still exhaustive).
  domains.sort((a, b) => a.cells.length - b.cells.length)

  const placement = new Map<PersonId, Cell>()
  const usedRow = new Set<number>()
  const usedCol = new Set<number>()
  let count = 0
  let nodes = 0
  let overflow = false

  const leafValid = (): boolean => {
    const solution = new Solution(new Map(placement))
    for (const person of people) {
      for (const clue of person.clues) {
        if (!clue.test(person.id, solution, puzzle)) return false
      }
    }
    // murder-alone: exactly one suspect shares the victim's room.
    const victimRoom = board.roomIdOf(placement.get(victim.id)!)
    let withVictim = 0
    for (const person of people) {
      if (person.isVictim) continue
      if (board.roomIdOf(placement.get(person.id)!) === victimRoom) withVictim++
    }
    if (withVictim !== 1) return false
    for (const bc of puzzle.boardClues) if (!bc.test(solution, puzzle)) return false
    return true
  }

  const recurse = (i: number): boolean => {
    if (overflow) return true // unwind fast once the node budget is blown
    if (++nodes > maxNodes) {
      overflow = true
      return true
    }
    if (i === domains.length) {
      if (leafValid() && ++count >= limit) return true
      return false
    }
    const { id, cells } = domains[i]
    for (const cell of cells) {
      const { row, col } = board.rc(cell)
      if (usedRow.has(row) || usedCol.has(col)) continue
      usedRow.add(row)
      usedCol.add(col)
      placement.set(id, cell)
      if (recurse(i + 1)) return true
      placement.delete(id)
      usedRow.delete(row)
      usedCol.delete(col)
    }
    return false
  }

  recurse(0)
  return overflow ? -1 : count // -1 = inconclusive (exhausting the no-domain space timed out)
}

const seedsPerCell = Number(process.argv[2] ?? 30)
const full = process.argv.includes('--full')
const sizesArg = process.argv.find((a) => a.startsWith('--sizes='))
const sizes = sizesArg ? sizesArg.slice('--sizes='.length).split(',').map(Number) : [6, 7, 8, 9, 10]
const diffs: GenDifficulty[] = ['easy', 'medium', 'hard']

interface Problem {
  cfg: string
  searchCount: number
  brute: number
  bruteNoCand?: number
  forwardSolved: boolean
  kind: string
}
const problems: Problem[] = []
let total = 0
let maxMs = 0
let noCandInconclusive = 0
let genFail = 0
// Allow more nodes when the no-domain census is the point (still bounded so it can't hang).
const NO_CAND_NODES = 12_000_000

for (const size of sizes) {
  for (const diff of diffs) {
    for (let seed = 1; seed <= seedsPerCell; seed++) {
      const cfg = `${diff} ${size}x${size}#${seed}`
      total++
      try {
        const t0 = performance.now()
        const level = generateLevel({ width: size, height: size, suspects: size - 1, difficulty: diff, seed })
        const ms = performance.now() - t0
        maxMs = Math.max(maxMs, ms)
        const puzzle = loadLevel(level)

        const searchCount = new SearchSolver(puzzle).countSolutions(3)
        const brute = bruteCount(puzzle, 3, true)
        const forwardSolved = new DeductionEngine(puzzle, { noCaseSplit: true }).solve().solved

        let bruteNoCand: number | undefined
        if (full && size <= 9) bruteNoCand = bruteCount(puzzle, 3, false, NO_CAND_NODES)

        const issues: string[] = []
        // What actually ships MUST be uniquely & forward-solvable.
        if (searchCount !== 1) issues.push(`SHIPPED-NON-UNIQUE(search=${searchCount})`)
        if (!forwardSolved) issues.push('NOT-FORWARD-SOLVABLE')
        // Independent cross-checks (skip when a brute pass ran out of node budget = -1).
        if (brute !== -1 && brute !== searchCount) issues.push(`SEARCH-UNSOUND(search=${searchCount},brute=${brute})`)
        if (brute !== -1 && brute !== 1) issues.push(`AMBIGUOUS(brute=${brute})`)
        if (bruteNoCand === -1) noCandInconclusive++
        else if (bruteNoCand !== undefined && brute !== -1 && bruteNoCand !== brute) {
          issues.push(`CANDIDATECELLS-UNSOUND(noCand=${bruteNoCand},brute=${brute})`)
        }

        if (issues.length > 0) {
          problems.push({ cfg, searchCount, brute, bruteNoCand, forwardSolved, kind: issues.join(' ') })
          console.log(`✗ ${cfg.padEnd(16)} ${issues.join(' ')}`)
        }
      } catch (e) {
        const msg = (e as Error).message
        // "Could not generate …" is a capacity limit (no level found in budget), NOT a
        // correctness bug. Only an assertShippable / unexpected throw is a real problem.
        if (/Could not generate/.test(msg)) {
          genFail++
        } else {
          problems.push({ cfg, searchCount: -1, brute: -1, forwardSolved: false, kind: 'THROW:' + msg })
          console.log(`✗ ${cfg.padEnd(16)} THROW ${msg}`)
        }
      }
    }
    process.stdout.write(`  done ${diff} ${size}x${size}\n`)
  }
}

console.log(
  `\n${total} Level versucht · ${problems.length} Probleme · ${genFail} Generierungs-Fehlschläge · ` +
    `${noCandInconclusive} no-cand inconclusive · max ${Math.round(maxMs)} ms`,
)
if (problems.length === 0) {
  console.log('Alle erzeugten Level sind eindeutig, brute-bestätigt und vorwärts-lösbar ✓')
}
