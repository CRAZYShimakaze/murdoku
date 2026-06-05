import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Avatar from './Avatar.tsx'
import AppearanceInfo from './AppearanceInfo.tsx'
import InfoTip from './InfoTip.tsx'
import ClueBuilder, { type ClueCtx } from './ClueBuilder.tsx'
import { Renderer } from '../i18n/Renderer.ts'
import { suspectColor } from '../game/palette.ts'
import { HAIR_COLORS, type ClueGroup } from '../game/editorClues.ts'
import { BEARD_STYLES, GLASSES_COLORS, GLASSES_SHAPES, hairstylesFor } from '../game/avatar.ts'
import {
  ROOM_IDS,
  buildPlayableLevel,
  presentObjectTypes,
  suspectAttributes,
  usedRooms,
  type EditorState,
  type EditorSuspect,
} from '../game/editorModel.ts'
import { loadLevel } from '../engine/index.ts'

interface Props {
  state: EditorState
  onChangeSuspect: (index: number, suspect: EditorSuspect) => void
  onChangeVictim: (name: string, gender: 'm' | 'f') => void
  /** Generate people + clues onto the current board (kept as-is). */
  onRandom: () => void
  randomizing: boolean
}

/** Render a suspect's clue group to a single readable line (best effort). */
function useCluePreview(state: EditorState) {
  const { i18n } = useTranslation()
  const lang = i18n.resolvedLanguage ?? i18n.language
  return (index: number): string | null => {
    try {
      const level = buildPlayableLevel(state, 'preview')
      const puzzle = loadLevel(level)
      const renderer = new Renderer(i18n.getResourceBundle(lang, 'translation'), puzzle)
      const s = puzzle.suspects[index]
      if (!s || s.clues.length === 0) return null
      return s.clues.map((c) => renderer.clue(c.describe(), s.id)).join(' · ')
    } catch {
      return null
    }
  }
}

