import { palette, vegaConfig } from '../theme.js'
import { itl1ByCode } from '../data/lookup.js'

/**
 * Vega-Lite specifications for the guided neck, S1 to S18.
 *
 * Every spec here is a plain JSON object returned by a pure function of (data, options). No spec
 * holds state and none reads React context. That is deliberate: design spec B.1 puts the
 * martini-glass state in React and the encodings in Vega-Lite, and the tech stack requires specs as
 * JSON objects rather than inline JSX props. It also makes each spec paste-able straight into the
 * Vega-Lite online editor, which is how each one should be prototyped before it is wired up.
 *
 * The `staged` option is the interactive condition's within-chart transition (pattern A6). It never
 * adds a mark or a data point: it changes what is emphasised. Adding data under `staged` would break
 * content parity and the study would measure content volume instead of interactivity.
 */

const BASE = { $schema: 'https://vega.github.io/schema/vega-lite/v6.json', config: vegaConfig }

const GBP = "'£' + format(datum.value, ',.0f')"

/** The recurring missing-top caveat, as a chart-level footnote so it travels with the encoding. */
function caveatFooter(text) {
  return {
    title: {
      text: '',
      subtitle: text,
      subtitleColor: palette.inkMuted,
      subtitleFontSize: 11,
      anchor: 'start',
      orient: 'bottom',
      subtitleLineHeight: 15,
      dy: 8,
    },
  }
}

/** S1. Wealth share by decile, top decile emphasised. Position and length: the accurate encodings. */
export function wealthByDecileSpec(rows, { staged = false, caveat } = {}) {
  return {
    ...BASE,
    ...(caveat ? caveatFooter(caveat) : {}),
    width: 'container',
    height: 320,
    data: { values: rows },
    layer: [
      {
        mark: { type: 'bar', cornerRadiusEnd: 2 },
        encoding: {
          x: {
            field: 'decile',
            type: 'ordinal',
            title: 'Wealth decile, least wealthy on the left',
            axis: { labelAngle: 0 },
          },
          y: {
            field: 'share',
            type: 'quantitative',
            title: 'Share of all household wealth',
            axis: { format: '.0%' },
            scale: { domain: [0, 0.6] },
          },
          color: {
            condition: {
              test: 'datum.decile === 10',
              value: palette.emphasis,
            },
            value: staged ? palette.muted : palette.categorical[0],
          },
          tooltip: [
            { field: 'decile', type: 'ordinal', title: 'Decile' },
            { field: 'share', type: 'quantitative', format: '.1%', title: 'Share of total wealth' },
          ],
        },
      },
      {
        // The equal-share reference line. Without it a reader has no anchor for what "a lot" means.
        mark: { type: 'rule', strokeDash: [4, 3], color: palette.inkMuted },
        encoding: { y: { datum: 0.1, type: 'quantitative' } },
      },
      {
        mark: { type: 'text', align: 'left', dx: 4, dy: -6, fontSize: 11, color: palette.inkMuted },
        encoding: {
          y: { datum: 0.1, type: 'quantitative' },
          x: { datum: '1', type: 'ordinal' },
          text: { value: 'An equal share would be 10%' },
        },
      },
    ],
  }
}

