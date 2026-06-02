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
    return `Z${row + 1}/S${col + 1}`
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
      case 'room': {
        const room = this.puzzle.board.rooms.get(String(value))
        return room ? (this.lookup(room.nameKey) ?? room.nameKey) : String(value)
      }
      case 'direction':
        return this.lookup(`dir.${value}`) ?? String(value)
      case 'side':
      case 'otherSide':
        return this.lookup(`side.${value}`) ?? String(value)
      case 'cell':
        return this.cell(Number(value))
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
    const text = this.render(exp, { name: subjectId, subject: subjectId, poss: subjectId })
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
  }

  /**
   * Like {@link clue}, but names the subject instead of using a pronoun — for
   * standalone messages shown outside the suspect's card (e.g. listing which
   * clue a wrong solution fails to satisfy).
   */
  namedClue(exp: Explanation, subjectId: string): string {
    const text = this.render(exp, { name: subjectId, subject: subjectId, poss: subjectId }, true)
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
  }

  render(exp: Explanation, extra: Record<string, string | number> = {}, nameSubject = false): string {
    if (exp.children && exp.children.length > 0) {
      if (exp.key === 'clue.not') return this.renderNot(exp.children[0], extra, nameSubject)
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
