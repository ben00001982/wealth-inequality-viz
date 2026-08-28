import { palette, vegaConfig } from '../theme.js'
import { itl1ByCode } from '../data/lookup.js'

/**
 * Vega-Lite specifications for the explorer bowl: E1.1, E1.3, E1.5, E5 and E7.
 *
 * Two rules from design spec B.4.0 shape everything here.
 *
 * "No new facts, only new arrangements." Every number these views surface has already appeared in
 * the guided neck. The explorer re-cuts, personalises and compares; it does not introduce data the
 * static condition lacks. That is what makes the A/B comparison a test of interactivity.
 *
 * "The missing top is built into the interaction, not bolted on." The off-survey band is a mark in
 * the spec, not a footnote, so the reader meets the limitation by hitting it rather than by reading
 * about it.
 */

const BASE = { $schema: 'https://vega.github.io/schema/vega-lite/v6.json', config: vegaConfig }
const GBP = "'£' + format(datum.value, ',.0f')"

/**
 * E1.1. Three linked panels over one shared selection.
 *
 * Vega-Lite `vconcat` with a shared `point` selection parameter. Clicking in any panel cross-filters
 * the others. This is the foundation of the whole explorer: it carries the data engine and the state
 * seeded by the S18 handover, and every other sub-capability is a second layout mode over the same
 * engine.
 *
 * The choropleth is again paired with a ranked bar, for the same reason as S13 and S15: colour
 * carries the pattern, position carries the ranking.
 */
