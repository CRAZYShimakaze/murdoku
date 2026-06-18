import { useTranslation } from 'react-i18next'
import {
  ATTR_KINDS,
  BOOL_ATTRS,
  CARDINALS,
  COND_KINDS,
  DIRECTIONS_8,
  LINE_KINDS,
  QUANTIFIERS,
  ROOM_RELS,
  VALUED_ATTRS,
  defaultCondition,
  type AttrKind,
  type AxisKind,
  type ClueGroup,
  type CondKind,
  type Condition,
  type InOutKind,
  type PortalKind,
  type Quantifier,
} from '../game/editorClues.ts'
import {
  OCCUPIABLE_OBJECT_TYPES,
  type Direction,
  type Direction8,
  type LineKind,
  type RoomRel,
} from '../engine/index.ts'

export interface ClueCtx {
  rooms: string[]
  objects: string[]
  others: { id: string; name: string }[]
  size: number
  /** Cell indices (row*size+col) holding an object of the type — for anchoring a
   *  direction clue to one specific tile when several exist. */
  objectCells: (type: string) => number[]
  /** Whether the board has any window / door — gates the "Fenster/Tür" condition. */
  hasWindows: boolean
  hasDoors: boolean
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

  /** A small on/off chip (NICHT-style) for a boolean flag on a condition. */
  const flagChip = (active: boolean, onClick: () => void, label: string, title: string) => (
    <button
      type="button"
      className="mk-chip mk-cond__flag"
      data-active={active}
      onClick={onClick}
      title={title}
    >
      {label}
    </button>
  )
  /** "einzige" toggle — the ONLY person there (on/beside object, at window/door, in/out). */
  const uniqueToggle = (c: Condition, i: number) =>
    flagChip(!!c.unique, () => update(i, { unique: !c.unique }), t('cond.uniqueToggle'), t('cond.uniqueHint'))
  /** "allein" toggle — also alone (no one else in the room). */
  const aloneToggle = (c: Condition, i: number) =>
    flagChip(!!c.alone, () => update(i, { alone: !c.alone }), t('cond.aloneToggle'), t('cond.aloneHint'))

