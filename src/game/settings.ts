/**
 * Global app settings behind the gear menu — one shared store so every screen
 * (game, level picker, editor, generator) sees changes immediately. Persisted
 * to localStorage on every update. Language is NOT here: i18next already owns
 * and persists it (see src/i18n/index.ts).
 */
import { useSyncExternalStore } from 'react'
import { loadAppSettings, saveAppSettings } from './storage.ts'

/** How much the board highlights when a suspect card is selected:
 *  'full' = every cell their statements still allow (intersection, as before),
 *  'reduced' = only what each statement REFERENCES (objects, rooms, traces),
 *  'none' = no selection highlight at all. */
export type HelpMode = 'full' | 'reduced' | 'none'

export interface AppSettings {
  /** Show the elapsed-time counter in the game header. */
  timer: boolean
  helpMode: HelpMode
  /** Tint suspect cards (and the victim's name) by gender. */
  genderColors: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  timer: true,
  helpMode: 'full',
  genderColors: true,
}

let current: AppSettings = loadAppSettings(DEFAULT_SETTINGS)
const listeners = new Set<() => void>()

export function getSettings(): AppSettings {
  return current
}

export function updateSettings(patch: Partial<AppSettings>): void {
  current = { ...current, ...patch }
  saveAppSettings(current)
  for (const notify of listeners) notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current settings, re-rendering the component on every change. */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribe, getSettings)
}