/** S2. Top-decile share over time, flat, with the wealth-to-income ratio as the annotated story. */
export function topShareTrendSpec(rows, { caveat } = {}) {
  return {
    ...BASE,
    ...(caveat ? caveatFooter(caveat) : {}),
    width: 'container',
    height: 320,
    data: { values: rows },
    resolve: { scale: { y: 'independent' } },
    layer: [
      {
        mark: { type: 'line', color: palette.emphasis, strokeWidth: 3, point: false },
        encoding: {
          x: { field: 'year', type: 'quantitative', title: 'Year', axis: { format: 'd' } },
          y: {
            field: 'topDecileShare',
            type: 'quantitative',
            title: 'Share held by the wealthiest tenth',
            axis: { format: '.0%' },
            scale: { domain: [0, 0.8] },
          },
          tooltip: [
            { field: 'year', type: 'quantitative', format: 'd', title: 'Year' },
            { field: 'topDecileShare', type: 'quantitative', format: '.0%', title: 'Top-decile share' },
            {
              field: 'wealthToIncome',
              type: 'quantitative',
              format: '.1f',
              title: 'Total wealth, multiples of national income',
            },
          ],
        },
      },
      {
        mark: { type: 'line', color: palette.categorical[1], strokeWidth: 2, strokeDash: [5, 3] },
        encoding: {
          x: { field: 'year', type: 'quantitative' },
          y: {
            field: 'wealthToIncomeScaled',
            type: 'quantitative',
            title: null,
            scale: { domain: [0, 0.8] },
          },
        },
      },
      {
        mark: { type: 'text', align: 'left', dx: 6, fontSize: 11, fontWeight: 600 },
        encoding: {
          x: { field: 'year', type: 'quantitative', aggregate: 'max' },
          y: { field: 'wealthToIncomeScaled', type: 'quantitative', aggregate: 'max' },
          text: { value: 'Total wealth vs national income (right-hand story)' },
          color: { value: palette.categorical[1] },
        },
      },
    ],
  }
}

/**
 * S3. Wealth composition as a donut.
 *
 * A knowing departure from the Cleveland and McGill hierarchy: angle and area are read less
 * accurately than position and length. Accepted because the task is one dominant part against the
 * whole rather than a ranking of the minor parts, and because the dominant share is labelled
 * numerically so the reader never has to judge an angle. The report must state this, not bury it.
 */
export function wealthCompositionSpec(rows, { caveat } = {}) {
  return {
    ...BASE,
    ...(caveat ? caveatFooter(caveat) : {}),
    width: 'container',
    height: 320,
    data: { values: rows },
    layer: [
      {
        mark: { type: 'arc', innerRadius: 70, outerRadius: 130, stroke: palette.paper, strokeWidth: 2 },
        encoding: {
          theta: { field: 'share', type: 'quantitative', stack: true },
          color: {
            field: 'component',
            type: 'nominal',
            title: 'Component',
            scale: { range: palette.categorical },
            legend: { orient: 'right' },
          },
          order: { field: 'share', type: 'quantitative', sort: 'descending' },
          tooltip: [
            { field: 'component', type: 'nominal', title: 'Component' },
            { field: 'share', type: 'quantitative', format: '.0%', title: 'Share of household wealth' },
          ],
        },
      },
      {
        // Numeric labels on the arcs, so the reader never depends on the angle judgement.
        mark: { type: 'text', radius: 152, fontSize: 12 },
        encoding: {
          theta: { field: 'share', type: 'quantitative', stack: true },
          text: { field: 'share', type: 'quantitative', format: '.0%' },
          order: { field: 'share', type: 'quantitative', sort: 'descending' },
        },
      },
    ],
  }
}

/** S5. Tenure composition 1995 to 2024, private-rented band highlighted. */
export function tenureCompositionSpec(rows, { highlight = 'Private rented' } = {}) {
  return {
    ...BASE,
    width: 'container',
    height: 320,
    data: { values: rows },
    mark: { type: 'area', line: { color: palette.paper, strokeWidth: 0.5 } },
    encoding: {
      x: { field: 'year', type: 'quantitative', title: 'Year', axis: { format: 'd' } },
      y: {
        field: 'share',
        type: 'quantitative',
        stack: 'normalize',
        title: 'Share of households',
        axis: { format: '.0%' },
      },
      color: {
        field: 'tenure',
        type: 'nominal',
        title: 'Tenure',
        scale: { range: palette.categorical },
      },
      // The focal band is opaque and the rest is muted, which compensates for how badly a middle
      // band in a stacked area is read: its thickness is the quantity, but its position moves.
      opacity: {
        condition: { test: `datum.tenure === '${highlight}'`, value: 1 },
        value: 0.45,
      },
      order: { field: 'order', type: 'quantitative' },
      tooltip: [
        { field: 'year', type: 'quantitative', format: 'd', title: 'Year' },
        { field: 'tenure', type: 'nominal', title: 'Tenure' },
        { field: 'share', type: 'quantitative', format: '.1%', title: 'Share of households' },
      ],
    },
  }
}

