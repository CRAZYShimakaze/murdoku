import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Renderer } from '../i18n/Renderer.ts'
import { suspectColor } from '../game/palette.ts'
import { ATTR_CHIPS } from '../game/glyphs.ts'
import Avatar from './Avatar.tsx'
import ClueText from './ClueText.tsx'
import InfoTip from './InfoTip.tsx'
import { VICTIM_ID, type Cell, type PersonId, type Puzzle } from '../engine/index.ts'

interface Props {
  puzzle: Puzzle
  suspectIndex: Map<PersonId, number>
  placements: Map<PersonId, Cell>
  selectedSuspect: PersonId | null
  onSelect: (id: PersonId) => void
  onHoverSuspect?: (id: PersonId | null) => void
  hint: string | null
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
}: Props) {
  const { t, i18n } = useTranslation()

  const lang = i18n.resolvedLanguage ?? i18n.language
  const renderer = useMemo(
    () => new Renderer(i18n.getResourceBundle(lang, 'translation'), puzzle),
    [i18n, lang, puzzle],
  )

  const attrInfo = (attributes: Readonly<Record<string, unknown>>): ReactNode => (
    <span className="mk-tipinfo">
      <span>
        {attributes.gender === 'm' ? '♂' : '♀'}{' '}
        {t(attributes.gender === 'm' ? 'info.male' : 'info.female')}
      </span>
      {attributes.beard === true && <span>🧔 {t('info.beard')}</span>}
      {attributes.glasses === true && <span>👓 {t('info.glasses')}</span>}
    </span>
  )

  return (
    <div className="mk-clues">
      <p className="mk-clues__title">{t('game.suspects')}</p>
      <p className="mk-clues__hint">{t('game.selectPrompt')}</p>

      {hint && (
        <div className="mk-hintbar">
          <strong>{t('tool.hint')}</strong>
          {hint}
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
            data-selected={selectedSuspect === s.id}
            data-placed={placed}
            onClick={() => onSelect(s.id)}
            onPointerEnter={() => onHoverSuspect?.(s.id)}
            onPointerLeave={() => onHoverSuspect?.(null)}
          >
            <InfoTip className="mk-avatarwrap" anchor=".mk-clue" content={attrInfo(s.attributes)}>
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
        <span className="mk-token mk-token--victim">☠</span>
        <span className="mk-clue__main">
          <span className="mk-clue__name">
            {puzzle.victim.name}
            {placements.has(VICTIM_ID) && <span className="mk-clue__check">✓</span>}
          </span>
          <span className="mk-clue__text">
            {t('game.victim')} — {t('game.victimStatement')}
          </span>
        </span>
      </button>
    </div>
  )
}
