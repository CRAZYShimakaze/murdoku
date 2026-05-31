import { useState } from 'react'
import StartScreen from './screens/StartScreen.tsx'
import LevelSelect from './screens/LevelSelect.tsx'
import GameScreen from './screens/GameScreen.tsx'
import GeneratorScreen from './screens/GeneratorScreen.tsx'
import { LEVELS, levelMetaFromJson, type LevelMeta } from './game/levels.ts'
import { loadCustomLevels } from './game/storage.ts'

type Screen =
  | { name: 'start' }
  | { name: 'select' }
  | { name: 'generate' }
  | { name: 'game'; level: LevelMeta; generated?: boolean }

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
  if (window.location.hash.includes('generate')) return { name: 'generate' }
  return { name: 'start' }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen)

  switch (screen.name) {
    case 'start':
      return (
        <StartScreen
          onPlay={() => setScreen({ name: 'select' })}
          onGenerate={() => setScreen({ name: 'generate' })}
        />
      )
    case 'select':
      return (
        <LevelSelect
          onPick={(level) => setScreen({ name: 'game', level })}
          onBack={() => setScreen({ name: 'start' })}
        />
      )
    case 'generate':
      return (
        <GeneratorScreen
          onPlay={(level) => setScreen({ name: 'game', level, generated: true })}
          onBack={() => setScreen({ name: 'start' })}
        />
      )
    case 'game':
      return (
        <GameScreen
          key={screen.level.id}
          meta={screen.level}
          generated={screen.generated}
          onBack={() => setScreen(screen.generated ? { name: 'generate' } : { name: 'select' })}
          onNew={() => setScreen({ name: 'generate' })}
        />
      )
  }
}