/** S6. Median wealth by tenure, grouped by survey wave. Compare task, common scale. */
export function wealthByTenureSpec(rows, { caveat } = {}) {
  return {
    ...BASE,
    ...(caveat ? caveatFooter(caveat) : {}),
    width: 'container',
    height: 340,
    data: { values: rows },
    mark: { type: 'bar', cornerRadiusEnd: 2 },
    encoding: {
      x: { field: 'wave', type: 'ordinal', title: 'Survey wave', axis: { labelAngle: 0 } },
      xOffset: { field: 'tenure', type: 'nominal' },
      y: {
        field: 'median',
        type: 'quantitative',
        title: 'Median household total wealth',
        axis: { labelExpr: GBP },
      },
      color: {
        field: 'tenure',
        type: 'nominal',
        title: 'Tenure',
        scale: { range: palette.categorical },
      },
      tooltip: [
        { field: 'wave', type: 'ordinal', title: 'Wave' },
        { field: 'tenure', type: 'nominal', title: 'Tenure' },
        { field: 'median', type: 'quantitative', format: ',.0f', title: 'Median wealth (£)' },
      ],
    },
  }
}

/** S8. House price index, annotated line. */
export function housePricesSpec(rows, { annotations = [] } = {}) {
  return {
    ...BASE,
    width: 'container',
    height: 320,
    data: { values: rows },
    layer: [
      {
        mark: { type: 'area', line: { color: palette.emphasis, strokeWidth: 2.5 }, opacity: 0.12 },
        encoding: {
          x: { field: 'year', type: 'quantitative', title: 'Year', axis: { format: 'd' } },
          y: {
            field: 'price',
            type: 'quantitative',
            title: 'Average UK house price',
            axis: { labelExpr: GBP },
          },
          tooltip: [
            { field: 'year', type: 'quantitative', format: 'd', title: 'Year' },
            { field: 'price', type: 'quantitative', format: ',.0f', title: 'Average price (£)' },
          ],
        },
      },
      ...annotations.map((a) => ({
        data: { values: [a] },
        mark: { type: 'text', align: 'left', dx: 6, dy: -8, fontSize: 11, fontWeight: 600 },
        encoding: {
          x: { field: 'year', type: 'quantitative' },
          y: { field: 'price', type: 'quantitative' },
          text: { field: 'label', type: 'nominal' },
          color: { value: palette.ink },
        },
      })),
    ],
  }
}

/** S9. Price-to-earnings affordability ratio. */
export function affordabilitySpec(rows) {
  return {
    ...BASE,
    width: 'container',
    height: 320,
    data: { values: rows },
    layer: [
      {
        mark: { type: 'line', strokeWidth: 3, color: palette.emphasis },
        encoding: {
          x: { field: 'year', type: 'quantitative', title: 'Year', axis: { format: 'd' } },
          y: {
            field: 'ratio',
            type: 'quantitative',
            title: 'Years of median earnings to buy a median home',
            scale: { zero: true },
          },
          tooltip: [
            { field: 'year', type: 'quantitative', format: 'd', title: 'Year' },
            { field: 'ratio', type: 'quantitative', format: '.1f', title: 'Price to earnings ratio' },
          ],
        },
      },
      {
        mark: { type: 'point', filled: true, size: 60, color: palette.readerMark },
        // Peak and latest only: two labelled points, not a point on every observation.
        transform: [{ filter: 'datum.mark === true' }],
        encoding: {
          x: { field: 'year', type: 'quantitative' },
          y: { field: 'ratio', type: 'quantitative' },
        },
      },
      {
        mark: { type: 'text', align: 'left', dx: 8, dy: -8, fontSize: 11, fontWeight: 600 },
        transform: [{ filter: 'datum.mark === true' }],
        encoding: {
          x: { field: 'year', type: 'quantitative' },
          y: { field: 'ratio', type: 'quantitative' },
          text: { field: 'label', type: 'nominal' },
        },
      },
    ],
  }
}

