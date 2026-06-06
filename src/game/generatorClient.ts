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

/**
 * Run the request on the MAIN THREAD — the fallback for browsers that can't run
 * our module worker (notably some mobile browsers: older iOS Safari, Firefox for
 * Android, several in-app WebViews). The generator import is dynamic so it stays
 * code-split, and the awaits give the "generating" overlay a chance to paint
 * before the (blocking) CPU work begins.
 */
function runInline(request: WorkerRequest): GenHandle {
  let cancelled = false
  const promise = (async () => {
    const { generateLevel, fillBoardClues } = await import('../engine/generator/index.ts')
    await new Promise((r) => setTimeout(r, 0))
    if (cancelled) throw new Error('cancelled')
    const level =
      request.kind === 'fill'
        ? fillBoardClues(request.board, request.opts)
        : generateLevel(request.opts)
    if (cancelled) throw new Error('cancelled')
    if (!level) throw new Error('generation failed')
    return level
  })()
  return { promise, cancel: () => void (cancelled = true) }
}

/** Runs a (CPU-heavy) generator request in a Web Worker so the UI stays responsive. */
function runWorker(request: WorkerRequest): GenHandle {
  let worker: Worker
  try {
    worker = new Worker(new URL('./generator.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    // Workers (or module workers) unavailable on this browser — go straight to the main thread.
    return runInline(request)
  }

  let settled = false
  let fallback: GenHandle | null = null
  let resolveFn: (l: LevelJson) => void = () => {}
  let rejectFn: (e: Error) => void = () => {}

  const promise = new Promise<LevelJson>((resolve, reject) => {
    resolveFn = resolve
    rejectFn = reject
  })

  worker.onmessage = (e: MessageEvent) => {
    if (settled) return
    settled = true
    worker.terminate()
    const data = e.data as { ok: boolean; level?: LevelJson; error?: string }
    if (data.ok && data.level) resolveFn(data.level)
    else rejectFn(new Error(data.error ?? 'generation failed'))
  }
  worker.onerror = () => {
    if (settled) return
    settled = true
    worker.terminate()
    // The worker failed to load or run (e.g. module workers unsupported here) —
    // transparently retry on the main thread instead of failing the request.
    fallback = runInline(request)
    fallback.promise.then(resolveFn, rejectFn)
  }
  worker.postMessage(request)

  const cancel = () => {
    if (fallback) return fallback.cancel()
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
