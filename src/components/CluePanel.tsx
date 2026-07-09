import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Renderer } from '../i18n/Renderer.ts'
import { suspectColor } from '../game/palette.ts'
import { useSettings } from '../game/settings.ts'
import AttrIcons from './AttrIcons.tsx'
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
  isWaterRoom,
  type Clue,
  type Cell,
  type HintResult,
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

/** Hand-drawn line-art badge for each correction-hint variant (no emoji, on-theme). */
const HINT_GLYPHS: Record<string, ReactNode> = {
  // Note struck out — remove your pencil note.
  note: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
      <path d="M8 16 16 8" />
    </svg>
  ),
  // A person crossed out — take the misplaced figure back off.
  figure: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M4 4 20 20" strokeWidth="1.5" />
    </svg>
  ),
  // A bold X — cross these empty cells out.
  cross: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 6 18 18M18 6 6 18" />
    </svg>
  ),
  // An undo arrow — take a wrong cross back.
  uncross: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 7 5 11l4 4" />
      <path d="M5 11h8a5 5 0 0 1 5 5v2" />
    </svg>
  ),
}

/** Correction-hint kinds that render as the coloured verdict box (not the numbered
 *  deduction chain). Maps each to its accent variant + uppercase action label. */
const HINT_FAMILY: Partial<Record<HintResult['kind'], { variant: string; label: string; person: boolean }>> = {
  unmark: { variant: 'note', label: 'tool.removeNote', person: true },
  unplace: { variant: 'figure', label: 'tool.removeFigure', person: true },
  exclude: { variant: 'cross', label: 'tool.crossOut', person: false },
  uncross: { variant: 'uncross', label: 'tool.removeCrossLabel', person: false },
}

interface Props {
  puzzle: Puzzle
  suspectIndex: Map<PersonId, number>
  placements: Map<PersonId, Cell>
  selectedSuspect: PersonId | null
  /** Other suspects the selected one's clues are "about" — their cards pulse with a ring. */
  related?: Set<PersonId> | null
  onSelect: (id: PersonId) => void
  onHoverSuspect?: (id: PersonId | null) => void
  hint: string | null
  /** Optional step-by-step reasoning chain shown under the hint. */
  hintChain?: string[] | null
  /** Render the chain as plain reason lines (no numbering, no gold "conclusion" line) — for
   *  player-error hints, whose lines are equal reasons, not a numbered deduction. */
  hintPlain?: boolean
  /** The raw active hint. Correction hints (remove note/figure, cross out, remove cross)
   *  render as the coloured verdict box instead of the plain text + chain. */
  activeHint?: HintResult | null
  /** Bumped each time the player requests a hint — scrolls it into view. */
  hintRequestId?: number
}

export default function CluePanel({
  puzzle,
  suspectIndex,
  placements,
  selectedSuspect,
  related,
  onSelect,
  onHoverSuspect,
  hint,
  hintChain,
  hintPlain,
  activeHint,
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
    // A water room is drawn as a lake but is a NORMAL, walkable room — say so as a
    // global rule so players know someone can stand in the water too.
    if ([...puzzle.board.rooms.values()].some((r) => isWaterRoom(r.nameKey))) {
      notes.push(t('game.waterWalkable'))
    }
    for (const clue of puzzle.boardClues) notes.push(renderer.render(clue.describe()))
    return notes
  }, [puzzle, renderer, t])

  // Correction hints (remove note/figure, cross out, remove cross) render as the coloured
  // verdict box: the action label + WHO/WHERE (in the person's own colour) first, the short
  // reason under it. Everything else (place/narrow, "no hint") keeps the plain text box.
  const hintBox = useMemo(() => {
    if (!activeHint) return null
    const fam = HINT_FAMILY[activeHint.kind]
    if (!fam) return null
    const step = activeHint.step
    let personId: PersonId | undefined
    let personName: string | undefined
    let accent: string | undefined
    if (fam.person && step.personId) {
      personId = step.personId
      personName = puzzle.suspects.find((x) => x.id === personId)?.name
      accent = suspectColor(suspectIndex.get(step.personId) ?? 0)
    }
    const cells = activeHint.focus.map((c) => renderer.cell(c))
    let why: string[]
    if (activeHint.kind === 'exclude') {
      // The deduction, minus the "→ cross these out" conclusion the header now carries.
      why = [
        renderer.render(step.explanation),
        ...(step.chain ?? []).filter((e) => e.key !== 'why.crossThis').map((e) => renderer.render(e)),
      ]
    } else if (activeHint.kind === 'uncross') {
      why = [t('tool.uncrossWhy')]
    } else if (step.chain && step.chain.length > 0) {
      why = step.chain.map((e) => renderer.render(e))
    } else {
      why = [t('tool.figureWrongWhy')]
    }
    return { variant: fam.variant, label: fam.label, personId, personName, accent, cells, why }
  }, [activeHint, puzzle, suspectIndex, renderer, t])

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

      {hintBox ? (
        <div
          className="mk-hintbox"
          data-variant={hintBox.variant}
          ref={hintBarRef}
          style={hintBox.accent ? ({ ['--hint-accent']: hintBox.accent } as CSSProperties) : undefined}
        >
          <div className="mk-hintbox__head">
            <span className="mk-hintbox__badge">{HINT_GLYPHS[hintBox.variant]}</span>
            <span className="mk-hintbox__label">{t(hintBox.label)}</span>
          </div>
          <div className="mk-hintbox__verdict">
            {hintBox.personId && <span className="mk-tok">{hintBox.personId}</span>}
            {hintBox.personName && (
              <span>
                <span className="mk-hintbox__name">{hintBox.personName}</span>{' '}
                <span className="mk-hintbox__neg">{t('tool.cantBeOn')}</span>
              </span>
            )}
            {hintBox.cells.map((label, i) => (
              <span
                key={i}
                className={hintBox.variant === 'cross' ? 'mk-cellchip mk-cellchip--x' : 'mk-cellchip'}
              >
                {label}
              </span>
            ))}
          </div>
          {hintBox.why.length > 0 && (
            <div className="mk-hintbox__why">
              {hintBox.why.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
        </div>
      ) : hint ? (
        <div className="mk-hintbar" ref={hintBarRef}>
          <strong>{t('tool.hint')}</strong>
          {hint}
          {hintChain && hintChain.length > 0 && (
            hintPlain ? (
              hintChain.map((line, i) => (
                <p key={i} className="mk-hintreason">
                  {line}
                </p>
              ))
            ) : (
              <ol className="mk-hintchain">
                {hintChain.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
            )
          )}
        </div>
      ) : null}

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
            data-related={related?.has(s.id) ? true : undefined}
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
                <AttrIcons attrs={s.attributes} />
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