/** S10. Median wealth by age band. */
export function wealthByAgeSpec(rows, { caveat, staged = false } = {}) {
  return {
    ...BASE,
    ...(caveat ? caveatFooter(caveat) : {}),
    width: 'container',
    height: 320,
    data: { values: rows },
    mark: { type: 'bar', cornerRadiusEnd: 2 },
    encoding: {
      x: { field: 'ageBand', type: 'ordinal', title: 'Age band of household head', axis: { labelAngle: 0 } },
      y: {
        field: 'median',
        type: 'quantitative',
        title: 'Median household total wealth',
        axis: { labelExpr: GBP },
      },
      color: staged
        ? {
            condition: { test: "datum.ageBand === '25-34' || datum.ageBand === '65-74'", value: palette.emphasis },
            value: palette.muted,
          }
        : { value: palette.emphasis },
      tooltip: [
        { field: 'ageBand', type: 'ordinal', title: 'Age band' },
        { field: 'median', type: 'quantitative', format: ',.0f', title: 'Median wealth (£)' },
      ],
    },
  }
}

/**
 * S11. Wealth by age at two waves, as small multiples.
 *
 * This replaces the animated reveal the prior project used. Design spec B.8 flag 1: object-constant
 * tweened animation between arbitrary chart states is the one genuine Vega-Lite capability gap, and
 * D3 is excluded by the fixed stack. Faceted small multiples are the substitute, and they are not
 * merely a fallback: static side-by-side traces are better for an analytical comparison than
 * animation (Robertson et al., 2008; Tversky et al., 2002).
 */
export function wealthByAgeFacetSpec(rows, { caveat } = {}) {
  return {
    ...BASE,
    ...(caveat ? caveatFooter(caveat) : {}),
    data: { values: rows },
    facet: { field: 'wave', type: 'nominal', title: null, columns: 2 },
    spec: {
      width: 280,
      height: 260,
      mark: { type: 'bar', cornerRadiusEnd: 2 },
      encoding: {
        x: { field: 'ageBand', type: 'ordinal', title: 'Age band', axis: { labelAngle: -45 } },
        y: {
          field: 'median',
          type: 'quantitative',
          title: 'Median wealth',
          axis: { labelExpr: GBP },
        },
        color: { value: palette.emphasis },
        tooltip: [
          { field: 'wave', type: 'nominal', title: 'Survey wave' },
          { field: 'ageBand', type: 'ordinal', title: 'Age band' },
          { field: 'median', type: 'quantitative', format: ',.0f', title: 'Median wealth (£)' },
        ],
      },
    },
    resolve: { scale: { y: 'shared' } },
  }
}

/**
 * S13 and S15. Choropleth paired with a ranked bar.
 *
 * The pairing is the point. Colour ranks low for accuracy in the Cleveland and McGill hierarchy, so
 * the map carries the spatial pattern and the bar beside it carries the precise ranking on a
 * position scale. It also satisfies WCAG 1.4.1: the ranking is available without perceiving colour
 * at all.
 *
 * Northern Ireland renders in the no-data class on any Wealth and Assets Survey map, because the
 * survey covers Great Britain only. Rendering it as zero or omitting the polygon would both be
 * misreadings.
 */
