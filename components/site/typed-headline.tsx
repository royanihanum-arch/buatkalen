'use client'

import { useEffect, useState } from 'react'

export function TypedHeadline({ phrases }: { phrases: string[] }) {
  const [index, setIndex] = useState(0)
  const [text, setText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const phrase = phrases[index]
    const done = !deleting && text === phrase
    const empty = deleting && text === ''
    const delay = done ? 2200 : empty ? 350 : deleting ? 22 : 48
    const id = setTimeout(() => {
      if (done) setDeleting(true)
      else if (empty) {
        setDeleting(false)
        setIndex((i) => (i + 1) % phrases.length)
      } else setText(deleting ? phrase.slice(0, text.length - 1) : phrase.slice(0, text.length + 1))
    }, delay)
    return () => clearTimeout(id)
  }, [text, deleting, index, phrases])

  return (
    <h1 className="max-w-[68rem] px-6 text-center text-[26px] font-medium leading-normal tracking-[-0.78px] text-white md:h-[94px] md:text-[39px] md:tracking-[-1.17px]">
      <span className="sr-only">{phrases[0]}</span>
      <span aria-hidden="true">
        {text}
        <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-white align-middle" style={{ height: '0.95em' }} />
      </span>
    </h1>
  )
}
