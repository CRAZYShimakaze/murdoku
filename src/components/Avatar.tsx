import { avatarDataUri, type AvatarAttrs } from '../game/avatar.ts'

interface Props {
  attrs: AvatarAttrs
  color: string
  letter: string
  className?: string
}

/** A suspect head avatar (gender / beard / glasses) — same SVG the board uses. */
export default function Avatar({ attrs, color, letter, className }: Props) {
  return (
    <img
      className={className}
      src={avatarDataUri(attrs, color, letter)}
      alt={letter}
      draggable={false}
      width={40}
      height={40}
    />
  )
}