export function choroplethWithRankedBarSpec(
  boundaries,
  values,
  { valueField = 'value', valueTitle = 'Value', ramp = palette.sequential, currency = true } = {},
) {
  const valueByCode = Object.fromEntries(values.map((v) => [v.code, v[valueField]]))
  const features = (boundaries?.features ?? []).map((f) => ({
    ...f,
    properties: {
      ...f.properties,
      value: valueByCode[f.properties.code] ?? null,
      name: itl1ByCode[f.properties.code]?.name ?? f.properties.name,
    },
  }))

  const bars = values
    .filter((v) => v[valueField] != null)
    .map((v) => ({ ...v, name: itl1ByCode[v.code]?.name ?? v.code }))

  return {
    ...BASE,
    hconcat: [
      {
        width: 300,
        height: 380,
        // Features are passed as a plain array rather than a FeatureCollection with
        // format.property. Both are valid, but the array form makes the projection's automatic
        // fit behave predictably: with the collection form the fit can latch onto the wrong
        // extent and render one polygon at full view size.
        data: { values: features },
        projection: { type: 'mercator' },
        mark: { type: 'geoshape', stroke: palette.paper, strokeWidth: 0.6 },
        encoding: {
          color: {
            field: 'properties.value',
            type: 'quantitative',
            title: valueTitle,
            scale: { range: ramp },
            // A short legend title and few ticks: a long title truncates and dense currency labels
            // collide at this panel width.
            legend: { orient: 'bottom', format: currency ? '~s' : '.1f', titleLimit: 240, tickCount: 4 },
          },
          tooltip: [
            { field: 'properties.name', type: 'nominal', title: 'Area' },
            {
              field: 'properties.value',
              type: 'quantitative',
              format: currency ? ',.0f' : '.1f',
              title: valueTitle,
            },
          ],
        },
      },
      {
        width: 260,
        height: 380,
        data: { values: bars },
        mark: { type: 'bar', cornerRadiusEnd: 2 },
        encoding: {
          y: { field: 'name', type: 'nominal', sort: '-x', title: null },
          x: {
            field: valueField,
            type: 'quantitative',
            title: valueTitle,
            axis: currency ? { format: '~s', tickCount: 4 } : { tickCount: 4 },
          },
          color: { field: valueField, type: 'quantitative', scale: { range: ramp }, legend: null },
          tooltip: [
            { field: 'name', type: 'nominal', title: 'Area' },
            {
              field: valueField,
              type: 'quantitative',
              format: currency ? ',.0f' : '.1f',
              title: valueTitle,
            },
          ],
        },
      },
    ],
  }
}

/**
 * S14. Two local authorities indexed to a common base of 100.
 *
 * Indexing is the mitigation, not a stylistic choice. The prior project's absolute-scale version of
 * this comparison produced a known misread: readers judged the growth from the gap between two very
 * different price levels. Indexing puts both series on the same starting point so the slope is the
 * quantity being compared.
 */
export function localAuthorityIndexSpec(rows) {
  return {
    ...BASE,
    width: 'container',
    height: 320,
    data: { values: rows },
    layer: [
      {
        mark: { type: 'line', strokeWidth: 2.5 },
        encoding: {
          x: { field: 'year', type: 'quantitative', title: 'Year', axis: { format: 'd' } },
          y: {
            field: 'index',
            type: 'quantitative',
            title: 'Price index, base year = 100',
            scale: { zero: true },
          },
          color: {
            field: 'area',
            type: 'nominal',
            title: 'Local authority',
            scale: { range: [palette.categorical[0], palette.categorical[1]] },
          },
          tooltip: [
            { field: 'area', type: 'nominal', title: 'Area' },
            { field: 'year', type: 'quantitative', format: 'd', title: 'Year' },
            { field: 'index', type: 'quantitative', format: '.0f', title: 'Index (base 100)' },
          ],
        },
      },
      {
        mark: { type: 'rule', color: palette.rule, strokeDash: [3, 3] },
        encoding: { y: { datum: 100, type: 'quantitative' } },
      },
    ],
  }
}

/**
 * S16. Surveyed wealth plus the estimated missing amount, as a segmented bar.
 *
 * Design spec B.8 flag 2: the prior project's iceberg graphic is not a Vega-Lite mark and is not one
 * of the permitted chart types. The segmented bar keeps the £800bn as a position-encoded quantity
 * the reader can measure, which is a stronger claim than a metaphor.
 */
