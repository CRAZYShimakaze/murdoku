import type { Explanation, Puzzle } from '../engine/index.ts'

type Dict = { [key: string]: string | Dict }

/**
 * Renders engine `Explanation` descriptors into readable text using a locale
 * dictionary. Keeps all wording in the locale JSON — the engine stays text-free.
 */
export class Renderer {
  private readonly dict: Dict

  constructor(
    dict: unknown,
    private readonly puzzle: Puzzle,
  ) {
    this.dict = dict as Dict
  }

  private lookup(key: string): string | undefined {
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

  private resolveParam(name: string, value: string | number): string {
    switch (name) {
      case 'name':
      case 'target':
        return this.puzzle.nameOf(String(value))
      case 'subject':
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
      case 'cell':
        return this.cell(Number(value))
      default:
        return String(value)
    }
  }

  /** Render a suspect's own clue: gender pronouns for the subject, sentence-capitalised. */
  clue(exp: Explanation, subjectId: string): string {
    const text = this.render(exp, { name: subjectId, subject: subjectId, poss: subjectId })
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text
  }

  render(exp: Explanation, extra: Record<string, string | number> = {}): string {
    if (exp.children && exp.children.length > 0) {
      const parts = exp.children.map((child) => this.render(child, extra))
      if (exp.key === 'clue.and') return parts.join(` ${this.lookup('clue.connAnd') ?? 'und'} `)
      if (exp.key === 'clue.or') return parts.join(` ${this.lookup('clue.connOr') ?? 'oder'} `)
      if (exp.key === 'clue.not') {
        return (this.lookup('clue.not') ?? 'nicht ({{child}})').replace('{{child}}', parts[0])
      }
      return parts.join(' ')
    }
    const template = this.lookup(exp.key) ?? exp.key
    const params = { ...extra, ...(exp.params ?? {}) }
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
      this.resolveParam(key, params[key] ?? ''),
    )
  }
}
