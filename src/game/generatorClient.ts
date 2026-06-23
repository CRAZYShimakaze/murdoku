import { fillBoardClues, generateLevel } from '../engine/generator/index.ts'
import type { FillBoardOptions, GenBudget, GenerateOptions } from '../engine/generator/index.ts'
import type { LevelJson } from '../engine/index.ts'
import { makeClueMatchers, type Condition } from './editorClues.ts'

export interface GenHandle {
  promise: Promise<LevelJson>
  /** Terminate the worker and reject the promise with a 'cancelled' error. */
  cancel: () => void
}

type WorkerRequest =
  | { kind: 'generate'; opts: GenerateOptions }
  | { kind: 'fill'; board: LevelJson; opts: FillBoardOptions; palette?: Condition[] }

// In the WORKER, Cancel = worker.terminate(), which kills the thread instantly at any
// point — so we don't need tight time limits, just a high safety wall in case a config
// is impossible. The user stops it whenever they like.
const WORKER_BUDGET: GenBudget = { maxAttempts: 4000, softMs: 8000, hardMs: 90000 }
// In the MAIN-THREAD fallback the work runs synchronously and Cancel can't interrupt it,
// so it must self-cap to keep the UI from freezing for long.
const FALLBACK_BUDGET: GenBudget = { maxAttempts: 200, softMs: 2500, hardMs: 8000 }

/** Return the request with a search budget merged into its opts.
 *  Branch on `kind` so each arm narrows `request` to one union member — spreading
 *  the union directly ({ ...request, opts: { ...request.opts, budget } }) loses the
 *  kind↔opts correlation and won't type-check, so the two arms must stay split. */
function withBudget(request: WorkerRequest, budget: GenBudget): WorkerRequest {
  return request.kind === 'fill'
    ? { ...request, opts: { ...request.opts, budget } }
    : { ...request, opts: { ...request.opts, budget } }
}

/**
 * Run the request on the MAIN THREAD — the fallback for browsers that can't run
 * our module worker (notably some mobile browsers: older iOS Safari, Firefox for
 * Android, several in-app WebViews). The yield (setTimeout 0) gives the "generating"
 * overlay a chance to paint before the (blocking) CPU work begins. The generator is
 * imported statically: the screens that reach this code already pull it in, so a
 * dynamic import here would never split it into its own chunk anyway.
 */
function runInline(request: WorkerRequest): GenHandle {
  const req = withBudget(request, FALLBACK_BUDGET)
  let cancelled = false
  const promise = (async () => {
    await new Promise((r) => setTimeout(r, 0))
    if (cancelled) throw new Error('cancelled')
    let level: LevelJson | null
    if (req.kind === 'fill') {
      const requiredClues = makeClueMatchers(req.palette)
      level = fillBoardClues(req.board, requiredClues ? { ...req.opts, requiredClues } : req.opts)
    } else {
      level = generateLevel(req.opts)
    }
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
  worker.postMessage(withBudget(request, WORKER_BUDGET))

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

/** Keep the given board, (re)generate its people + clues at the chosen difficulty.
 *  An optional `palette` restricts which clue shapes may be used (the editor's
 *  "Zufällig setzen mit Vorgaben"). */
export function fillBoardCluesAsync(
  board: LevelJson,
  opts: FillBoardOptions,
  palette?: Condition[],
): GenHandle {
  return runWorker({ kind: 'fill', board, opts, palette })
}
