import type { FillBoardOptions, GenerateOptions } from '../engine/generator/index.ts'
import type { LevelJson } from '../engine/index.ts'

export interface GenHandle {
  promise: Promise<LevelJson>
  /** Terminate the worker and reject the promise with a 'cancelled' error. */
  cancel: () => void
}

type WorkerRequest =
  | { kind: 'generate'; opts: GenerateOptions }
  | { kind: 'fill'; board: LevelJson; opts: FillBoardOptions }

/** Runs a (CPU-heavy) generator request in a Web Worker so the UI stays responsive. */
function runWorker(request: WorkerRequest): GenHandle {
  const worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' })
  let settled = false
  let rejectFn: (e: Error) => void = () => {}

  const promise = new Promise<LevelJson>((resolve, reject) => {
    rejectFn = reject
    worker.onmessage = (e: MessageEvent) => {
      if (settled) return
      settled = true
      worker.terminate()
      const data = e.data as { ok: boolean; level?: LevelJson; error?: string }
      if (data.ok && data.level) resolve(data.level)
      else reject(new Error(data.error ?? 'generation failed'))
    }
    worker.onerror = () => {
      if (settled) return
      settled = true
      worker.terminate()
      reject(new Error('worker error'))
    }
    worker.postMessage(request)
  })

  const cancel = () => {
    if (settled) return
    settled = true
    worker.terminate()
    rejectFn(new Error('cancelled'))
  }

  return { promise, cancel }
}

/** Generate a brand-new level from scratch. */
export function generateLevelAsync(opts: GenerateOptions): GenHandle {
  return runWorker({ kind: 'generate', opts })
}

/** Keep the given board, (re)generate its people + clues at the chosen difficulty. */
export function fillBoardCluesAsync(board: LevelJson, opts: FillBoardOptions): GenHandle {
  return runWorker({ kind: 'fill', board, opts })
}
