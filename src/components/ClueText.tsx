import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Renderer } from '../i18n/Renderer.ts'
import type { Clue, Explanation, PersonId } from '../engine/index.ts'
import { makeRichRenderer } from './clueRich.tsx'

interface Props {
  renderer: Renderer
  clues: readonly Clue[]
  subjectId: PersonId
}

/** Renders a suspect's clues: objects/rooms bold; concept words bold + tooltip.
 *  (The template machinery lives in clueRich.tsx, shared with the board clues and the
 *  mobile Akten-Notiz term collector.) */
export default function ClueText({ renderer, clues, subjectId }: Props) {
  const { t } = useTranslation()
  const renderExp = makeRichRenderer(renderer, t, '.mk-clue')

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

/** Renders ONE board (global) clue with the same bold-word + concept-tooltip treatment as
 *  the suspect clues. Its templates are full sentences (capital + period included), and it
 *  has no subject — only the shared rich renderer, docked to the board-clue card. */
export function BoardClueText({ renderer, describe }: { renderer: Renderer; describe: Explanation }) {
  const { t } = useTranslation()
  const renderExp = makeRichRenderer(renderer, t, '.mk-boardclue')
  return (
    <>
      {renderExp(describe, {}).map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </>
  )
}
