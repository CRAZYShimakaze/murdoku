/** A flicked-blood splatter: a dense cluster on the left with a fine trail to the right.
 *  Purely decorative — sits BEHIND text (the caller positions it via `className` and a
 *  negative z-index). Colours come from `.mk-splatter` (crimson) / `.deep` (crimson-deep). */
export default function BloodSplatter({ className }: { className?: string }) {
  return (
    <svg
      className={`mk-splatter${className ? ` ${className}` : ''}`}
      viewBox="0 0 240 60"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <circle className="deep" cx="70" cy="31" r="7.5" opacity="0.78" />
      <circle className="deep" cx="96" cy="35" r="4.6" opacity="0.7" />
      <circle cx="84" cy="24" r="4.4" opacity="0.8" />
      <circle cx="58" cy="41" r="3.4" opacity="0.72" />
      <circle cx="108" cy="27" r="3" opacity="0.66" />
      <circle cx="49" cy="21" r="2.5" opacity="0.66" />
      <circle cx="34" cy="38" r="1.7" opacity="0.55" />
      <circle cx="124" cy="23" r="3.1" opacity="0.66" />
      <circle cx="144" cy="17" r="2.4" opacity="0.58" />
      <circle cx="164" cy="13" r="1.9" opacity="0.5" />
      <circle cx="184" cy="10" r="1.4" opacity="0.44" />
      <circle cx="204" cy="8" r="1" opacity="0.38" />
      <circle cx="118" cy="43" r="2.1" opacity="0.55" />
      <circle cx="208" cy="40" r="2.3" opacity="0.5" />
      <ellipse cx="156" cy="16" rx="4.6" ry="1.3" transform="rotate(-22 156 16)" opacity="0.5" />
      <ellipse cx="118" cy="34" rx="5" ry="1.4" transform="rotate(8 118 34)" opacity="0.5" />
    </svg>
  )
}