export default function SuspectsPanel({
  state,
  onChangeSuspect,
  onChangeVictim,
  onRandom,
  randomizing,
}: Props) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState<number | 'victim' | null>(null)
  const preview = useCluePreview(state)

  return (
    <div className="mk-clues mk-editor__left">
      <p className="mk-clues__title">{t('game.suspects')}</p>

      {state.suspects.map((s, i) => {
        const line = preview(i)
        return (
          <button
            key={s.id}
            type="button"
            className="mk-clue"
            data-suspect={s.id}
            onClick={() => setEditing(i)}
          >
            <InfoTip
              className="mk-avatarwrap"
              anchor=".mk-clue"
              content={<AppearanceInfo attrs={suspectAttributes(s)} letter={s.id} />}
            >
              <Avatar
                className="mk-avatar"
                attrs={suspectAttributes(s)}
                color={suspectColor(i)}
                letter={s.id}
              />
            </InfoTip>
            <span className="mk-clue__main">
              <span className="mk-clue__name">
                {s.name || s.id}
                <span className="mk-attr" title={t(s.gender === 'm' ? 'info.male' : 'info.female')}>
                  {s.gender === 'm' ? '♂' : '♀'}
                </span>
              </span>
              <span className="mk-clue__text">{line ?? t('editor.noClue')}</span>
            </span>
          </button>
        )
      })}

      <button
        type="button"
        className="mk-clue mk-clue--victim"
        onClick={() => setEditing('victim')}
      >
        <InfoTip
          className="mk-avatarwrap"
          anchor=".mk-clue"
          content={
            <span className="mk-tipinfo">
              <span>
                {state.victim.gender === 'm' ? '♂' : '♀'}{' '}
                {t(state.victim.gender === 'm' ? 'info.male' : 'info.female')}
              </span>
            </span>
          }
        >
          <span className="mk-token mk-token--victim">☠</span>
        </InfoTip>
        <span className="mk-clue__main">
          <span className="mk-clue__name">
            {state.victim.name || t('game.victim')}
            <span className="mk-attr">{state.victim.gender === 'm' ? '♂' : '♀'}</span>
          </span>
          <span className="mk-clue__text">{t('game.victim')}</span>
        </span>
      </button>

      {/* Spaced apart from the victim so it isn't pressed by accident. */}
      <button
        type="button"
        className="mk-clue mk-clue--random"
        onClick={onRandom}
        disabled={randomizing}
      >
        <span className="mk-token mk-token--random">🎲</span>
        <span className="mk-clue__main">
          <span className="mk-clue__name">{t('editor.random')}</span>
          <span className="mk-clue__text">{t('editor.randomHint')}</span>
        </span>
      </button>

      {typeof editing === 'number' && (
        <SuspectEditor
          state={state}
          index={editing}
          onChange={(s) => onChangeSuspect(editing, s)}
          onClose={() => setEditing(null)}
        />
      )}
      {editing === 'victim' && (
        <VictimEditor
          name={state.victim.name}
          gender={state.victim.gender}
          onChange={onChangeVictim}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

interface EditorProps {
  state: EditorState
  index: number
  onChange: (suspect: EditorSuspect) => void
  onClose: () => void
}

function SuspectEditor({ state, index, onChange, onClose }: EditorProps) {
  const { t } = useTranslation()
  const s = state.suspects[index]
  const preview = useCluePreview(state)(index)

  const ctx: ClueCtx = useMemo(() => {
    const rooms = usedRooms(state)
    return {
      rooms: rooms.length ? rooms : ['1'],
      objects: presentObjectTypes(state),
      others: state.suspects.filter((o) => o.id !== s.id).map((o) => ({ id: o.id, name: o.name || o.id })),
      size: state.size,
      roomLabel: (id) => {
        const i = ROOM_IDS.indexOf(id)
        return t(state.roomNames[i] ?? `room.editor${id}`)
      },
    }
  }, [state, s.id, t])

  const trait = (key: 'beard' | 'glasses' | 'bald', label: string) => (
    <button
      type="button"
      className="mk-chip"
      data-active={s[key]}
      onClick={() => onChange({ ...s, [key]: !s[key] })}
    >
      {label}
    </button>
  )

  /** A labelled style dropdown (hairstyle / beard / glasses) writing one field. */
  const styleSelect = (
    key: 'hairstyle' | 'beardStyle' | 'glassesShape' | 'glassesColor',
    value: string,
    options: readonly string[],
    labelPrefix: string,
    autoLabel?: string,
  ) => (
    <label className="mk-fieldlet">
      <span className="mk-fieldlet__label">{t(`editor.${key}`)}</span>
      <select
        className="mk-select-input"
        value={value}
        onChange={(e) => onChange({ ...s, [key]: e.target.value })}
      >
        {autoLabel !== undefined && <option value="">{autoLabel}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {t(`${labelPrefix}.${o}`)}
          </option>
        ))}
      </select>
    </label>
  )

  // Only offer hairstyles valid for the current gender; cross-gender → "auto".
  const hairOptions = hairstylesFor(s.gender)
  const hairstyleValue = s.hairstyle && hairOptions.includes(s.hairstyle) ? s.hairstyle : ''

  return (
    <div className="mk-overlay" onClick={onClose}>
      <div className="mk-dialog mk-suspedit" onClick={(e) => e.stopPropagation()}>
        <div className="mk-suspedit__head">
          <Avatar
            className="mk-avatar mk-suspedit__avatar"
            attrs={suspectAttributes(s)}
            color={suspectColor(index)}
            letter={s.id}
          />
          <input
            className="mk-input"
            value={s.name}
            placeholder={s.id}
            onChange={(e) => onChange({ ...s, name: e.target.value })}
          />
        </div>

        <div className="mk-suspedit__traits">
          {(['m', 'f'] as const).map((g) => (
            <button
              key={g}
              type="button"
              className="mk-chip"
              data-active={s.gender === g}
              onClick={() => onChange({ ...s, gender: g, hairstyle: '' })}
            >
              {g === 'm' ? `♂ ${t('info.male')}` : `♀ ${t('info.female')}`}
            </button>
          ))}
          {trait('beard', `🧔 ${t('info.beard')}`)}
          {trait('glasses', `👓 ${t('info.glasses')}`)}
          {trait('bald', `🧑‍🦲 ${t('info.bald')}`)}
        </div>

        <div className="mk-suspedit__traits">
          {!s.bald && (
            <>
              <label className="mk-fieldlet">
                <span className="mk-fieldlet__label">{t('editor.hair')}</span>
                <select
                  className="mk-select-input"
                  value={s.hair}
                  onChange={(e) => onChange({ ...s, hair: e.target.value })}
                >
                  <option value="">{t('editor.hairDefault')}</option>
                  {HAIR_COLORS.map((h) => (
                    <option key={h} value={h}>
                      {t(`hairColor.${h}`)}
                    </option>
                  ))}
                </select>
              </label>
              {styleSelect('hairstyle', hairstyleValue, hairOptions, 'hairstyle', t('editor.styleAuto'))}
            </>
          )}
          {s.beard && styleSelect('beardStyle', s.beardStyle || 'full', BEARD_STYLES, 'beardStyle')}
          {s.glasses && (
            <>
              {styleSelect('glassesShape', s.glassesShape || 'round', GLASSES_SHAPES, 'glassesShape')}
              {styleSelect('glassesColor', s.glassesColor || 'black', GLASSES_COLORS, 'glassesColor')}
            </>
          )}
        </div>

        <p className="mk-suspedit__label">{t('editor.clueTitle')}</p>
        <ClueBuilder
          group={s.clue}
          ctx={ctx}
          onChange={(clue: ClueGroup) => onChange({ ...s, clue })}
        />

        <p className="mk-suspedit__preview">
          <span>{t('editor.cluePreview')}</span> {preview ?? t('editor.noClue')}
        </p>

        <button type="button" className="mk-btn mk-btn--primary mk-btn--block" onClick={onClose}>
          {t('editor.done')}
        </button>
      </div>
    </div>
  )
}

interface VictimProps {
  name: string
  gender: 'm' | 'f'
  onChange: (name: string, gender: 'm' | 'f') => void
  onClose: () => void
}

function VictimEditor({ name, gender, onChange, onClose }: VictimProps) {
  const { t } = useTranslation()
  return (
    <div className="mk-overlay" onClick={onClose}>
      <div className="mk-dialog mk-suspedit" onClick={(e) => e.stopPropagation()}>
        <div className="mk-suspedit__head">
          <span className="mk-token mk-token--victim">☠</span>
          <input
            className="mk-input"
            value={name}
            placeholder={t('game.victim')}
            onChange={(e) => onChange(e.target.value, gender)}
          />
        </div>
        <div className="mk-suspedit__traits">
          {(['m', 'f'] as const).map((g) => (
            <button
              key={g}
              type="button"
              className="mk-chip"
              data-active={gender === g}
              onClick={() => onChange(name, g)}
            >
              {g === 'm' ? `♂ ${t('info.male')}` : `♀ ${t('info.female')}`}
            </button>
          ))}
        </div>
        <button type="button" className="mk-btn mk-btn--primary mk-btn--block" onClick={onClose}>
          {t('editor.done')}
        </button>
      </div>
    </div>
  )
}
