import { generateLevel, type GenerateOptions } from '../engine/generator/index.ts'
import type { LevelJson } from '../engine/index.ts'

// Minimal worker-scope typing (avoids pulling in the WebWorker lib, which clashes
// with the DOM lib used by the rest of the app).
interface WorkerCtx {
  onmessage: ((e: MessageEvent) => void) | null
  postMessage: (msg: unknown) => void
}
const ctx = self as unknown as WorkerCtx

ctx.onmessage = (e: MessageEvent) => {
  const opts = e.data as GenerateOptions
  try {
    const level: LevelJson = generateLevel(opts)
    ctx.postMessage({ ok: true, level })
  } catch (err) {
    ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
