import type { Id, Snapshot } from './types'

const SEPARATORS = /[-_/]/g
const OTHER_CHARACTERS = /[^\p{L}\p{N}\s]/gu

/** The form two names are compared in. Equal keys mean the same name. */
export function nameKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(SEPARATORS, ' ')
    .replace(OTHER_CHARACTERS, '')
    .split(/\s+/)
    .filter(word => word !== '')
  return words.map(singular).join(' ')
}

/** A word longer than 3 characters that ends in 's' but not 'ss' loses that final 's'. */
function singular(word: string): string {
  return length(word) > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word
}

function length(text: string): number {
  return Array.from(text).length
}

/** Rows whose name is the same as or close to `name`, best first. Blank `name` -> []. */
export function closeNames<T extends { name: string }>(name: string, rows: T[]): T[] {
  const a = nameKey(name)
  if (a === '') return []
  const scored: { row: T; distance: number }[] = []
  for (const row of rows) {
    const b = nameKey(row.name)
    if (!isClose(a, b)) continue
    scored.push({ row, distance: levenshtein(a, b) })
  }
  // Equal keys are exactly the distance 0 rows, so sorting by distance puts them first.
  return scored
    .sort((x, y) => x.distance - y.distance || x.row.name.localeCompare(y.row.name, undefined, { sensitivity: 'base' }))
    .map(({ row }) => row)
}

function isClose(a: string, b: string): boolean {
  if (a === b) return true
  const shorter = Math.min(length(a), length(b))
  if (shorter >= 4 && levenshtein(a, b) <= (shorter <= 6 ? 1 : 2)) return true
  // 'read' and 'reading': one name starts with the other.
  if (shorter >= 4 && (a.startsWith(b) || b.startsWith(a))) return true
  return wordsInside(a, b) || wordsInside(b, a)
}

/** True when `few` has fewer words than `many`, every word of `few` is a word of `many`, and one is 3 or more characters. */
function wordsInside(few: string, many: string): boolean {
  const fewWords = few.split(' ')
  const manyWords = many.split(' ')
  if (fewWords.length >= manyWords.length) return false
  return fewWords.some(word => length(word) >= 3) && fewWords.every(word => manyWords.includes(word))
}

function levenshtein(a: string, b: string): number {
  const x = Array.from(a)
  const y = Array.from(b)
  let row = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const next = [i]
    for (let j = 1; j <= y.length; j++) {
      const substitution = row[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, substitution)
    }
    row = next
  }
  return row[y.length]
}

function nameOf<T extends { id: Id; name: string }>(live: T[], removed: T[], id: Id): string {
  return (live.find(row => row.id === id) ?? removed.find(row => row.id === id))?.name ?? '(removed)'
}

/** The name of an activity, live or deleted; '(removed)' when no such row exists at all. */
export function activityName(snap: Snapshot, id: Id): string {
  return nameOf(snap.activities, snap.removed.activities, id)
}

/** The name of a section, live or deleted; '(removed)' when no such row exists at all. */
export function sectionName(snap: Snapshot, id: Id): string {
  return nameOf(snap.sections, snap.removed.sections, id)
}

/** The name of a template, live or deleted; '(removed)' when no such row exists at all. */
export function templateName(snap: Snapshot, id: Id): string {
  return nameOf(snap.templates, snap.removed.templates, id)
}
