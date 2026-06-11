import { useEffect, useRef } from 'react'
import {
  DeductionEngine,
  SearchSolver,
  findMurderer,
  VICTIM_ID,
  type Puzzle,
  type Solution,
} from '../engine/index.ts'
import { Renderer } from '../i18n/Renderer.ts'

/** The solved board as a monospace grid: suspect letters, `O` = victim, `#` = wall. */
function gridText(puzzle: Puzzle, solution: Solution | null): string {
  const board = puzzle.board
  const placed = new Map<number, string>()
  if (solution) {
    for (const [id, cell] of solution.entries()) placed.set(cell, id === VICTIM_ID ? 'O' : id)
  }
  const rows: string[] = []
  for (let row = 0; row < board.height; row++) {
    let line = ''
    for (let col = 0; col < board.width; col++) {
      const cell = board.idx(row, col)
      const who = placed.get(cell)
      line += who ? ` ${who} ` : board.isOccupiable(cell) ? ' · ' : ' # '
    }
    rows.push(line)
  }
  return rows.join('\n')
}

/**
 * Dump the fully solved level plus the engine's step-by-step deduction to the
 * console — the same picture `dev/solve.ts` prints, but for the live puzzle. Used
 * by the Ctrl+B debug shortcut in the game and the editor.
 */
export function logSolution(puzzle: Puzzle, renderer: Renderer): void {
  console.group(`%c[Murdoku] ${puzzle.id}  ${puzzle.board.width}×${puzzle.board.height}`, 'font-weight:bold')

  console.group('Verdächtige')
  for (const suspect of puzzle.suspects) {
    const clues =
      suspect.clues.map((c) => renderer.clue(c.describe(), suspect.id)).join('  |  ') ||
      '(kein Hinweis)'
    console.log(`${suspect.id} = ${suspect.name}: ${clues}`)
  }
  console.log(`Opfer = ${puzzle.victim.name}`)
  console.groupEnd()

  const result = new DeductionEngine(puzzle).solve()
  console.group('Deduktion (Weg)')
  for (const step of result.steps) {
    console.log(`- ${renderer.render(step.explanation)}`)
    for (const link of step.chain ?? []) console.log(`    · ${renderer.render(link)}`)
  }
  console.log(
    `Gelöst (reine Deduktion): ${result.solved ? 'ja' : 'nein'} · Schwierigkeit: ${result.difficulty} (Rang ${result.maxRank})`,
  )
  console.groupEnd()

  const searcher = new SearchSolver(puzzle)
  const solution = searcher.firstSolution()
  const count = searcher.countSolutions(2)
  console.group('Lösung')
  console.log(
    `Eindeutig: ${count === 1 ? 'ja' : count >= 2 ? 'nein (mehrere Lösungen)' : 'nein (keine Lösung)'}`,
  )
  if (solution) {
    const m = findMurderer(puzzle, solution)
    console.log(
      `Mörder: ${m.suspectId ? puzzle.nameOf(m.suspectId) : `uneindeutig (${m.suspectsInRoom.length} im Raum)`}`,
    )
    console.log(gridText(puzzle, solution))
  } else {
    console.log('Keine Lösung gefunden.')
  }
  console.groupEnd()

  console.groupEnd()
}

/**
 * Wire the Ctrl+B debug shortcut: on press, `provide` is called to obtain the
 * puzzle (+ a renderer for the active language) to dump via {@link logSolution}.
 * Returning null skips it (e.g. the editor board isn't buildable yet). The latest
 * `provide` closure is always used, so callers can read live state.
 */
export function useDebugSolveKey(
  provide: () => { puzzle: Puzzle; renderer: Renderer } | null,
): void {
  const ref = useRef(provide)
  useEffect(() => {
    ref.current = provide
  }, [provide])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b') return
      const data = ref.current()
      if (!data) return
      e.preventDefault()
      logSolution(data.puzzle, data.renderer)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
