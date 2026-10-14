import { describe, expect, test } from 'vitest'
import { activityName, closeNames, nameKey, sectionName, templateName } from './names'
import type { Snapshot } from './types'

function snap(parts: Partial<Snapshot> = {}): Snapshot {
  return {
    labels: [], templates: [], items: [], sections: [], activities: [],
    listings: [], journal: [], days: [], defaultTemplateId: null,
    removed: { activities: [], sections: [], templates: [] },
    ...parts,
  }
}

describe('nameKey', () => {
  test('ignores capitals', () => {
    expect(nameKey('Glass')).toBe('glass')
  })

  test('a final s goes from a word longer than 3 characters, so Gyms is gym', () => {
    expect(nameKey('Gyms')).toBe('gym')
  })

  test('a word ending in ss keeps it', () => {
    expect(nameKey('Glass')).toBe('glass')
  })

  test('a word of 3 characters or fewer keeps its s', () => {
    expect(nameKey('Gas')).toBe('gas')
    expect(nameKey('Bus stops')).toBe('bus stop')
  })

  test('hyphens, underscores and slashes become spaces', () => {
    expect(nameKey('Post-work')).toBe('post work')
    expect(nameKey('post_work')).toBe('post work')
    expect(nameKey('Gym/Run')).toBe('gym run')
  })

  test('other punctuation is dropped, so gym. is gym', () => {
    expect(nameKey('gym.')).toBe('gym')
    expect(nameKey('Mum\'s')).toBe('mum')
  })

  test('runs of spaces collapse and the ends are trimmed', () => {
    expect(nameKey('  Post   work  ')).toBe('post work')
  })

  test('letters outside ASCII are kept', () => {
    expect(nameKey('Café')).toBe('café')
    expect(nameKey('Cafés')).toBe('café')
  })

  test('differently written names have the same key', () => {
    const keys = ['Gym', 'gym.', 'Gyms', ' GYM ', 'gym-', 'Gym!'].map(nameKey)
    expect(new Set(keys)).toEqual(new Set(['gym']))
  })
})

describe('closeNames', () => {
  const rows = (...names: string[]) => names.map(name => ({ name }))

  test('blank input gives nothing', () => {
    expect(closeNames('', rows('Gym', 'Walk'))).toEqual([])
    expect(closeNames('   ', rows('Gym', 'Walk'))).toEqual([])
    expect(closeNames('!!!', rows('Gym', 'Walk'))).toEqual([])
  })

  test('a row with the same key is included, whatever its capitals, spacing or plural', () => {
    expect(closeNames('Gym', rows('Gyms', 'Walk'))).toEqual(rows('Gyms'))
    expect(closeNames('Gym', rows('gym.'))).toEqual(rows('gym.'))
  })

  test('keys of 3 characters or fewer are never close by distance', () => {
    expect(closeNames('Gym', rows('Gem', 'Gyp'))).toEqual([])
    expect(closeNames('Bus', rows('Bas'))).toEqual([])
  })

  test('a key of 4 to 6 characters is close at one letter apart', () => {
    expect(closeNames('Walk', rows('Talk'))).toEqual(rows('Talk'))
    expect(closeNames('Walk', rows('Tall'))).toEqual([])
  })

  test('a key of 7 or more characters is close at two letters apart', () => {
    expect(closeNames('Afternoon', rows('Aftrnon'))).toEqual(rows('Aftrnon'))
    expect(closeNames('Afternoon', rows('Aftrnoon'))).toEqual(rows('Aftrnoon'))
    expect(closeNames('Afternoon', rows('Afnn'))).toEqual([])
  })

  test('the shorter of the two keys decides how far apart is close', () => {
    expect(closeNames('Walk', rows('Waltzing'))).toEqual([])
    expect(closeNames('Waltzing', rows('Walk'))).toEqual([])
  })

  test('a name that starts with another of 4 or more characters is close, so Reading is close to Read', () => {
    expect(closeNames('Reading', rows('Read'))).toEqual(rows('Read'))
    expect(closeNames('Walk', rows('Walking'))).toEqual(rows('Walking'))
    expect(closeNames('Gym', rows('Gymnastics'))).toEqual([])
  })

  test('a name with one word more contains the shorter name, so Gym session is close to Gym', () => {
    expect(closeNames('Gym', rows('Gym session'))).toEqual(rows('Gym session'))
    expect(closeNames('Gym session', rows('Gym'))).toEqual(rows('Gym'))
  })

  test('a single short word does not count as containment', () => {
    expect(closeNames('an', rows('An idea'))).toEqual([])
  })

  test('containment needs every word of the shorter name', () => {
    expect(closeNames('Gym', rows('Yoga session'))).toEqual([])
  })

  test('same word count is not containment', () => {
    expect(closeNames('Gym session', rows('Session gym'))).toEqual([])
  })

  test('equal keys come first, then by distance, then by name', () => {
    const ordered = closeNames('Stretch', rows('Stretcher', 'Stretchy', 'Stretch', 'Stretches'))
    expect(ordered.map(row => row.name)).toEqual(['Stretch', 'Stretches', 'Stretchy', 'Stretcher'])
  })

  test('does not reorder or change the rows it was given', () => {
    const input = rows('Gym session', 'Gym', 'Gyms')
    closeNames('Gym', input)
    expect(input.map(row => row.name)).toEqual(['Gym session', 'Gym', 'Gyms'])
  })

  test('keeps any extra fields of the rows it returns', () => {
    const found = closeNames('Gym', [{ id: 'g', name: 'Gyms' }, { id: 'w', name: 'Walk' }])
    expect(found).toEqual([{ id: 'g', name: 'Gyms' }])
  })
})

describe('activityName, sectionName and templateName', () => {
  const live = snap({
    activities: [{ id: 'gym', name: 'Gym', committed: false }],
    sections: [{ id: 'postWork', name: 'Post work', position: 0 }],
    templates: [{ id: 'basic', name: 'Basic day', labelId: 'work', position: 0 }],
    removed: {
      activities: [{ id: 'run', name: 'Running', committed: true }],
      sections: [{ id: 'lunch', name: 'Lunch break', position: 1 }],
      templates: [{ id: 'old', name: 'Old day', labelId: 'work', position: 1 }],
    },
  })

  test('a live row is named by its name', () => {
    expect(activityName(live, 'gym')).toBe('Gym')
    expect(sectionName(live, 'postWork')).toBe('Post work')
    expect(templateName(live, 'basic')).toBe('Basic day')
  })

  test('a deleted row keeps its name', () => {
    expect(activityName(live, 'run')).toBe('Running')
    expect(sectionName(live, 'lunch')).toBe('Lunch break')
    expect(templateName(live, 'old')).toBe('Old day')
  })

  test('a row that no longer exists at all is (removed)', () => {
    expect(activityName(live, 'nothing')).toBe('(removed)')
    expect(sectionName(live, 'nothing')).toBe('(removed)')
    expect(templateName(live, 'nothing')).toBe('(removed)')
  })

  test('a live row is not looked up among the deleted ones', () => {
    expect(activityName(live, 'gym')).toBe('Gym')
    expect(activityName(snap(), 'gym')).toBe('(removed)')
  })
})
