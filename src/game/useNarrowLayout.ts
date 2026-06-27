import { useEffect, useState } from 'react'

/** The exact breakpoint the game/editor CSS uses to switch from the desktop
 *  three-column layout (clues | board | tools) to the stacked phone layout
 *  (board → clues → tools). */
export const NARROW_QUERY = '(orientation: portrait), (max-width: 860px)'

/** True on the narrow/portrait ("mobile"/Android) layout — false on the wide
 *  desktop layout. Tracks live, so a window resize or rotation flips it.
 *  Use it to pick layout-specific copy (hover vs. tap, side vs. below the board). */
export function useNarrowLayout(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY)
    const onChange = () => setNarrow(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}
