import type { GenerateOptions } from '../engine/generator/index.ts'
import type { LevelJson } from '../engine/index.ts'

export interface GenHandle {
  promise: Promise<LevelJson>
  /** Terminate the worker and reject the promise with a 'cancelled' error. */
  cancel: () => void
}

/** Runs the (CPU-heavy) level generator in a Web Worker so the UI stays responsive. */
export function generateLevelAsync(opts: GenerateOptions): GenHandle {
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
    worker.postMessage(opts)
  })

  const cancel = () => {
    if (settled) return
    settled = true
    worker.terminate()
    rejectFn(new Error('cancelled'))
  }

  return { promise, cancel }
}
