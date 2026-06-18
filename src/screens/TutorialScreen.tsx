import { useMemo, useState } from 'react'
import GameScreen from './GameScreen.tsx'
import { LEVELS } from '../game/levels.ts'

/** The interactive, guided walkthrough — TWO levels in sequence: the 4×4 demo (placing
 *  by candidates), then "Tutorial Wohnung" (crossing fields, row/column logic, the hint &
 *  settings tools). GameScreen runs the matching tutorial script for the current phase. */
export default function TutorialScreen({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<1 | 2>(1)
  const demo = useMemo(() => LEVELS.find((l) => l.id === 'demo-4x4') ?? LEVELS[0], [])
  const wohnung = useMemo(
    () => LEVELS.find((l) => l.id === 'editor-tutorial-wohnung') ?? demo,
    [demo],
  )
  const meta = phase === 1 ? demo : wohnung

  return (
    <GameScreen
      // Remount cleanly when the phase changes — fresh session, board and clock.
      key={phase}
      meta={meta}
      tutorial
      tutorialPhase={phase}
      onTutorialAdvance={() => setPhase(2)}
      onBack={onExit}
    />
  )
}
