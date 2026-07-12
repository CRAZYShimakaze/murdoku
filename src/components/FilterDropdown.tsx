import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

export interface DropdownOption {
  value: string
  label: string
}

interface Props {
  /** Accessible name (the visible group label lives outside this component). */
  label: string
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  /** Open the panel upward instead of down — for triggers near the viewport bottom. */
  dropUp?: boolean
}

/**
 * Custom noir-styled dropdown for the level picker's desktop filters (mobile keeps
 * the native <select> — best touch UX). Follows the listbox pattern: focus stays on
 * the trigger button, the highlighted option travels via aria-activedescendant.
 */
export default function FilterDropdown({ label, value, options, onChange, dropUp = false }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const current = options.find((o) => o.value === value) ?? options[0]
  const optId = (i: number) => `${listId}-${i}`

  // Close on any press outside; capture phase so the press that opens ANOTHER
  // dropdown (or a level card) still closes this one first.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  // Keep the keyboard-highlighted option in view while the panel scrolls.
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, listId])

  const openPanel = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  const pick = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openPanel()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((i) => Math.min(options.length - 1, i + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((i) => Math.max(0, i - 1))
        break
      case 'Home':
        e.preventDefault()
        setActive(0)
        break
      case 'End':
        e.preventDefault()
        setActive(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        pick(options[active].value)
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        break
      case 'Tab':
        setOpen(false)
        break
    }
  }

  return (
    <div className="mk-dropdown" data-open={open} data-drop={dropUp ? 'up' : 'down'} ref={rootRef}>
      <button
        type="button"
        className="mk-dropdown__btn"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optId(active) : undefined}
        onClick={() => (open ? setOpen(false) : openPanel())}
        onKeyDown={onKeyDown}
      >
        <span className="mk-dropdown__value">{current?.label}</span>
        <svg
          className="mk-dropdown__caret"
          viewBox="0 0 10 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <path d="M1 1l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div className="mk-dropdown__panel" role="listbox" id={listId} aria-label={label}>
          {options.map((o, i) => (
            <button
              type="button"
              key={o.value}
              id={optId(i)}
              className="mk-dropdown__opt"
              role="option"
              aria-selected={o.value === value}
              data-active={i === active}
              data-selected={o.value === value}
              tabIndex={-1}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o.value)}
            >
              <span className="mk-dropdown__check" aria-hidden="true">
                ✓
              </span>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
