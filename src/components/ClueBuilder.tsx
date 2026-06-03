import { useTranslation } from 'react-i18next'
import {
  ATTR_KINDS,
  COND_KINDS,
  DIRECTIONS_8,
  HAIR_COLORS,
  LINE_KINDS,
  QUANTIFIERS,
  ROOM_RELS,
  defaultCondition,
  type AttrKind,
  type ClueGroup,
  type CondKind,
  type Condition,
  type Quantifier,
} from '../game/editorClues.ts'
import type { Direction8, LineKind, RoomRel } from '../engine/index.ts'

export interface ClueCtx {
  rooms: string[]
  objects: string[]
  others: { id: string; name: string }[]
  size: number
  roomLabel: (id: string) => string
}

interface Props {
  group: ClueGroup
  ctx: ClueCtx
  onChange: (group: ClueGroup) => void
}

/** Flat clue builder: a list of conditions joined by one connector, each with NICHT. */
export default function ClueBuilder({ group, ctx, onChange }: Props) {
  const { t } = useTranslation()

  const update = (i: number, patch: Partial<Condition>) =>
    onChange({
      ...group,
      conditions: group.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    })

  const remove = (i: number) =>
    onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) })

  const add = () =>
    onChange({ ...group, conditions: [...group.conditions, defaultCondition('inRoom', ctx)] })

  const objName = (type: string) => t(`objName.${type}`)

  /** Object-type picker (shared by every object-based condition). */
  const objectSelect = (c: Condition, i: number) => (
    <select
      className="mk-select-input mk-cond__val"
      value={c.object ?? ''}
      onChange={(e) => update(i, { object: e.target.value })}
    >
      {ctx.objects.map((o) => (
        <option key={o} value={o}>
          {objName(o)}
        </option>
      ))}
    </select>
  )

  /** Room qualifier (egal / same room / other room) for object clues. */
  const roomRelSelect = (c: Condition, i: number) => (
    <select
      className="mk-select-input mk-cond__val"
      value={c.roomRel ?? 'any'}
      onChange={(e) => update(i, { roomRel: e.target.value as RoomRel })}
    >
      {ROOM_RELS.map((r) => (
        <option key={r} value={r}>
          {t(`roomRelLabel.${r}`)}
        </option>
      ))}
    </select>
  )

  /** The value control(s) for one condition's kind. */
  const valueControls = (c: Condition, i: number) => {
    switch (c.kind) {
      case 'inRoom':
        return (
          <select
            className="mk-select-input mk-cond__val"
            value={c.room ?? ''}
            onChange={(e) => update(i, { room: e.target.value })}
          >
            {ctx.rooms.map((r) => (
              <option key={r} value={r}>
                {ctx.roomLabel(r)}
              </option>
            ))}
          </select>
        )
      case 'onObject':
      case 'uniqueOnObject':
      case 'nearObject':
        return objectSelect(c, i)
      case 'sameLineAsObject':
        return (
          <>
            {objectSelect(c, i)}
            <select
              className="mk-select-input mk-cond__val"
              value={c.line ?? 'col'}
              onChange={(e) => update(i, { line: e.target.value as LineKind })}
            >
              {LINE_KINDS.map((l) => (
                <option key={l} value={l}>
                  {t(`lineLabel.${l}`)}
                </option>
              ))}
            </select>
            {roomRelSelect(c, i)}
          </>
        )
      case 'directionFromObject':
        return (
          <>
            {objectSelect(c, i)}
            <select
              className="mk-select-input mk-cond__val"
              value={c.dir ?? 'north'}
              onChange={(e) => update(i, { dir: e.target.value as Direction8 })}
            >
              {DIRECTIONS_8.map((d) => (
                <option key={d} value={d}>
                  {t(`dir.${d}`)}
                </option>
              ))}
            </select>
            {roomRelSelect(c, i)}
          </>
        )
      case 'inRow':
      case 'inCol':
        return (
          <select
            className="mk-select-input mk-cond__val"
            value={c.index ?? 0}
            onChange={(e) => update(i, { index: Number(e.target.value) })}
          >
            {Array.from({ length: ctx.size }, (_, n) => (
              <option key={n} value={n}>
                {n + 1}
              </option>
            ))}
          </select>
        )
      case 'sameRoom':
      case 'insideXor':
        return (
          <select
            className="mk-select-input mk-cond__val"
            value={c.of ?? ''}
            onChange={(e) => update(i, { of: e.target.value })}
          >
            {ctx.others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )
      case 'direction':
        return (
          <>
            <select
              className="mk-select-input mk-cond__val"
              value={c.dir ?? 'north'}
              onChange={(e) => update(i, { dir: e.target.value as Direction8 })}
            >
              {DIRECTIONS_8.map((d) => (
                <option key={d} value={d}>
                  {t(`dir.${d}`)}
                </option>
              ))}
            </select>
            <select
              className="mk-select-input mk-cond__val"
              value={c.of ?? ''}
              onChange={(e) => update(i, { of: e.target.value })}
            >
              {ctx.others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </>
        )
      case 'roomAttribute':
        return (
          <>
            <select
              className="mk-select-input mk-cond__val"
              value={c.quantifier ?? 'some'}
              onChange={(e) => update(i, { quantifier: e.target.value as Quantifier })}
            >
              {QUANTIFIERS.map((q) => (
                <option key={q} value={q}>
                  {t(`cond.qty.${q}`)}
                </option>
              ))}
            </select>
            <select
              className="mk-select-input mk-cond__val"
              value={c.attribute ?? 'beard'}
              onChange={(e) => update(i, { attribute: e.target.value as AttrKind })}
            >
              {ATTR_KINDS.map((a) => (
                <option key={a} value={a}>
                  {t(`attrKind.${a}`)}
                </option>
              ))}
            </select>
            {c.attribute === 'hair' && (
              <select
                className="mk-select-input mk-cond__val"
                value={c.hair ?? 'blond'}
                onChange={(e) => update(i, { hair: e.target.value })}
              >
                {HAIR_COLORS.map((h) => (
                  <option key={h} value={h}>
                    {t(`hairColor.${h}`)}
                  </option>
                ))}
              </select>
            )}
          </>
        )
      default:
        return null
    }
  }

  return (
    <div className="mk-cb">
      {group.conditions.length >= 2 && (
        <div className="mk-cb__conn">
          {(['and', 'or'] as const).map((conn) => (
            <button
              key={conn}
              type="button"
              className="mk-chip"
              data-active={group.connector === conn}
              onClick={() => onChange({ ...group, connector: conn })}
            >
              {t(`conn.${conn}`)}
            </button>
          ))}
        </div>
      )}

      {group.conditions.map((c, i) => (
        <div key={i} className="mk-cond">
          <button
            type="button"
            className="mk-chip mk-cond__not"
            data-active={c.not}
            onClick={() => update(i, { not: !c.not })}
            title={t('cond.not')}
          >
            {t('cond.not')}
          </button>
          <select
            className="mk-select-input mk-cond__kind"
            value={c.kind}
            onChange={(e) => onChange({
              ...group,
              conditions: group.conditions.map((cc, j) =>
                j === i ? { ...defaultCondition(e.target.value as CondKind, ctx), not: cc.not } : cc,
              ),
            })}
          >
            {COND_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`cond.${k}`)}
              </option>
            ))}
          </select>
          {valueControls(c, i)}
          <button
            type="button"
            className="mk-cond__del"
            onClick={() => remove(i)}
            aria-label={t('cond.remove')}
          >
            ✕
          </button>
        </div>
      ))}

      <button type="button" className="mk-btn mk-btn--ghost mk-cb__add" onClick={add}>
        {t('cond.add')}
      </button>
    </div>
  )
}
