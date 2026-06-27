import { useEffect, useRef } from 'react'

/**
 * A LIFO stack of back-button interceptors for the Android hardware/gesture back.
 * An open dialog (suspect editor, save dialog, …) registers itself while open; the
 * back press then runs the *newest* interceptor (closing that one layer) instead of
 * the screen navigating away. If the stack is empty the caller falls back to the
 * normal screen-up navigation. One mechanism, reused everywhere (DRY).
 */
type Interceptor = () => void
const stack: Interceptor[] = []

/** Run the top interceptor, if any. Returns true when a back was consumed. */
export function consumeBack(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}

/**
 * While `active` is true, register `onBack` as the top interceptor (e.g. a dialog's
 * close handler). The latest-mounted active layer wins, which matches visual nesting.
 */
export function useBackInterceptor(active: boolean, onBack: () => void): void {
  const ref = useRef(onBack)
  ref.current = onBack
  useEffect(() => {
    if (!active) return
    const fn: Interceptor = () => ref.current()
    stack.push(fn)
    return () => {
      const i = stack.indexOf(fn)
      if (i >= 0) stack.splice(i, 1)
    }
  }, [active])
}
