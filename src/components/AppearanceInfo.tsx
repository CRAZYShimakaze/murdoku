import { useTranslation } from 'react-i18next'
import { resolveHairstyle } from '../game/avatar.ts'
import { HAIR_COLORS } from '../game/editorClues.ts'

interface Attrs {
  gender?: unknown
  beard?: unknown
  glasses?: unknown
  bald?: unknown
  hair?: unknown
  hairstyle?: unknown
  beardStyle?: unknown
  glassesShape?: unknown
  glassesColor?: unknown
}

const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)

/**
 * The full visible appearance of a person, as tooltip lines: gender, hair (bald,
 * or style + colour), beard style, glasses shape + colour. It resolves the
 * hairstyle and style fallbacks exactly like the avatar renderer, so "what you
 * read" always matches "what you see". Shared by the in-game clue panel and the
 * editor's suspect list so both show identical info.
 */
export default function AppearanceInfo({ attrs, letter }: { attrs: Attrs; letter: string }) {
  const { t } = useTranslation()
  const male = attrs.gender === 'm'
  const hairColor = typeof attrs.hair === 'string' && HAIR_COLORS.includes(attrs.hair) ? attrs.hair : null
  const style = resolveHairstyle(attrs.gender, attrs.hairstyle, letter)

  return (
    <span className="mk-tipinfo">
      <span>
        {male ? '♂' : '♀'} {t(male ? 'info.male' : 'info.female')}
      </span>
      {attrs.bald === true ? (
        <span>🧑‍🦲 {t('info.bald')}</span>
      ) : (
        <span>
          💇 {t(`hairstyle.${style}`)}
          {hairColor ? ` · ${t(`hairColor.${hairColor}`)}` : ''}
        </span>
      )}
      {attrs.beard === true && <span>🧔 {t(`beardStyle.${str(attrs.beardStyle, 'full')}`)}</span>}
      {attrs.glasses === true && (
        <span>
          👓 {t(`glassesShape.${str(attrs.glassesShape, 'round')}`)} ·{' '}
          {t(`glassesColor.${str(attrs.glassesColor, 'black')}`)}
        </span>
      )}
    </span>
  )
}
