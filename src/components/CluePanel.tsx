import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Renderer } from '../i18n/Renderer.ts'
import { suspectColor } from '../game/palette.ts'
import { useSettings } from '../game/settings.ts'
import { ATTR_CHIPS } from '../game/glyphs.ts'
import Avatar from './Avatar.tsx'
import AppearanceInfo from './AppearanceInfo.tsx'
import ClueText from './ClueText.tsx'
import InfoTip from './InfoTip.tsx'
import {
  AndClue,
  InsideXorClue,
  NotClue,
  OrClue,
  OutsideClue,
  VICTIM_ID,
  type Clue,
  type Cell,
  type PersonId,
  type Puzzle,
} from '../engine/index.ts'

/** True if a clue (or any nested sub-clue) depends on the indoor/outdoor split. */
function refersToInsideOutside(clue: Clue): boolean {
  if (clue instanceof OutsideClue || clue instanceof InsideXorClue) return true
  if (clue instanceof NotClue) return refersToInsideOutside(clue.inner)
  if (clue instanceof AndClue || clue instanceof OrClue) return clue.clues.some(refersToInsideOutside)
  return false
}

interface Props {
  puzzle: Puzzle
  suspectIndex: Map<PersonId, number>
  placements: Map<PersonId, Cell>
  selectedSuspect: PersonId | null
  onSelect: (id: PersonId) => void
  onHoverSuspect?: (id: PersonId | null) => void
  hint: string | null
  /** Optional step-by-step reasoning chain shown under the hint. */
  hintChain?: string[] | null
  /** Bumped each time the player requests a hint — scrolls it into view. */
  hintRequestId?: number
}

function attrChips(attributes: Readonly<Record<string, unknown>>): string[] {
  const chips: string[] = []
  for (const [key, value] of Object.entries(attributes)) {
    const chip = ATTR_CHIPS[key]?.(value)
    if (chip) chips.push(chip.trim())
  }
  return chips
}

export default function CluePanel({
  puzzle,
  suspectIndex,
  placements,
  selectedSuspect,
  onSelect,
  onHoverSuspect,
  hint,
  hintChain,
  hintRequestId,
}: Props) {
  const { t, i18n } = useTranslation()
  const { genderColors } = useSettings()

  // The hint bar sits above the suspects, so on a scrolled-down or mobile panel
  // it's off-screen when requested. Each hint request smoothly brings it into
  // view: `nearest` aligns it to the top edge when scrolled past it, and skips
  // the scroll entirely when it's already visible.
  const hintBarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!hintRequestId) return
    hintBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [hintRequestId])

  const lang = i18n.resolvedLanguage ?? i18n.language
  const renderer = useMemo(
    () => new Renderer(i18n.getResourceBundle(lang, 'translation'), puzzle),
    [i18n, lang, puzzle],
  )

  // The victim carries a gender too — shown as info the player can use (older
  // levels without it default to male, matching the editor's default).
  const victimGender: 'm' | 'f' = puzzle.victim.attributes.gender === 'f' ? 'f' : 'm'

  // Board-wide notes shown above the suspects: which rooms are outdoors + any
  // board clues ("exactly one person on a mud puddle", …).
  const boardNotes = useMemo(() => {
    const notes: string[] = []
    // Only show the indoor/outdoor legend when a clue actually relies on it.
    const usesInsideOutside =
      puzzle.suspects.some((s) => s.clues.some(refersToInsideOutside)) ||
      puzzle.globalClues.some(refersToInsideOutside)
    const outside = [...puzzle.board.rooms.values()].filter((r) => r.outside).map((r) => t(r.nameKey))
    if (usesInsideOutside && outside.length > 0) {
      notes.push(`${t('game.outsideLabel')}: ${outside.join(', ')}`)
    }
    for (const clue of puzzle.boardClues) notes.push(renderer.render(clue.describe()))
    return notes
  }, [puzzle, renderer, t])

  return (
    <div className="mk-clues">
      <p className="mk-clues__title">{t('game.suspects')}</p>
      <p className="mk-clues__hint">{t('game.selectPrompt')}</p>

      {boardNotes.length > 0 && (
        <div className="mk-boardclues">
          {boardNotes.map((note, i) => (
            <p key={i} className="mk-boardclue">
              <span className="mk-boardclue__icon">🔍</span>
              {note}
            </p>
          ))}
        </div>
      )}

      {hint && (
        <div className="mk-hintbar" ref={hintBarRef}>
          <strong>{t('tool.hint')}</strong>
          {hint}
          {hintChain && hintChain.length > 0 && (
            <ol className="mk-hintchain">
              {hintChain.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {puzzle.suspects.map((s) => {
        const idx = suspectIndex.get(s.id) ?? 0
        const placed = placements.has(s.id)
        return (
          <button
            key={s.id}
            type="button"
            className="mk-clue"
            data-suspect={s.id}
            data-gender={genderColors ? (s.attributes.gender === 'f' ? 'f' : 'm') : undefined}
            data-selected={selectedSuspect === s.id}
            data-placed={placed}
            onClick={() => onSelect(s.id)}
            onPointerEnter={() => onHoverSuspect?.(s.id)}
            onPointerLeave={() => onHoverSuspect?.(null)}
          >
            <InfoTip
              className="mk-avatarwrap"
              anchor=".mk-clue"
              content={<AppearanceInfo attrs={s.attributes} letter={s.id} />}
            >
              <Avatar
                className="mk-avatar"
                attrs={s.attributes}
                color={suspectColor(idx)}
                letter={s.id}
              />
            </InfoTip>
            <span className="mk-clue__main">
              <span className="mk-clue__name">
                {s.name}
                {placed && <span className="mk-clue__check">✓</span>}
                {attrChips(s.attributes).map((chip, i) => (
                  <span key={i} className="mk-attr">
                    {chip}
                  </span>
                ))}
              </span>
              <span className="mk-clue__text">
                <ClueText renderer={renderer} clues={s.clues} subjectId={s.id} />
              </span>
            </span>
          </button>
        )
      })}

      <button
        type="button"
        className="mk-clue mk-clue--victim"
        data-suspect={VICTIM_ID}
        data-selected={selectedSuspect === VICTIM_ID}
        data-placed={placements.has(VICTIM_ID)}
        onClick={() => onSelect(VICTIM_ID)}
      >
        <InfoTip
          className="mk-avatarwrap"
          anchor=".mk-clue"
          content={
            <span className="mk-tipinfo">
              <span>
                {victimGender === 'm' ? '♂' : '♀'}{' '}
                {t(victimGender === 'm' ? 'info.male' : 'info.female')}
              </span>
            </span>
          }
        >
          <span className="mk-token mk-token--victim">☠</span>
        </InfoTip>
        <span className="mk-clue__main">
          <span className="mk-clue__name">
            <span className="mk-victimname" data-gender={genderColors ? victimGender : undefined}>
              {puzzle.victim.name}
            </span>
            {placements.has(VICTIM_ID) && <span className="mk-clue__check">✓</span>}
            <span className="mk-attr">{victimGender === 'm' ? '♂' : '♀'}</span>
          </span>
          <span className="mk-clue__text">
            {t('game.victim')} — {t('game.victimStatement')}
          </span>
        </span>
      </button>
    </div>
  )
}
