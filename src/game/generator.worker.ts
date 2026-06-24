import {
  generateLevel,
  fillBoardClues,
  type GenerateOptions,
  type FillBoardOptions,
} from '../engine/generator/index.ts'
import type { LevelJson } from '../engine/index.ts'
import { makeClueMatchers, requiredAttrSeeds, type Condition } from './editorClues.ts'

// Minimal worker-scope typing (avoids pulling in the WebWorker lib, which clashes
// with the DOM lib used by the rest of the app).
interface WorkerCtx {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage: (msg: unknown) => void
}
const ctx = self as unknown as WorkerCtx

/** Either generate a level from scratch, or fill people+clues onto a fixed board.
 *  `palette` (fill only) carries the editor's constraint templates as plain data; the
 *  worker rebuilds the (non-serialisable) clue filter from it here. */
type WorkerRequest =
  | { kind: 'generate'; opts: GenerateOptions }
  | { kind: 'fill'; board: LevelJson; opts: FillBoardOptions; palette?: Condition[] }

ctx.onmessage = (e: MessageEvent) => {
  const req = e.data as WorkerRequest
  try {
    let level: LevelJson | null
    if (req.kind === 'fill') {
      const requiredClues = makeClueMatchers(req.palette)
      const requiredAttributes = requiredAttrSeeds(req.palette)
      level = fillBoardClues(req.board, {
        ...req.opts,
        ...(requiredClues ? { requiredClues } : {}),
        ...(requiredAttributes.length ? { requiredAttributes } : {}),
      })
    } else {
      level = generateLevel(req.opts)
    }
    if (!level) throw new Error('no level')
    ctx.postMessage({ ok: true, level })
  } catch (err) {
    ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
