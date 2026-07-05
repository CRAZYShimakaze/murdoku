import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { consumeBack } from './game/backHandler.ts'
import StartScreen from './screens/StartScreen.tsx'
import LevelSelect from './screens/LevelSelect.tsx'
import GameScreen from './screens/GameScreen.tsx'
import GeneratorScreen from './screens/GeneratorScreen.tsx'
import TutorialScreen from './screens/TutorialScreen.tsx'
import EditorScreen from './screens/EditorScreen.tsx'
import { LEVELS, levelMetaFromJson, type LevelMeta } from './game/levels.ts'
import { loadCustomLevels } from './game/storage.ts'

type Screen =
  | { name: 'start' }
  | { name: 'select' }
  // `auto`: skip the form and immediately generate with the last-used settings
  // (from the win dialog's "Neues Level" — same options as the level just solved).
  | { name: 'generate'; auto?: boolean }
  | { name: 'tutorial' }
  | { name: 'editor'; initial?: LevelMeta }
  | { name: 'game'; level: LevelMeta; generated?: boolean; fromEditor?: boolean }

function findMeta(id: string): LevelMeta | undefined {
  const bundled = LEVELS.find((l) => l.id === id)
  if (bundled) return bundled
  const custom = loadCustomLevels().find((j) => j.id === id)
  return custom ? levelMetaFromJson(custom, true) : undefined
}

/** Optional deep-link: `#game=<level-id>` opens that level directly. */
function initialScreen(): Screen {
  const match = /[#&]game=([^&]+)/.exec(window.location.hash)
  if (match) {
    const level = findMeta(decodeURIComponent(match[1]))
    if (level) return { name: 'game', level }
  }
  if (window.location.hash.includes('tutorial')) return { name: 'tutorial' }
  if (window.location.hash.includes('generate')) return { name: 'generate' }
  if (window.location.hash.includes('editor')) return { name: 'editor' }
  return { name: 'start' }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen)
  // Latest screen for the back handler (registered once, must not go stale). Written
  // after render (not during — that trips react-hooks/refs), read only in `back`.
  const screenRef = useRef(screen)
  useEffect(() => {
    screenRef.current = screen
  })

  // One source of "go back" for both the on-screen ← buttons and Android's
  // hardware/gesture back: each screen returns to its logical parent; the root
  // (start) quits the native app. Open dialogs are handled first via the
  // back-interceptor stack (see the listener below), so this only navigates
  // between screens.
  const back = useCallback(() => {
    const cur = screenRef.current
    if (cur.name === 'game') {
      setScreen(
        cur.fromEditor
          ? { name: 'editor' }
          : cur.generated
            ? { name: 'generate' }
            : { name: 'select' },
      )
    } else if (cur.name === 'start') {
      if (Capacitor.isNativePlatform()) void CapApp.exitApp()
    } else {
      setScreen({ name: 'start' })
    }
  }, [])

  // Android back button / gesture: close the top open dialog if any, else go up.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const handle = CapApp.addListener('backButton', () => {
      if (!consumeBack()) back()
    })
    return () => {
      void handle.then((h) => h.remove())
    }
  }, [back])

  // Desktop: Escape mirrors the back button — close the top open dialog, else go up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (!consumeBack()) back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [back])

  // Only the native app offers an in-app quit (no system back bar in immersive mode).
  const onQuit = Capacitor.isNativePlatform() ? () => void CapApp.exitApp() : undefined

  switch (screen.name) {
    case 'start':
      return (
        <StartScreen
          onPlay={() => setScreen({ name: 'select' })}
          onGenerate={() => setScreen({ name: 'generate' })}
          onTutorial={() => setScreen({ name: 'tutorial' })}
          onEditor={() => setScreen({ name: 'editor' })}
          onQuit={onQuit}
        />
      )
    case 'tutorial':
      return <TutorialScreen onExit={back} />
    case 'editor':
      return (
        <EditorScreen
          initialLevel={screen.initial?.json}
          onBack={back}
          onPlay={(level) => setScreen({ name: 'game', level, fromEditor: true })}
        />
      )
    case 'select':
      return (
        <LevelSelect onPick={(level) => setScreen({ name: 'game', level })} onBack={back} />
      )
    case 'generate':
      return (
        <GeneratorScreen
          autoStart={screen.auto}
          onPlay={(level) => setScreen({ name: 'game', level, generated: true })}
          onBack={back}
        />
      )
    case 'game':
      return (
        <GameScreen
          key={screen.level.id}
          meta={screen.level}
          generated={screen.generated}
          onBack={back}
          // "Neues Level": regenerate straight away with the same options (auto-start),
          // rather than returning to the generator form ("Zur Levelauswahl" does that).
          onNew={() => setScreen({ name: 'generate', auto: true })}
          onEdit={() => setScreen({ name: 'editor', initial: screen.level })}
          onNext={
            screen.generated || screen.fromEditor
              ? undefined
              : (level) => setScreen({ name: 'game', level })
          }
        />
      )
  }
}
