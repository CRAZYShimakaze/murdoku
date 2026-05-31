import { useState } from 'react'
import StartScreen from './screens/StartScreen.tsx'
import LevelSelect from './screens/LevelSelect.tsx'
import GameScreen from './screens/GameScreen.tsx'
import { LEVELS, type LevelMeta } from './game/levels.ts'

type Screen = { name: 'start' } | { name: 'select' } | { name: 'game'; level: LevelMeta }

/** Optional deep-link: `#game=<level-id>` opens that level directly. */
function initialScreen(): Screen {
  const match = /[#&]game=([^&]+)/.exec(window.location.hash)
  if (match) {
    const level = LEVELS.find((l) => l.id === decodeURIComponent(match[1]))
    if (level) return { name: 'game', level }
  }
  return { name: 'start' }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen)

  switch (screen.name) {
    case 'start':
      return <StartScreen onPlay={() => setScreen({ name: 'select' })} />
    case 'select':
      return (
        <LevelSelect
          onPick={(level) => setScreen({ name: 'game', level })}
          onBack={() => setScreen({ name: 'start' })}
        />
      )
    case 'game':
      return (
        <GameScreen
          key={screen.level.id}
          meta={screen.level}
          onBack={() => setScreen({ name: 'select' })}
        />
      )
  }
}
