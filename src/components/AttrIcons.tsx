import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Small attribute chips for a suspect card (gender symbol + beard / glasses / bald).
 * The trait icons are hand-drawn ink/line art in the case-file look — NOT emoji, which
 * render as near-identical yellow faces (🧔 vs 🧑‍🦲) on many systems. The beard is a
 * distinct brown shape so it can never be confused with the bald head. One source of
 * truth, used by both the in-game clue panel and the editor's suspect list.
 */

type TraitKey = 'beard' | 'glasses' | 'bald'

const TRAIT_ICONS: Record<TraitKey, ReactNode> = {
  // A brown beard: moustache + chin beard with a small mouth gap.
  beard: (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M6 8 Q12 5.4 18 8 Q15 10.4 12 9.5 Q9 10.4 6 8 Z" fill="#7a4a28" />
      <path
        d="M5 8.5 Q5 19 12 22.5 Q19 19 19 8.5 Q16.5 14 13 13.4 L12 15 L11 13.4 Q7.5 14 5 8.5 Z"
        fill="#7a4a28"
      />
    </svg>
  ),
  // Dark glasses line-art.
  glasses: (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <g fill="none" stroke="#2a2420" strokeWidth="1.8" strokeLinejoin="round">
        <rect x="2.5" y="9" width="8" height="6.2" rx="2.6" />
        <rect x="13.5" y="9" width="8" height="6.2" rx="2.6" />
        <path d="M10.5 11.5 H13.5" />
        <path d="M2.5 10.5 L1 10" strokeLinecap="round" />
        <path d="M21.5 10.5 L23 10" strokeLinecap="round" />
      </g>
    </svg>
  ),
  // A bald head: a face with a tall shiny scalp and ears — clearly a head, not a beard.
  bald: (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <ellipse cx="4.8" cy="13.6" rx="1.7" ry="2.1" fill="#f0c6a0" stroke="#a8744a" strokeWidth="0.8" />
      <ellipse cx="19.2" cy="13.6" rx="1.7" ry="2.1" fill="#f0c6a0" stroke="#a8744a" strokeWidth="0.8" />
      <path
        d="M5.8 12.5 Q5.8 3.2 12 3.2 Q18.2 3.2 18.2 12.5 Q18.2 20.5 12 21.5 Q5.8 20.5 5.8 12.5 Z"
        fill="#f0c6a0"
        stroke="#a8744a"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M8.4 7.2 Q11 4.9 15.2 6.8" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <circle cx="9.6" cy="13.2" r="1.05" fill="#2a2420" />
      <circle cx="14.4" cy="13.2" r="1.05" fill="#2a2420" />
      <path d="M9.7 16.6 Q12 18.4 14.3 16.6" fill="none" stroke="#2a2420" strokeWidth="1" strokeLinecap="round" />
    </svg>
  ),
}

/** All visible attribute chips for one suspect. */
export default function AttrIcons({ attrs }: { attrs: Readonly<Record<string, unknown>> }) {
  const { t } = useTranslation()
  const gender = attrs.gender === 'm' ? 'm' : attrs.gender === 'f' ? 'f' : null
  return (
    <>
      {gender && (
        <span className="mk-attr" title={t(gender === 'm' ? 'info.male' : 'info.female')}>
          {gender === 'm' ? '♂' : '♀'}
        </span>
      )}
      {(['beard', 'glasses', 'bald'] as const).map((trait) =>
        attrs[trait] === true ? (
          <span key={trait} className="mk-attr mk-attr--icon" title={t(`info.${trait}`)}>
            {TRAIT_ICONS[trait]}
          </span>
        ) : null,
      )}
    </>
  )
}
