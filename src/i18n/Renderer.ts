import type { Explanation, Puzzle } from '../engine/index.ts'

type Dict = { [key: string]: string | Dict }

/**
 * Renders engine `Explanation` descriptors into readable text using a locale
 * dictionary. Keeps all wording in the locale JSON — the engine stays text-free.
 * Shared by the dev CLI and the React app (which passes the active i18n bundle).
 */
export class Renderer {
  private readonly dict: Dict

  constructor(
    dict: unknown,
    private readonly puzzle: Puzzle,
  ) {
    this.dict = dict as Dict
  }

  lookup(key: string): string | undefined {
    let node: string | Dict | undefined = this.dict
    for (const part of key.split('.')) {
      if (node === undefined || typeof node === 'string') return undefined
      node = node[part]
    }
    return typeof node === 'string' ? node : undefined
  }

  cell(cell: number): string {
    const { row, col } = this.puzzle.board.rc(cell)
    return `${this.lookup('coord.row') ?? 'Z'}${row + 1}/${this.lookup('coord.col') ?? 'S'}${col + 1}`
  }

  private genderOf(id: string): string {
    return String(this.puzzle.attributesOf(id).gender) === 'm' ? 'm' : 'f'
  }

  resolveParam(name: string, value: string | number, nameSubject = false): string {
    switch (name) {
      case 'name':
      case 'target':
        return this.puzzle.nameOf(String(value))
      case 'subject':
        if (nameSubject) return this.puzzle.nameOf(String(value))
        return this.lookup(`pron.${this.genderOf(String(value))}`) ?? this.puzzle.nameOf(String(value))
      // Object pronoun of the subject ("ihm/ihr" / "him/her") — for "north of him".
      case 'subjectObj':
        return this.lookup(`pronObj.${this.genderOf(String(value))}`) ?? this.puzzle.nameOf(String(value))
      case 'poss':
        return this.lookup(`poss.${this.genderOf(String(value))}`) ?? this.puzzle.nameOf(String(value))
      case 'people':
        return String(value)
          .split(',')
          .filter(Boolean)
          .map((id) => this.puzzle.nameOf(id))
          .join(' & ')
      case 'object':
        return this.lookup(`object.${value}`) ?? String(value)
      // Nominative-with-article form ("ein Fernseher") for clues that compare to an
      // object ("…im selben Raum wie ein Fernseher"). Falls back to the dative form
      // (English has no case distinction, so it reuses `object.*`).
      case 'objectNom':
        return this.lookup(`objectNom.${value}`) ?? this.lookup(`object.${value}`) ?? String(value)
      // Bare object noun ("Tisch" / "table") and the gender-correct "same X" form
      // ("demselben Tisch" / "derselben Pflanze"); English reuses the bare noun.
      case 'objName':
        return this.lookup(`objName.${value}`) ?? String(value)
      case 'objectSame': {
        // German: explicit gender-correct phrase ("demselben Tisch"). English: build
        // "the same " + the bare noun lower-cased (mid-sentence) from `sameThe`.
        const explicit = this.lookup(`objectSame.${value}`)
        if (explicit) return explicit
        const noun = this.lookup(`objName.${value}`) ?? String(value)
        const pre = this.lookup('sameThe')
        return pre ? `${pre} ${noun.charAt(0).toLowerCase() + noun.slice(1)}` : noun
      }
      case 'objects': {
        const parts = String(value)
          .split(',')
          .filter(Boolean)
          .map((t) => this.lookup(`object.${t}`) ?? t)
        if (parts.length <= 1) return parts[0] ?? ''
        const or = this.lookup('clue.connOr') ?? 'oder'
        return `${parts.slice(0, -1).join(', ')} ${or} ${parts[parts.length - 1]}`
      }
      case 'attribute':
        return this.lookup(`attr.${value}`) ?? String(value)
      case 'who':
        return this.lookup(`who.${value}`) ?? String(value)
      // The "mate" of a "beside the same object" clue: anyone / a named person / a
      // trait-bearer. Encoded as "any" | "person:<id>" | "attr:<token>".
      case 'mate': {
        const s = String(value)
        const phrase = s.startsWith('person:')
          ? this.puzzle.nameOf(s.slice(7))
          : s.startsWith('attr:')
            ? (() => {
                const token = s.slice(5)
                if (token.startsWith('gender_')) return this.lookup(`who.${token.slice(7)}_nom`) ?? token
                const pre = this.lookup('who.withTraitPre') ?? ''
                const post = this.lookup('who.withTraitPost') ?? ''
                return `${pre} ${this.lookup(`attr.${token}`) ?? token} ${post}`.replace(/\s+/g, ' ').trim()
              })()
            : (this.lookup('who.any') ?? s)
        // Capitalised: the mate starts its own sentence ("Jemand war … / Eine Frau war …").
        return phrase ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : phrase
      }
      case 'room': {
        const room = this.puzzle.board.rooms.get(String(value))
        return room ? (this.lookup(room.nameKey) ?? room.nameKey) : String(value)
      }
      case 'direction':
        return this.lookup(`dir.${value}`) ?? String(value)
      case 'line':
        return this.lookup(`line.${value}`) ?? String(value)
      case 'roomRel':
        return this.lookup(`roomRel.${value}`) ?? String(value)
      case 'side':
      case 'otherSide':
        return this.lookup(`side.${value}`) ?? String(value)
      case 'cell':
        return this.cell(Number(value))
      // Anchor of an object clue, encoded "<type>:<cell>". Shows " (Z7/S6)" only when
      // the board holds SEVERAL object tiles of the type — with a single one, the
      // plain "east of a tree" is already unambiguous.
      case 'atCell': {
        const s = String(value)
        if (!s) return ''
        const sep = s.indexOf(':')
        const type = s.slice(0, sep)
        if (this.puzzle.board.objectCells(type).length <= 1) return ''
        return ` (${this.cell(Number(s.slice(sep + 1)))})`
      }
      // A comma-separated list of cell indices → "Z2/S1, Z5/S1" (for a grouped hint).
      case 'cells':
        return String(value)
          .split(',')
          .filter(Boolean)
          .map((c) => this.cell(Number(c)))
          .join(', ')
      case 'bound': {
        // "row|id:line,id:line" → "Name→Z3, Name→Z6" (S/C for columns), names resolved.
        const bar = String(value).indexOf('|')
        const prefix =
          String(value).slice(0, bar) === 'row'
            ? (this.lookup('coord.row') ?? 'Z')
            : (this.lookup('coord.col') ?? 'S')
        return String(value)
          .slice(bar + 1)
          .split(',')
          .filter(Boolean)
          .map((pair) => {
            const [pid, line] = pair.split(':')
            return `${this.puzzle.nameOf(pid)}→${prefix}${line}`
          })
          .join(', ')
      }
      default:
        return String(value)
    }
  }