  /** Object-type picker. `occupiableOnly` restricts it to objects a person can stand
   *  ON (for "on object") — nobody can sit on a table. */
  const objectSelect = (c: Condition, i: number, occupiableOnly = false) => {
    const options = occupiableOnly
      ? ctx.objects.filter((o) => OCCUPIABLE_OBJECT_TYPES.includes(o))
      : ctx.objects
    return (
      <select
        className="mk-select-input mk-cond__val"
        value={c.object ?? ''}
        // A tile anchor belongs to the previous object type — drop it on change.
        onChange={(e) => update(i, { object: e.target.value, at: undefined })}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {objName(o)}
          </option>
        ))}
      </select>
    )
  }

  /** Anchor picker for "direction from object": which tile of the type is meant.
   *  Only shown when several exist — with one, the clue is unambiguous anyway. */
  const objectAtSelect = (c: Condition, i: number) => {
    const cells = c.object ? ctx.objectCells(c.object) : []
    // Keep a stale anchor (object repainted since) visible instead of lying about it.
    if (c.at !== undefined && !cells.includes(c.at)) cells.push(c.at)
    if (cells.length < 2) return null
    const label = (cell: number) =>
      `${t('coord.row')}${Math.floor(cell / ctx.size) + 1}/${t('coord.col')}${(cell % ctx.size) + 1}`
    return (
      <select
        className="mk-select-input mk-cond__val"
        value={c.at ?? ''}
        onChange={(e) => update(i, { at: e.target.value === '' ? undefined : Number(e.target.value) })}
      >
        <option value="">{t('cond.atAny')}</option>
        {cells.map((cell) => (
          <option key={cell} value={cell}>
            {label(cell)}
          </option>
        ))}
      </select>
    )
  }

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

  /** Other-suspect picker writing `of`. */
  const personSelect = (c: Condition, i: number) => (
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

  /** Attribute picker (gender / boolean / valued) + a value sub-picker for valued
   *  ones. `allowAny` prepends "irgendjemand" (no trait filter — roomExists). */
  const attrSelect = (c: Condition, i: number, allowAny = false) => {
    const attr = c.attribute ?? (allowAny ? 'any' : 'beard')
    const spec = attr === 'any' ? undefined : VALUED_ATTRS[attr]
    return (
      <>
        <select
          className="mk-select-input mk-cond__val"
          value={attr}
          onChange={(e) => update(i, { attribute: e.target.value as AttrKind | 'any' })}
        >
          {allowAny && <option value="any">{t('cond.anyone')}</option>}
          {ATTR_KINDS.map((a) => (
            <option key={a} value={a}>
              {t(`attrKind.${a}`)}
            </option>
          ))}
        </select>
        {spec && (
          <select
            className="mk-select-input mk-cond__val"
            value={c.value ?? c.hair ?? spec.values[0]}
            onChange={(e) => update(i, { value: e.target.value })}
          >
            {spec.values.map((v) => (
              <option key={v} value={v}>
                {t(`${spec.labelKey}.${v}`)}
              </option>
            ))}
          </select>
        )}
      </>
    )
  }

  /** Cardinal-only direction picker (offset). */
  const cardinalSelect = (value: Direction, onPick: (d: Direction) => void) => (
    <select
      className="mk-select-input mk-cond__val"
      value={value}
      onChange={(e) => onPick(e.target.value as Direction)}
    >
      {CARDINALS.map((d) => (
        <option key={d} value={d}>
          {t(`dir.${d}`)}
        </option>
      ))}
    </select>
  )

  /** The value control(s) for one condition's kind. */
  const valueControls = (c: Condition, i: number) => {
    switch (c.kind) {
      case 'inRoom':
        return (
          <>
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
            {aloneToggle(c, i)}
          </>
        )
      case 'onObject':
        return (
          <>
            {objectSelect(c, i, true)}
            {uniqueToggle(c, i)}
          </>
        )
      case 'nearObject': {
        // Multi-select: pick one object (with optional "einzige"), or several →
        // "beside one of them". One control, no separate clue type.
        const sel = new Set(c.objects ?? [])
        return (
          <>
            <div className="mk-cond__multi">
              {ctx.objects.map((o) => (
                <button
                  key={o}
                  type="button"
                  className="mk-chip mk-cond__flag"
                  data-active={sel.has(o)}
                  onClick={() => {
                    const next = new Set(sel)
                    if (next.has(o)) next.delete(o)
                    else next.add(o)
                    update(i, { objects: [...next] })
                  }}
                >
                  {objName(o)}
                </button>
              ))}
            </div>
            {/* "einzige" only applies to a single object (no unique-of-several clue). */}
            {sel.size === 1 && uniqueToggle(c, i)}
          </>
        )
      }
      case 'portal': {
        // Only offer the kinds the board actually has (window preferred when both).
        const types: PortalKind[] = [
          ...(ctx.hasWindows ? (['window'] as const) : []),
          ...(ctx.hasDoors ? (['door'] as const) : []),
        ]
        return (
          <>
            <select
              className="mk-select-input mk-cond__val"
              value={c.portal ?? types[0] ?? 'window'}
              onChange={(e) => update(i, { portal: e.target.value as PortalKind })}
            >
              {types.map((p) => (
                <option key={p} value={p}>
                  {objName(p)}
                </option>
              ))}
            </select>
            {uniqueToggle(c, i)}
          </>
        )
      }
      case 'inout':
        return (
          <>
            <select
              className="mk-select-input mk-cond__val"
              value={c.side ?? 'inside'}
              onChange={(e) => update(i, { side: e.target.value as InOutKind })}
            >
              {(['inside', 'outside'] as InOutKind[]).map((s) => (
                <option key={s} value={s}>
                  {t(`side.${s}`)}
                </option>
              ))}
            </select>
            {uniqueToggle(c, i)}
          </>
        )
      case 'line':
        return (
          <>
            <select
              className="mk-select-input mk-cond__val"
              value={c.axis ?? 'row'}
              onChange={(e) => update(i, { axis: e.target.value as AxisKind })}
            >
              {(['row', 'col'] as AxisKind[]).map((a) => (
                <option key={a} value={a}>
                  {t(`line.${a}`)}
                </option>
              ))}
            </select>
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
          </>
        )
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
            {objectAtSelect(c, i)}
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
      case 'sameObject': {
        // Object type + who else is beside the SAME instance (anyone / person / trait)
        // + optional 8-way direction of that mate relative to the subject.
        const mateValue =
          c.objTarget === 'person'
            ? `person:${c.of}`
            : c.objTarget === 'attr'
              ? c.attribute === 'gender'
                ? `attr:gender:${c.value ?? 'f'}`
                : `attr:${c.attribute}`
              : 'any'
        const valuedAttr =
          c.objTarget === 'attr' && c.attribute && c.attribute !== 'gender'
            ? VALUED_ATTRS[c.attribute]
            : undefined
        return (
          <>
            {objectSelect(c, i)}
            <select
              className="mk-select-input mk-cond__val"
              value={mateValue}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'any') update(i, { objTarget: 'any', of: undefined })
                else if (v.startsWith('person:')) update(i, { objTarget: 'person', of: v.slice(7) })
                else {
                  const [attribute, value] = v.slice(5).split(':')
                  const valued = VALUED_ATTRS[attribute]
                  update(i, {
                    objTarget: 'attr',
                    attribute: attribute as AttrKind,
                    value: value ?? (valued && attribute !== 'gender' ? valued.values[0] : undefined),
                  })
                }
              }}
            >
              <option value="any">{t('cond.anyone')}</option>
              <optgroup label={t('cond.grpPeople')}>
                {ctx.others.map((o) => (
                  <option key={o.id} value={`person:${o.id}`}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('cond.grpAttrs')}>
                <option value="attr:gender:m">{t('genderVal.m')}</option>
                <option value="attr:gender:f">{t('genderVal.f')}</option>
                {BOOL_ATTRS.map((a) => (
                  <option key={a} value={`attr:${a}`}>
                    {`${t('cond.companionWith')} ${t(`attrKind.${a}`)}`}
                  </option>
                ))}
                {ATTR_KINDS.filter((a) => a !== 'gender' && VALUED_ATTRS[a]).map((a) => (
                  <option key={a} value={`attr:${a}`}>
                    {`${t('cond.companionWith')} ${t(`attrKind.${a}`)} …`}
                  </option>
                ))}
              </optgroup>
            </select>
            {valuedAttr && (
              <select
                className="mk-select-input mk-cond__val"
                value={c.value ?? valuedAttr.values[0]}
                onChange={(e) => update(i, { value: e.target.value })}
              >
                {valuedAttr.values.map((val) => (
                  <option key={val} value={val}>
                    {t(`${valuedAttr.labelKey}.${val}`)}
                  </option>
                ))}
              </select>
            )}
            <select
              className="mk-select-input mk-cond__val"
              value={c.objDir ?? 'none'}
              onChange={(e) => update(i, { objDir: e.target.value as 'none' | Direction8 })}
            >
              <option value="none">{t('cond.dirNone')}</option>
              {DIRECTIONS_8.map((d) => (
                <option key={d} value={d}>
                  {t(`dir.${d}`)}
                </option>
              ))}
            </select>
          </>
        )
      }
      case 'sameRoom': {
        // One dropdown for "same room as …": people, objects AND attributes (a man /
        // a woman / someone with glasses / …). The picked entry sets `roomTarget` and
        // the matching field; "allein" then tightens it to "only the two of them".
        const sameRoomValue =
          c.roomTarget === 'anyone'
            ? 'anyone'
            : c.roomTarget === 'attr'
              ? c.attribute === 'gender'
                ? `attr:gender:${c.value ?? 'f'}`
                : `attr:${c.attribute}`
              : c.of
                ? `person:${c.of}`
                : c.object
                  ? `object:${c.object}`
                  : ''
        const valuedAttr =
          c.roomTarget === 'attr' && c.attribute && c.attribute !== 'gender'
            ? VALUED_ATTRS[c.attribute]
            : undefined
        return (
          <>
            <select
              className="mk-select-input mk-cond__val"
              value={sameRoomValue}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'anyone') {
                  update(i, { roomTarget: 'anyone', of: undefined, object: undefined })
                } else if (v.startsWith('person:')) {
                  update(i, { roomTarget: 'person', of: v.slice(7), object: undefined })
                } else if (v.startsWith('object:')) {
                  update(i, { roomTarget: 'object', object: v.slice(7), of: undefined })
                } else {
                  const [attribute, value] = v.slice(5).split(':')
                  const valued = VALUED_ATTRS[attribute]
                  update(i, {
                    roomTarget: 'attr',
                    attribute: attribute as AttrKind,
                    value: value ?? (valued && attribute !== 'gender' ? valued.values[0] : undefined),
                    of: undefined,
                    object: undefined,
                  })
                }
              }}
            >
              <option value="anyone">{t('cond.sameRoomAnyone')}</option>
              <optgroup label={t('cond.grpPeople')}>
                {ctx.others.map((o) => (
                  <option key={o.id} value={`person:${o.id}`}>
                    {o.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('cond.grpObjects')}>
                {ctx.objects.map((o) => (
                  <option key={o} value={`object:${o}`}>
                    {objName(o)}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('cond.grpAttrs')}>
                <option value="attr:gender:m">{t('genderVal.m')}</option>
                <option value="attr:gender:f">{t('genderVal.f')}</option>
                {BOOL_ATTRS.map((a) => (
                  <option key={a} value={`attr:${a}`}>
                    {`${t('cond.companionWith')} ${t(`attrKind.${a}`)}`}
                  </option>
                ))}
                {ATTR_KINDS.filter((a) => a !== 'gender' && VALUED_ATTRS[a]).map((a) => (
                  <option key={a} value={`attr:${a}`}>
                    {`${t('cond.companionWith')} ${t(`attrKind.${a}`)} …`}
                  </option>
                ))}
              </optgroup>
            </select>
            {valuedAttr && (
              <select
                className="mk-select-input mk-cond__val"
                value={c.value ?? valuedAttr.values[0]}
                onChange={(e) => update(i, { value: e.target.value })}
              >
                {valuedAttr.values.map((val) => (
                  <option key={val} value={val}>
                    {t(`${valuedAttr.labelKey}.${val}`)}
                  </option>
                ))}
              </select>
            )}
            {c.roomTarget !== 'anyone' && aloneToggle(c, i)}
          </>
        )
      }
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
      case 'offset':
        // "exactly N cells {cardinal} of {person}": distance + cardinal direction + person.
        return (
          <>
            <input
              className="mk-input mk-cond__val mk-cond__num"
              type="number"
              min={1}
              value={c.dist ?? 1}
              onChange={(e) => update(i, { dist: Math.max(1, Number(e.target.value)) })}
            />
            {cardinalSelect((c.dir as Direction) ?? 'east', (d) => update(i, { dir: d }))}
            {personSelect(c, i)}
          </>
        )
      case 'roomAttribute': {
        // "Im Raum …": the FIRST dropdown picks [Niemand mit | Jemand mit | Alle mit
        // | Objekt]. With "Objekt" the second dropdown lists every object type ("im
        // Raum war eine Kiste"; the NICHT chip makes it "keine Kiste"). Otherwise the
        // usual trait + value pickers appear.
        const isObject = c.attribute === 'object'
        return (
          <>
            <select
              className="mk-select-input mk-cond__val"
              value={isObject ? 'object' : (c.quantifier ?? 'some')}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'object') {
                  update(i, { attribute: 'object', object: c.object ?? ctx.objects[0] })
                } else {
                  update(i, {
                    quantifier: v as Quantifier,
                    ...(isObject ? { attribute: 'beard' as const } : {}),
                  })
                }
              }}
            >
              {QUANTIFIERS.map((q) => (
                <option key={q} value={q}>
                  {t(`cond.qty.${q}`)}
                </option>
              ))}
              <option value="object">{t('attrKind.object')}</option>
            </select>
            {isObject ? objectSelect(c, i) : attrSelect(c, i)}
          </>
        )
      }
      case 'roomExists': {
        // "with someone in the room": ON/BESIDE the object first, then who (anyone or
        // a trait), then the object — only occupiable types are offered for ON.
        const rel = c.objRel ?? 'on'
        return (
          <>
            <select
              className="mk-select-input mk-cond__val"
              value={rel}
              onChange={(e) => {
                const objRel = e.target.value as 'on' | 'near'
                const patch: Partial<Condition> = { objRel }
                // Switching to ON with a non-occupiable object picked → fall back to
                // the first occupiable one (nobody can sit on a table).
                if (objRel === 'on' && c.object && !OCCUPIABLE_OBJECT_TYPES.includes(c.object)) {
                  patch.object = ctx.objects.find((o) => OCCUPIABLE_OBJECT_TYPES.includes(o))
                }
                update(i, patch)
              }}
            >
              <option value="on">{t('cond.relOn')}</option>
              <option value="near">{t('cond.relNear')}</option>
            </select>
            {attrSelect(c, i, true)}
            {objectSelect(c, i, rel === 'on')}
          </>
        )
      }
      case 'aloneWith':
        // "alone with {person} + N others matching {trait}, one of them {direction}".
        return (
          <>
            {personSelect(c, i)}
            <input
              className="mk-input mk-cond__val mk-cond__num"
              type="number"
              min={0}
              value={c.extraCount ?? 1}
              onChange={(e) => update(i, { extraCount: Math.max(0, Number(e.target.value)) })}
            />
            {attrSelect(c, i)}
            <select
              className="mk-select-input mk-cond__val"
              value={c.aloneDir ?? 'none'}
              onChange={(e) => update(i, { aloneDir: e.target.value as 'none' | Direction })}
            >
              <option value="none">{t('cond.dirNone')}</option>
              {CARDINALS.map((d) => (
                <option key={d} value={d}>
                  {t(`dir.${d}`)}
                </option>
              ))}
            </select>
          </>
        )
      default:
        // 'alone' / 'notAlone' (round-trip only) and flag-less kinds need no control.
        return null
    }
  }

  // The pickable kinds: drop "Fenster/Tür" when the board has neither.
  const availableKinds = COND_KINDS.filter((k) => k !== 'portal' || ctx.hasWindows || ctx.hasDoors)

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

      {group.conditions.map((c, i) => {
        // Keep a round-trip-only kind (alone/notAlone from an existing level) selectable
        // so editing such a level doesn't silently change the clue.
        const kinds = availableKinds.includes(c.kind) ? availableKinds : [c.kind, ...availableKinds]
        return (
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
              onChange={(e) =>
                onChange({
                  ...group,
                  conditions: group.conditions.map((cc, j) =>
                    j === i ? { ...defaultCondition(e.target.value as CondKind, ctx), not: cc.not } : cc,
                  ),
                })
              }
            >
              {kinds.map((k) => (
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
        )
      })}

      <button type="button" className="mk-btn mk-btn--ghost mk-cb__add" onClick={add}>
        {t('cond.add')}
      </button>
    </div>
  )
}