export function crossFilterSpec({ byAge, byTenure, byRegion, boundaries, selectedRegion = null }) {
  /*
   * Selection lives in React, not in a Vega selection parameter.
   *
   * A Vega `point` selection would give click-to-select inside the chart, but its state would then be
   * inside the view and invisible to the reducer, the telemetry and the accessible filter controls
   * beneath the chart. Two sources of truth for the same selection is exactly the bug the
   * useScrollama rule exists to avoid elsewhere in this codebase. So the selection is a boolean field
   * on each row, set by the reducer, and the chart reads it through a test expression. Clicking a
   * chip and clicking a bar would then both route through the same dispatch.
   *
   * Consequence worth stating: the marks themselves are not click-selectable in this build. The
   * accessible chip controls are the selection interface, which is also the keyboard-operable one, so
   * nothing is available by mouse that is not available by keyboard. Adding mark clicks that dispatch
   * to the reducer is a small addition and is listed in docs/ARCHITECTURE.md as an optional P4 item.
   */
  const emphasis = {
    condition: { test: 'datum.selected === true', value: palette.readerMark },
    value: palette.emphasis,
  }
  const anySelected = (rows) => rows.some((r) => r.selected)
  const emphasisFor = (rows) => (anySelected(rows) ? emphasis : { value: palette.emphasis })

  const valueByCode = Object.fromEntries(byRegion.map((r) => [r.code, r.median]))
  const features = (boundaries?.features ?? []).map((f) => ({
    ...f,
    properties: {
      ...f.properties,
      value: valueByCode[f.properties.code] ?? null,
      name: itl1ByCode[f.properties.code]?.name ?? f.properties.name,
    },
  }))

  return {
    ...BASE,
    vconcat: [
      {
        hconcat: [
          {
            title: { text: 'Median wealth by age band', anchor: 'start', fontSize: 13 },
            width: 300,
            height: 220,
            data: { values: byAge },
            mark: { type: 'bar', cornerRadiusEnd: 2 },
            encoding: {
              x: { field: 'ageBand', type: 'ordinal', title: 'Age band', axis: { labelAngle: 0 } },
              y: { field: 'median', type: 'quantitative', title: 'Median wealth', axis: { format: '~s' } },
              color: emphasisFor(byAge),
              tooltip: [
                { field: 'ageBand', type: 'ordinal', title: 'Age band' },
                { field: 'median', type: 'quantitative', format: ',.0f', title: 'Median wealth (£)' },
                { field: 'sampleSize', type: 'quantitative', title: 'Households in the survey cell' },
              ],
            },
          },
          {
            title: { text: 'Median wealth by tenure', anchor: 'start', fontSize: 13 },
            width: 300,
            height: 220,
            data: { values: byTenure },
            mark: { type: 'bar', cornerRadiusEnd: 2 },
            encoding: {
              x: { field: 'tenure', type: 'ordinal', title: 'Tenure', axis: { labelAngle: -20 } },
              y: { field: 'median', type: 'quantitative', title: 'Median wealth', axis: { format: '~s' } },
              color: emphasisFor(byTenure),
              tooltip: [
                { field: 'tenure', type: 'ordinal', title: 'Tenure' },
                { field: 'median', type: 'quantitative', format: ',.0f', title: 'Median wealth (£)' },
                { field: 'sampleSize', type: 'quantitative', title: 'Households in the survey cell' },
              ],
            },
          },
        ],
      },
      {
        hconcat: [
          {
            title: { text: 'Median wealth by area', anchor: 'start', fontSize: 13 },
            width: 260,
            height: 320,
            // Features are passed as a plain array rather than a FeatureCollection with
        // format.property. Both are valid, but the array form makes the projection's automatic
        // fit behave predictably: with the collection form the fit can latch onto the wrong
        // extent and render one polygon at full view size.
        data: { values: features },
            projection: { type: 'mercator' },
            mark: { type: 'geoshape' },
            encoding: {
              // The selected area is outlined rather than recoloured, so the sequential scale keeps
              // meaning what it means. Colour never carries the selection on its own.
              stroke: selectedRegion
                ? {
                    condition: {
                      test: `datum.properties.code === '${selectedRegion}'`,
                      value: palette.readerMark,
                    },
                    value: palette.paper,
                  }
                : { value: palette.paper },
              strokeWidth: selectedRegion
                ? {
                    condition: { test: `datum.properties.code === '${selectedRegion}'`, value: 3 },
                    value: 0.6,
                  }
                : { value: 0.6 },
              color: {
                field: 'properties.value',
                type: 'quantitative',
                title: 'Median wealth',
                scale: { range: palette.sequential },
                legend: { orient: 'bottom', format: '~s', tickCount: 4 },
              },
              tooltip: [
                { field: 'properties.name', type: 'nominal', title: 'Area' },
                { field: 'properties.value', type: 'quantitative', format: ',.0f', title: 'Median wealth (£)' },
              ],
            },
          },
          {
            title: { text: 'The same areas, ranked', anchor: 'start', fontSize: 13 },
            width: 300,
            height: 320,
            data: {
              values: byRegion.map((d) => ({
                ...d,
                name: itl1ByCode[d.code]?.name ?? d.code,
              })),
            },
            mark: { type: 'bar', cornerRadiusEnd: 2 },
            encoding: {
              y: { field: 'name', type: 'nominal', sort: '-x', title: null },
              x: { field: 'median', type: 'quantitative', title: 'Median wealth', axis: { format: '~s', tickCount: 4 } },
              color: emphasisFor(byRegion),
              tooltip: [
                { field: 'name', type: 'nominal', title: 'Area' },
                { field: 'median', type: 'quantitative', format: ',.0f', title: 'Median wealth (£)' },
                { field: 'sampleSize', type: 'quantitative', title: 'Households in the survey cell' },
              ],
            },
          },
        ],
      },
    ],
  }
}

/**
 * E1.3 and E1.5. Two profile cards as paired bars on a common scale, with the off-survey band above.
 *
 * Paired bars on a common scale so the gap is read directly from length, which is the accurate
 * encoding for a comparison task. The head-start offset from E1.5 is a separate stacked segment, so
 * the inherited amount stays visually separable from the survey baseline. That separation matters:
 * the baseline is a published median and the offset is a reader-driven what-if, and the chart must
 * not blur the two into one number.
 */
