import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Avatar from './Avatar.tsx'
import ClueBuilder, { type ClueCtx } from './ClueBuilder.tsx'
import { Renderer } from '../i18n/Renderer.ts'
import { suspectColor } from '../game/palette.ts'
import { HAIR_COLORS, type ClueGroup } from '../game/editorClues.ts'
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

export default function SuspectsPanel({ state, onChangeSuspect, onChangeVictim }: Props) {
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
            <Avatar
              className="mk-avatar"
              attrs={suspectAttributes(s)}
              color={suspectColor(i)}
              letter={s.id}
            />
            <span className="mk-clue__main">
              <span className="mk-clue__name">{s.name || s.id}</span>
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
        <span className="mk-token mk-token--victim">☠</span>
        <span className="mk-clue__main">
          <span className="mk-clue__name">{state.victim.name || t('game.victim')}</span>
          <span className="mk-clue__text">{t('game.victim')}</span>
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

  return (
    <div className="mk-overlay" onClick={onClose}>
      <div className="mk-dialog mk-suspedit" onClick={(e) => e.stopPropagation()}>
        <div className="mk-suspedit__head">
          <Avatar
            className="mk-avatar"
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
              onClick={() => onChange({ ...s, gender: g })}
            >
              {g === 'm' ? `♂ ${t('info.male')}` : `♀ ${t('info.female')}`}
            </button>
          ))}
          {trait('beard', `🧔 ${t('info.beard')}`)}
          {trait('glasses', `👓 ${t('info.glasses')}`)}
          {trait('bald', `🧑‍🦲 ${t('info.bald')}`)}
          <select
            className="mk-select-input"
            value={s.hair}
            onChange={(e) => onChange({ ...s, hair: e.target.value })}
            disabled={s.bald}
          >
            <option value="">{t('editor.hairDefault')}</option>
            {HAIR_COLORS.map((h) => (
              <option key={h} value={h}>
                {t(`hairColor.${h}`)}
              </option>
            ))}
          </select>
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
