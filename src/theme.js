/**
 * Palette roles, not invented values.
 *
 * L10 (colour and perceptual encoding) fixes the *roles* a palette must fill and the checks a
 * candidate palette must pass; it deliberately does not invent hex codes, because an unsourced
 * colour value is still an unsourced value. The values below are drawn from two published,
 * citable sources so that every one of them can be attributed in the report:
 *
 *   - Sequential and single-hue ramps: ColorBrewer 2.0 (Brewer, Harrower and Pennsylvania State
 *     University), 'Blues' and 'YlOrBr' classes. ColorBrewer schemes were designed and tested for
 *     map legibility, which is exactly the choropleth case.
 *   - Categorical accents: the Okabe and Ito colour-blind safe qualitative set.
 *
 * Both are recorded as candidate reference additions in the L10 note. Every value here must be
 * re-checked at build time against the checks in L10 section "Build-time palette checks":
 * WCAG 2.1 AA contrast for text and non-text UI, deuteranopia/protanopia/tritanopia simulation,
 * and greyscale ordering for the sequential ramps.
 *
 * NOTE ON CONTRAST: WCAG 1.4.3 and 1.4.11 bind text and user-interface components. A data-encoding
 * fill (a choropleth class, a bar) is neither, so it is not required to hit 4.5:1 against its
 * neighbours. What *is* required is that any text drawn on top of a fill meets contrast against
 * that fill, and that meaning is never carried by colour alone (1.4.1). That is why every
 * choropleth here is paired with a ranked bar, and why the focus ring is two-tone.
 */

export const palette = {
  // Sequential ramp for wealth and price choropleths. ColorBrewer 'Blues' 6-class.
  sequential: ['#eff3ff', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c'],
  // Second sequential ramp, used where two maps sit side by side and must not be confused.
  sequentialAlt: ['#ffffe5', '#fff7bc', '#fee391', '#fec44f', '#fe9929', '#cc4c02'],
  // Categorical accents, Okabe and Ito colour-blind safe set.
  categorical: ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9'],
  // Semantic roles.
  emphasis: '#08519c', // the focal series or highlighted band
  muted: '#9aa5b1', // de-emphasised context series
  missing: '#d9d9d9', // the off-survey band: deliberately neutral, never alarming red
  missingHatch: '#bdbdbd',
  readerMark: '#D55E00', // the "you are here" rule; must be distinguishable in all three CVD types
  ink: '#1f2933',
  inkMuted: '#52606d',
  paper: '#ffffff',
  paperMuted: '#f5f7fa',
  rule: '#cbd2d9',
  focusInner: '#ffffff',
  focusOuter: '#08519c',
  noData: '#f0f0f0', // Northern Ireland on WAS maps: no data, not zero
}

/** Vega-Lite config applied to every spec, so the charts read as one system. */
export const vegaConfig = {
  background: 'transparent',
  font: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  axis: {
    labelColor: palette.inkMuted,
    titleColor: palette.ink,
    domainColor: palette.rule,
    tickColor: palette.rule,
    gridColor: palette.paperMuted,
    labelFontSize: 12,
    titleFontSize: 12,
    titleFontWeight: 600,
  },
  legend: {
    labelColor: palette.inkMuted,
    titleColor: palette.ink,
    labelFontSize: 12,
    titleFontSize: 12,
  },
  view: { stroke: 'transparent' },
  bar: { color: palette.emphasis },
  line: { color: palette.emphasis, strokeWidth: 2.5 },
  area: { opacity: 0.9 },
  point: { filled: true },
  text: { color: palette.ink, fontSize: 12 },
  range: {
    category: palette.categorical,
    heatmap: palette.sequential,
    ordinal: palette.sequential,
  },
}
