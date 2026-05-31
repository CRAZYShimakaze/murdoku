import { useMemo } from 'react'
import GameScreen from './GameScreen.tsx'
import { LEVELS } from '../game/levels.ts'

/** The interactive, guided walkthrough — GameScreen on the demo level with the
 *  tutorial flow (coach + validation) enabled. */
export default function TutorialScreen({ onExit }: { onExit: () => void }) {
  const demo = useMemo(() => LEVELS.find((l) => l.id === 'demo-4x4') ?? LEVELS[0], [])
  return <GameScreen meta={demo} tutorial onBack={onExit} />
}
