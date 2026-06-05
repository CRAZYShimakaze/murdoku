import {
  generateLevel,
  fillBoardClues,
  type GenerateOptions,
  type FillBoardOptions,
} from '../engine/generator/index.ts'
import type { LevelJson } from '../engine/index.ts'

// Minimal worker-scope typing (avoids pulling in the WebWorker lib, which clashes
// with the DOM lib used by the rest of the app).
interface WorkerCtx {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage: (msg: unknown) => void
}
const ctx = self as unknown as WorkerCtx

/** Either generate a level from scratch, or fill people+clues onto a fixed board. */
type WorkerRequest =
  | { kind: 'generate'; opts: GenerateOptions }
  | { kind: 'fill'; board: LevelJson; opts: FillBoardOptions }

ctx.onmessage = (e: MessageEvent) => {
  const req = e.data as WorkerRequest
  try {
    const level: LevelJson | null =
      req.kind === 'fill' ? fillBoardClues(req.board, req.opts) : generateLevel(req.opts)
    if (!level) throw new Error('no level')
    ctx.postMessage({ ok: true, level })
  } catch (err) {
    ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