  /**
   * Negation. If the inner clue's template has a `{{neg}}` slot (all the
   * "{{subject}} war …" clues do), render it with "nicht " injected so it reads
   * "X war nicht …". Otherwise fall back to wrapping it as "nicht (…)".
   */
  private renderNot(
    child: Explanation,
    extra: Record<string, string | number>,
    nameSubject = false,
  ): string {
    const neg = this.lookup('clue.negWord') ?? 'nicht '
    const template = child.children && child.children.length > 0 ? null : this.lookup(child.key)
    if (template && template.includes('{{neg}}')) {
      return this.render(child, { ...extra, neg }, nameSubject)
    }
    const inner = this.render(child, extra, nameSubject)
    return (this.lookup('clue.not') ?? 'nicht ({{child}})').replace('{{child}}', inner)
  }

  /** Render a suspect's own clue: gender pronouns for the subject, sentence-capitalised. */
  clue(exp: Explanation, subjectId: string): string {
    const text = this.render(exp, { name: subjectId, subject: subjectId, poss: subjectId, subjectObj: subjectId })
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
  }

  /**
   * Like {@link clue}, but names the subject instead of using a pronoun — for
   * standalone messages shown outside the suspect's card (e.g. listing which
   * clue a wrong solution fails to satisfy).
   */
  namedClue(exp: Explanation, subjectId: string): string {
    const text = this.render(exp, { name: subjectId, subject: subjectId, poss: subjectId, subjectObj: subjectId }, true)
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
  }

  render(exp: Explanation, extra: Record<string, string | number> = {}, nameSubject = false): string {
    if (exp.children && exp.children.length > 0) {
      if (exp.key === 'clue.not') return this.renderNot(exp.children[0], extra, nameSubject)
      // A wrapper whose template embeds the child sentence(s) at {{child}} — e.g. a
      // hint that quotes another suspect's own clue. The child is rendered from that
      // suspect's point of view (their pronoun), then slotted into the wrapper.
      const wrapper = this.lookup(exp.key)
      if (wrapper && wrapper.includes('{{child}}')) {
        const subj = exp.params?.name
        const childExtra =
          subj !== undefined ? { ...extra, name: subj, subject: subj, poss: subj } : extra
        const childText = exp.children.map((child) => this.render(child, childExtra)).join(' ')
        const params = { ...extra, ...(exp.params ?? {}) }
        return wrapper
          .replace(/\{\{child\}\}/g, childText)
          .replace(/\[\[([^\]]+?):[^\]]+?\]\]/g, '$1')
          .replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
            this.resolveParam(key, params[key] ?? '', nameSubject),
          )
      }
      const parts = exp.children.map((child) => this.render(child, extra, nameSubject))
      if (exp.key === 'clue.and') return parts.join(` ${this.lookup('clue.connAnd') ?? 'und'} `)
      if (exp.key === 'clue.or') return parts.join(` ${this.lookup('clue.connOr') ?? 'oder'} `)
      return parts.join(' ')
    }
    // Strip the rich-text concept markers `[[word:tipKey]]` → `word` (the UI
    // renderer interprets them; plain text just shows the word).
    const template = (this.lookup(exp.key) ?? exp.key).replace(
      /\[\[([^\]]+?):[^\]]+?\]\]/g,
      '$1',
    )
    const params = { ...extra, ...(exp.params ?? {}) }
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
      this.resolveParam(key, params[key] ?? '', nameSubject),
    )
  }
}
