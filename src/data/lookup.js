/**
 * The WAS median lookup engine: the single data engine behind the whole explorer.
 *
 * Design spec B.4.0, "lookup, not prediction": where the reader supplies characteristics, the
 * system returns the published median wealth for that characteristic cell, labelled as a typical
 * value with a sample caveat. It does not model or predict an individual's wealth. That is what
 * keeps the artefact inside the brief's hard constraint against inventing or approximating values.
 *
 * Graceful degradation. A three-way cut of age band by tenure by region has many thin cells in a
 * survey of this size. The rule below drops one dimension at a time, in a fixed priority order,
 * until the cell clears the minimum sample size, and always reports which cut it actually used so
 * the interface can say so. Region is dropped first because it is the dimension with the most
 * categories and therefore the thinnest cells; tenure is dropped last because it is the primary
 * structural divide the piece is about.
 *
 * The minimum cell size is a build-time decision recorded as open in design spec B.9. The value
 * below is the placeholder, and the constant is exported so the P4 workbook check can set it in one
 * place.
 */

export const MIN_CELL_SIZE = 30

/** Fixed drop order for degradation. Region first, then age band, then tenure. */
const DROP_ORDER = ['region', 'ageBand', 'tenure']

export const AGE_BANDS = ['16-24', '25-34', '35-44', '45-54', '55-64', '65-74', '75+']

export const TENURES = [
  { id: 'owned-outright', label: 'Own outright' },
  { id: 'mortgaged', label: 'Own with a mortgage' },
  { id: 'private-rent', label: 'Private renting' },
  { id: 'social-rent', label: 'Social renting' },
]

/**
 * ITL1 areas. Design spec revision r2.8: the UK replaced NUTS with ITL from 1 January 2021. ITL1
 * mirrors the former NUTS1 at twelve areas, so the project's stated geographic standard is
 * superseded in name only. Joins must be on code, never on name, and the boundary file and the code
 * list must come from the same edition.
 *
 * Northern Ireland is included in the list because the boundary file covers the whole UK, but the
 * Wealth and Assets Survey covers Great Britain only, so it carries no wealth value and must render
 * as a distinct "no data" class rather than as zero or as a missing polygon.
 */
export const ITL1 = [
  { code: 'TLC', name: 'North East', wasCovered: true },
  { code: 'TLD', name: 'North West', wasCovered: true },
  { code: 'TLE', name: 'Yorkshire and The Humber', wasCovered: true },
  { code: 'TLF', name: 'East Midlands', wasCovered: true },
  { code: 'TLG', name: 'West Midlands', wasCovered: true },
  { code: 'TLH', name: 'East of England', wasCovered: true },
  { code: 'TLI', name: 'London', wasCovered: true },
  { code: 'TLJ', name: 'South East', wasCovered: true },
  { code: 'TLK', name: 'South West', wasCovered: true },
  { code: 'TLL', name: 'Wales', wasCovered: true },
  { code: 'TLM', name: 'Scotland', wasCovered: true },
  { code: 'TLN', name: 'Northern Ireland', wasCovered: false },
]

export const itl1ByCode = Object.fromEntries(ITL1.map((r) => [r.code, r]))

function cellKey(cut) {
  return DROP_ORDER.concat()
    .sort()
    .map((k) => `${k}=${cut[k] ?? '*'}`)
    .join('|')
}

/**
 * Look up a median for a profile.
 *
 * @param {object} table  the lookup table loaded from was_lookup.json: an array of
 *                        {ageBand, tenure, region, median, sampleSize} rows, where a null in any
 *                        dimension means "all", so the file carries the marginals as well as the
 *                        full cross-tab.
 * @param {object} profile {ageBand, tenure, region}
 * @returns {{median:number|null, sampleSize:number, cut:object, droppedDimensions:string[],
 *            degraded:boolean, reason:string|null}}
 */
