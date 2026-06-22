import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Renderer } from '../i18n/Renderer.ts'
import type { Clue, Explanation, PersonId } from '../engine/index.ts'
import InfoTip from './InfoTip.tsx'

/** Params rendered bold (objects/rooms etc. — also shown on the board). */
const BOLD_PARAMS = new Set(['object', 'objectNom', 'objectEvery', 'objects', 'room', 'attribute', 'who', 'whoNeg', 'mate', 'mateLc', 'row', 'col', 'n', 'line', 'roomRel', 'target', 'people', 'atCell'])

interface Props {
  renderer: Renderer
  clues: readonly Clue[]
  subjectId: PersonId
}

/** Renders a suspect's clues: objects/rooms bold; concept words bold + tooltip. */
export default function ClueText({ renderer, clues, subjectId }: Props) {
  const { t } = useTranslation()

  const term = (key: number, word: ReactNode, tipKey: string): ReactNode => (
    <InfoTip key={key} className="mk-term" anchor=".mk-clue" content={t(`tip.${tipKey}`)}>
      <strong>{word}</strong>
    </InfoTip>
  )

  const parseTemplate = (
    tmpl: string,
    params: Record<string, string | number>,
    childNodes?: ReactNode[],
  ): ReactNode[] => {
    const out: ReactNode[] = []
    const re = /\{\{(\w+)\}\}|\[\[([^\]]+?):([^\]]+?)\]\]/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(tmpl)) !== null) {
      if (m.index > last) out.push(tmpl.slice(last, m.index))
      if (m[1]) {
        const name = m[1]
        if (name === 'child' && childNodes) {
          out.push(...childNodes)
        } else {
          const val = renderer.resolveParam(name, params[name] ?? '')
          // The negation word ("nicht"/"not") is bold + tooltipped like the concept
          // words; the trailing space stays outside the bold span so spacing is unchanged.
          if (name === 'neg') {
            const word = String(val).trim()
            if (word) {
              out.push(term(m.index, word, 'negation'))
              out.push(' ')
            }
          } else if (name === 'direction') out.push(term(m.index, val, 'direction'))
          else if (BOLD_PARAMS.has(name)) out.push(<strong key={m.index}>{val}</strong>)
          else out.push(val)
        }
      } else {
        out.push(term(m.index, m[2], m[3]))
      }
      last = re.lastIndex
    }
    if (last < tmpl.length) out.push(tmpl.slice(last))
    return out
  }

  const renderExp = (exp: Explanation, extra: Record<string, string | number>): ReactNode[] => {
    if (exp.children && exp.children.length > 0) {
      if (exp.key === 'clue.and' || exp.key === 'clue.or') {
        const conn = renderer.lookup(exp.key === 'clue.and' ? 'clue.connAnd' : 'clue.connOr') ?? '&'
        const out: ReactNode[] = []
        exp.children.forEach((c, i) => {
          if (i > 0) out.push(` ${conn} `)
          out.push(...renderExp(c, extra))
        })
        return out
      }
      if (exp.key === 'clue.not') {
        const child = exp.children[0]
        const negWord = renderer.lookup('clue.negWord') ?? 'nicht '
        const isComposite = !!(child.children && child.children.length > 0)
        if (!isComposite) {
          // A dedicated negated wording ("In seinem Raum war keine Frau"): the child's
          // `<key>Neg` template, with any `who` token flipped to its "kein/keine" form.
          const negTmpl = renderer.lookup(`${child.key}Neg`)
          if (negTmpl !== undefined) {
            const params: Record<string, string | number> = { ...extra, ...(child.params ?? {}) }
            if (typeof params.who === 'string') params.whoNeg = `${params.who}_neg`
            if (typeof params.mate === 'string') params.mateLc = params.mate
            return parseTemplate(negTmpl, params)
          }
          // Inject "nicht " into the child sentence ("X war nicht …") when it has a
          // {{neg}} slot.
          const childTmpl = renderer.lookup(child.key)
          if (childTmpl && childTmpl.includes('{{neg}}')) {
            return renderExp(child, { ...extra, neg: negWord })
          }
        }
        // Fallback: wrap it as "nicht (…)".
        return parseTemplate(
          renderer.lookup('clue.not') ?? 'not ({{child}})',
          extra,
          renderExp(child, extra),
        )
      }
      return exp.children.flatMap((c, i) => (i > 0 ? [' ', ...renderExp(c, extra)] : renderExp(c, extra)))
    }
    const params = { ...extra, ...(exp.params ?? {}) }
    const tmpl = renderer.lookup(renderer.pluralKey(exp.key, params)) ?? exp.key
    return parseTemplate(tmpl, params)
  }

  if (clues.length === 0) return null

  const nodes: ReactNode[] = []
  clues.forEach((clue, i) => {
    if (i > 0) nodes.push(' · ')
    nodes.push(...renderExp(clue.describe(), { name: subjectId, subject: subjectId, poss: subjectId, subjectObj: subjectId }))
  })

  // Capitalize the first character if the clue starts with plain text (the pronoun).
  if (typeof nodes[0] === 'string' && nodes[0].trim()) {
    nodes[0] = nodes[0].charAt(0).toUpperCase() + nodes[0].slice(1)
  }
  // Close with a period — unless the clue already ends in sentence punctuation
  // (the two-sentence "beside the same object" wording carries its own), which
  // would otherwise read as a doubled "..".
  const tail = nodes[nodes.length - 1]
  if (!(typeof tail === 'string' && /[.!?]$/.test(tail.trimEnd()))) {
    nodes.push('.')
  }

  return (
    <>
      {nodes.map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </>
  )
}
