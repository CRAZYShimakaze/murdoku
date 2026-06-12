/** Text with its first non-space letter blood-smeared — the noir flourish
 *  shared by the game header and the level-select cards. */
export default function BloodText({ text }: { text: string }) {
  const i = text.search(/\S/)
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <span className="mk-bloodletter">{text[i]}</span>
      {text.slice(i + 1)}
    </>
  )
}