export function lookupMedian(table, profile) {
  if (!table || table.length === 0) {
    return {
      median: null,
      sampleSize: 0,
      cut: {},
      droppedDimensions: [],
      degraded: false,
      reason: 'no-table',
    }
  }

  const index = table.__index ?? buildIndex(table)
  const requested = {
    ageBand: profile.ageBand ?? null,
    tenure: profile.tenure ?? null,
    region: profile.region ?? null,
  }

  const dropped = []
  let cut = { ...requested }

  for (let attempt = 0; attempt <= DROP_ORDER.length; attempt += 1) {
    const row = index.get(cellKey(cut))
    if (row && row.sampleSize >= MIN_CELL_SIZE && row.median != null) {
      return {
        median: row.median,
        sampleSize: row.sampleSize,
        cut,
        droppedDimensions: dropped,
        degraded: dropped.length > 0,
        reason: dropped.length > 0 ? 'thin-cell' : null,
      }
    }
    // Drop the next dimension that is currently set.
    const next = DROP_ORDER.find((d) => cut[d] != null)
    if (!next) break
    dropped.push(next)
    cut = { ...cut, [next]: null }
  }

  return {
    median: null,
    sampleSize: 0,
    cut,
    droppedDimensions: dropped,
    degraded: true,
    reason: 'no-cell',
  }
}

function buildIndex(table) {
  const map = new Map()
  for (const row of table) {
    map.set(
      cellKey({ ageBand: row.ageBand, tenure: row.tenure, region: row.region }),
      row,
    )
  }
  // Cache on the array so repeated lookups during a cross-filter drag are cheap.
  Object.defineProperty(table, '__index', { value: map, enumerable: false })
  return map
}

/**
 * The caption every returned value must carry. Design spec B.4.0 requires that each value be
 * captioned as a typical value with a sample caveat, and that the missing-top caveat travels with
 * every wealth figure.
 */
export function captionFor(result) {
  if (result.median == null) {
    return 'The survey does not hold enough households with this combination to report a figure.'
  }
  const base =
    'Typical wealth for people like this: the ONS Wealth and Assets Survey median for this group, ' +
    'a conservative lower bound, not a prediction about any individual.'
  if (!result.degraded) return base
  const dropped = result.droppedDimensions
    .map((d) => ({ region: 'region', ageBand: 'age band', tenure: 'tenure' })[d])
    .join(' and ')
  return `${base} Too few households matched that exact combination, so this figure ignores ${dropped}.`
}

/**
 * E1.4 archetype presets. Design spec B.4.1: these encode the narrative and keep the framing
 * ethical, centring renters, younger cohorts and northern regions.
 */
export const presets = [
  {
    id: 'kc-owner',
    label: 'Bought in Kensington and Chelsea, owns outright, age 68',
    a: { ageBand: '65-74', tenure: 'owned-outright', region: 'TLI' },
    b: { ageBand: '25-34', tenure: 'private-rent', region: 'TLD' },
    note: 'The contrast the piece opens with: an early buyer in the most expensive market against a young private renter in the north west.',
  },
  {
    id: 'blackpool-renter',
    label: 'Private renter, Blackpool, age 32',
    a: { ageBand: '25-34', tenure: 'private-rent', region: 'TLD' },
    b: { ageBand: '55-64', tenure: 'owned-outright', region: 'TLJ' },
    note: 'Blackpool sits below the ITL1 standard, so the region resolves to North West and the local-authority detail stays in S14 where it is labelled as an illustration.',
  },
  {
    id: 'ne-social',
    label: 'Social renter, North East, age 40',
    a: { ageBand: '35-44', tenure: 'social-rent', region: 'TLC' },
    b: { ageBand: '35-44', tenure: 'mortgaged', region: 'TLJ' },
    note: 'Same age, same decade, different tenure and region. Isolates the two structural dimensions from timing.',
  },
  {
    id: 'se-mortgaged',
    label: 'Mortgaged owner, South East, age 45',
    a: { ageBand: '45-54', tenure: 'mortgaged', region: 'TLJ' },
    b: { ageBand: '45-54', tenure: 'private-rent', region: 'TLJ' },
    note: 'Holds age and region constant so only tenure varies. The cleanest single-variable comparison in the set.',
  },
]