export function compareProfilesSpec(cards, { missingBandFrom = null, showMissingBand = true } = {}) {
  const rows = cards.flatMap((c) => {
    const out = [{ card: c.label, segment: 'Survey median for this group', amount: c.median ?? 0 }]
    if (c.headStart > 0) {
      out.push({ card: c.label, segment: 'Reader-added head start', amount: c.headStart })
    }
    return out
  })

  const layers = [
    {
      mark: { type: 'bar', cornerRadiusEnd: 2, width: 90 },
      encoding: {
        x: { field: 'card', type: 'nominal', title: null, axis: { labelAngle: 0, labelLimit: 220 } },
        y: {
          field: 'amount',
          type: 'quantitative',
          stack: true,
          title: 'Household total wealth',
          axis: { labelExpr: GBP },
        },
        color: {
          field: 'segment',
          type: 'nominal',
          title: null,
          scale: {
            domain: ['Survey median for this group', 'Reader-added head start'],
            range: [palette.emphasis, palette.categorical[4]],
          },
          legend: { orient: 'top' },
        },
        tooltip: [
          { field: 'card', type: 'nominal', title: 'Profile' },
          { field: 'segment', type: 'nominal', title: 'Segment' },
          { field: 'amount', type: 'quantitative', format: ',.0f', title: 'Amount (£)' },
        ],
      },
    },
  ]

  if (showMissingBand && missingBandFrom != null) {
    // The off-survey band. Empty here by design: E7 is what fills it.
    layers.unshift({
      data: { values: [{ from: missingBandFrom }] },
      mark: { type: 'rect', color: palette.missing, opacity: 0.35 },
      encoding: {
        y: { field: 'from', type: 'quantitative' },
        y2: { datum: missingBandFrom * 3 },
      },
    })
  }

  return { ...BASE, width: 'container', height: 380, data: { values: rows }, layer: layers }
}

/**
 * E5. Same characteristics, different survey wave.
 *
 * REDEFINED at design spec revision r2.6. The frozen spec asked for a market-entry-decade slider,
 * and the P4 data verification found that the Wealth and Assets Survey carries no market-entry-decade
 * variable, so that lever cannot be built from the permitted sources without inventing a value. The
 * lever becomes the survey wave: hold age band, tenure and region constant and move through the
 * waves, which answers the same question ("how much does when you did this matter?") from data that
 * exists. The encoding is unchanged, which is why this is a redefinition rather than a redesign, but
 * it changes a design decision and therefore needs Ben's sign-off.
 */
export function timingWhatIfSpec(rows, { highlightWave = null } = {}) {
  return {
    ...BASE,
    width: 'container',
    height: 340,
    data: { values: rows },
    layer: [
      {
        mark: { type: 'line', strokeWidth: 2.5, point: { filled: true, size: 70 } },
        encoding: {
          x: { field: 'wave', type: 'ordinal', title: 'Survey wave', axis: { labelAngle: -20 } },
          y: {
            field: 'median',
            type: 'quantitative',
            title: 'Median wealth for this profile',
            axis: { labelExpr: GBP },
          },
          color: {
            field: 'profile',
            type: 'nominal',
            title: 'Profile',
            scale: { range: palette.categorical },
          },
          tooltip: [
            { field: 'profile', type: 'nominal', title: 'Profile' },
            { field: 'wave', type: 'ordinal', title: 'Wave' },
            { field: 'median', type: 'quantitative', format: ',.0f', title: 'Median wealth (£)' },
          ],
        },
      },
      ...(highlightWave
        ? [
            {
              data: { values: [{ wave: highlightWave }] },
              mark: { type: 'rule', color: palette.readerMark, strokeWidth: 2, strokeDash: [4, 3] },
              encoding: { x: { field: 'wave', type: 'ordinal' } },
            },
          ]
        : []),
    ],
  }
}

/**
 * E7. "Off the chart": the stepped-rescale sequence.
 *
 * Design spec B.4.3. Each frame is an ordinary linear-axis bar chart and is therefore honest on its
 * own; the *sequence* delivers the full range. A single chart across this range forces a bad choice:
 * a linear axis makes the reader invisible next to a billionaire, and a log axis makes everything
 * visible but misleads a lay audience about magnitude. Continuous scroll-to-scale is not feasible in
 * this stack, which is stated in the report rather than hidden, and the stepped form is the honest
 * cousin of it.
 *
 * The Rich List anchor is a published aggregate and is annotated as a sourced lower bound on top
 * concentration, not as an authority. No individual is named anywhere.
 */