export function missingTopSpec(rows) {
  return {
    ...BASE,
    width: 'container',
    height: 300,
    data: { values: rows },
    layer: [
      {
        mark: { type: 'bar', cornerRadiusEnd: 2, width: 90 },
        encoding: {
          x: { field: 'category', type: 'nominal', title: null, axis: { labelAngle: 0 } },
          y: {
            field: 'amountBn',
            type: 'quantitative',
            stack: true,
            title: 'Household wealth, £bn',
          },
          color: {
            field: 'segment',
            type: 'nominal',
            title: null,
            scale: {
              domain: ['Observed in the survey', 'Estimated missing from the survey'],
              range: [palette.emphasis, palette.missing],
            },
            legend: { orient: 'top' },
          },
          tooltip: [
            { field: 'segment', type: 'nominal', title: 'Segment' },
            { field: 'amountBn', type: 'quantitative', format: ',.0f', title: '£bn' },
          ],
        },
      },
    ],
  }
}

/** S18 and E1.2. The distribution with a reader-position rule. */
export function locatorDistributionSpec(
  distribution,
  { readerValue = null, readerLabel = 'You are roughly here', caveat } = {},
) {
  const layers = [
    {
      mark: { type: 'bar', cornerRadiusEnd: 1 },
      encoding: {
        x: {
          field: 'percentile',
          type: 'quantitative',
          title: 'Position in the wealth distribution, percentile',
          scale: { domain: [0, 100] },
        },
        y: {
          field: 'wealth',
          type: 'quantitative',
          title: 'Household total wealth',
          axis: { labelExpr: GBP },
        },
        color: { value: palette.muted },
        tooltip: [
          { field: 'percentile', type: 'quantitative', title: 'Percentile' },
          { field: 'wealth', type: 'quantitative', format: ',.0f', title: 'Wealth (£)' },
        ],
      },
    },
  ]

  if (readerValue != null) {
    layers.push(
      {
        mark: { type: 'rule', color: palette.readerMark, strokeWidth: 3 },
        data: { values: [{ wealth: readerValue }] },
        encoding: { y: { field: 'wealth', type: 'quantitative' } },
      },
      {
        mark: {
          type: 'text',
          align: 'left',
          dx: 6,
          dy: -8,
          fontSize: 12,
          fontWeight: 700,
          color: palette.readerMark,
        },
        data: { values: [{ wealth: readerValue, label: readerLabel }] },
        encoding: {
          y: { field: 'wealth', type: 'quantitative' },
          x: { datum: 2, type: 'quantitative' },
          text: { field: 'label', type: 'nominal' },
        },
      },
    )
  }

  return {
    ...BASE,
    ...(caveat ? caveatFooter(caveat) : {}),
    width: 'container',
    height: 340,
    data: { values: distribution },
    layer: layers,
  }
}

/** S18, static condition. A fixed typical-renter against typical-owner comparison, no input. */
export function typicalRenterVsOwnerSpec(rows, { caveat } = {}) {
  return {
    ...BASE,
    ...(caveat ? caveatFooter(caveat) : {}),
    width: 'container',
    height: 300,
    data: { values: rows },
    mark: { type: 'bar', cornerRadiusEnd: 2, width: 100 },
    encoding: {
      x: { field: 'profile', type: 'nominal', title: null, axis: { labelAngle: 0 } },
      y: {
        field: 'median',
        type: 'quantitative',
        title: 'Median household total wealth',
        axis: { labelExpr: GBP },
      },
      color: { field: 'profile', type: 'nominal', scale: { range: palette.categorical }, legend: null },
      tooltip: [
        { field: 'profile', type: 'nominal', title: 'Typical household' },
        { field: 'median', type: 'quantitative', format: ',.0f', title: 'Median wealth (£)' },
      ],
    },
  }
}
