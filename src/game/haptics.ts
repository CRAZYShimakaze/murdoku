import { Capacitor } from '@capacitor/core'

/**
 * A light haptic tick, fired when a long-press is recognised so placing/removing a
 * figure feels tactile — the tactile "you're setting a figure" cue Dirk liked.
 *
 * Native (Android) only on purpose: mobile browsers already fire their own long-press
 * haptic, so triggering one here as well would double up. The plugin is imported lazily
 * so the web bundle doesn't pull in the native bridge, and every failure is swallowed
 * (haptics are a nicety, never load-bearing).
 */
export function hapticTick(): void {
  if (!Capacitor.isNativePlatform()) return
  void import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => {})
}