export function offTheChartSpec(bars, { domainMax, missingBand = null, ratioReadout = null }) {
  const layers = []

  if (missingBand) {
    layers.push({
      data: { values: [missingBand] },
      mark: { type: 'rect', color: palette.missing, opacity: 0.4 },
      encoding: {
        y: { field: 'from', type: 'quantitative', scale: { domain: [0, domainMax] } },
        y2: { field: 'to' },
      },
    })
    layers.push({
      data: { values: [missingBand] },
      mark: { type: 'text', align: 'left', dx: 4, fontSize: 11, color: palette.inkMuted, baseline: 'bottom' },
      encoding: {
        y: { field: 'to', type: 'quantitative' },
        x: { datum: bars[0]?.label, type: 'nominal' },
        text: { value: 'About £800bn the survey cannot see' },
      },
    })
  }

  layers.push({
    mark: { type: 'bar', cornerRadiusEnd: 2, width: 70 },
    encoding: {
      x: { field: 'label', type: 'nominal', title: null, axis: { labelAngle: -20, labelLimit: 160 } },
      y: {
        field: 'value',
        type: 'quantitative',
        title: 'Wealth',
        scale: { domain: [0, domainMax], clamp: true },
        axis: { labelExpr: GBP },
      },
      color: {
        field: 'kind',
        type: 'nominal',
        scale: {
          domain: ['you', 'household', 'threshold', 'richlist'],
          range: [palette.readerMark, palette.emphasis, palette.categorical[2], palette.ink],
        },
        legend: null,
      },
      tooltip: [
        { field: 'label', type: 'nominal', title: null },
        { field: 'value', type: 'quantitative', format: ',.0f', title: 'Wealth (£)' },
      ],
    },
  })

  if (ratioReadout) {
    layers.push({
      data: { values: [{ text: ratioReadout }] },
      mark: {
        type: 'text',
        align: 'left',
        fontSize: 13,
        fontWeight: 600,
        color: palette.ink,
        dx: 0,
        dy: 0,
      },
      encoding: {
        x: { datum: bars[0]?.label, type: 'nominal' },
        y: { datum: domainMax * 0.92, type: 'quantitative' },
        text: { field: 'text', type: 'nominal' },
      },
    })
  }

  return { ...BASE, width: 'container', height: 400, data: { values: bars }, layer: layers }
}

/**
 * E7, static condition. The same frames as a small multiple.
 *
 * Design spec B.6 requires the Rich List anchor to appear in the static condition too, or the
 * interactive arm would carry a fact the static arm never sees and the study would measure content
 * rather than interactivity. This is the artefact-level confound control, and it is the single
 * largest parity risk in the build: if this small multiple is not built, one comprehension item has
 * to be dropped.
 */
export function offTheChartSmallMultipleSpec(frames) {
  return {
    ...BASE,
    data: { values: frames },
    facet: { field: 'frameLabel', type: 'nominal', title: null, columns: 2, sort: { field: 'frame' } },
    spec: {
      width: 240,
      height: 200,
      mark: { type: 'bar', cornerRadiusEnd: 2 },
      encoding: {
        x: { field: 'label', type: 'nominal', title: null, axis: { labelAngle: -35, labelLimit: 110 } },
        y: { field: 'value', type: 'quantitative', title: 'Wealth', axis: { labelExpr: GBP } },
        color: {
          field: 'kind',
          type: 'nominal',
          scale: {
            domain: ['you', 'household', 'threshold', 'richlist'],
            range: [palette.readerMark, palette.emphasis, palette.categorical[2], palette.ink],
          },
          legend: null,
        },
        tooltip: [
          { field: 'label', type: 'nominal', title: null },
          { field: 'value', type: 'quantitative', format: ',.0f', title: 'Wealth (£)' },
        ],
      },
    },
    resolve: { scale: { y: 'independent' } },
  }
}
