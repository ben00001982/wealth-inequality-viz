import { useMemo } from 'react'
import { AccessibleChart, describeStep } from './AccessibleChart.jsx'
import { fmtGBP, fmtNumber, fmtPercent } from './DataTable.jsx'
import { rowsOf } from '../hooks/useData.js'
import { itl1ByCode } from '../data/lookup.js'
import { palette } from '../theme.js'
import {
  affordabilitySpec,
  choroplethWithRankedBarSpec,
  housePricesSpec,
  localAuthorityIndexSpec,
  locatorDistributionSpec,
  missingTopSpec,
  tenureCompositionSpec,
  topShareTrendSpec,
  typicalRenterVsOwnerSpec,
  wealthByAgeFacetSpec,
  wealthByAgeSpec,
  wealthByDecileSpec,
  wealthByTenureSpec,
  wealthCompositionSpec,
} from '../vega/narrativeSpecs.js'
import { CAVEAT_SHORT } from '../data/narrative.js'

/**
 * The chart registry: one place that binds a narrative step to a spec, its data, and its accessible
 * table.
 *
 * A registry rather than a switch inside the section component, for two reasons. It keeps the
 * chart-to-message mapping in design spec B.5 auditable against the code in a single file, which is
 * what a marker or an examiner will want to check. And it means the sticky chart panel does not need
 * to know anything about any individual chart, so the narrative shell stays generic.
 *
 * The `staged` flag is the interactive condition's within-chart emphasis change (pattern A6). It
 * never adds data. Read the guard in each builder: `staged` only ever moves colour between
 * emphasis and muted.
 */
export function ChartForStep({ step, data, condition, reducedMotion, readerValue }) {
  const staged = condition === 'interactive' && !reducedMotion
  const caveat = step.caveat ? CAVEAT_SHORT : undefined

  const built = useMemo(
    () => buildChart(step, data, { staged, caveat, readerValue }),
    [step, data, staged, caveat, readerValue],
  )

  if (!built) return null

  return (
    <AccessibleChart
      spec={built.spec}
      title={built.title}
      description={describeStep(step)}
      tableRows={built.tableRows}
      tableColumns={built.tableColumns}
    />
  )
}

function buildChart(step, data, { staged, caveat, readerValue }) {
  switch (step.chart) {
    case 'wealthByDecile': {
      const rows = rowsOf(data.wealthByDecile)
      return {
        title: 'Share of all household wealth held by each tenth of households',
        spec: wealthByDecileSpec(rows, { staged, caveat }),
        tableRows: rows,
        tableColumns: [
          { key: 'decile', label: 'Decile (1 = least wealthy)' },
          { key: 'share', label: 'Share of all household wealth', format: fmtPercent },
          { key: 'threshold', label: 'Wealth at the top of this decile', format: fmtGBP },
        ],
      }
    }
    case 'topShareTrend': {
      const rows = rowsOf(data.topShareTrend)
      return {
        title:
          'Share of wealth held by the wealthiest tenth, and total household wealth as a multiple of national income',
        spec: topShareTrendSpec(rows, { caveat }),
        tableRows: rows,
        tableColumns: [
          { key: 'year', label: 'Year', format: (v) => String(v) },
          { key: 'topDecileShare', label: 'Share held by the top tenth', format: fmtPercent },
          {
            key: 'wealthToIncome',
            label: 'Total wealth as a multiple of national income',
            format: (v) => fmtNumber(v, 1),
          },
        ],
      }
    }
    case 'wealthComposition': {
      const rows = rowsOf(data.wealthComposition)
      return {
        title: 'Household wealth by component',
        spec: wealthCompositionSpec(rows, { caveat }),
        tableRows: rows,
        tableColumns: [
          { key: 'component', label: 'Component' },
          { key: 'share', label: 'Share of household wealth', format: fmtPercent },
        ],
      }
    }
    case 'tenureComposition': {
      const rows = rowsOf(data.tenureComposition)
      return {
        title: 'Housing tenure in England, 1995 to 2024',
        spec: tenureCompositionSpec(rows),
        tableRows: rows,
        tableColumns: [
          { key: 'year', label: 'Year', format: (v) => String(v) },
          { key: 'tenure', label: 'Tenure' },
          { key: 'share', label: 'Share of households', format: fmtPercent },
        ],
      }
    }
    case 'wealthByTenure': {
      const rows = rowsOf(data.medianWealthByTenure)
      return {
        title: 'Median household total wealth by tenure, at each survey wave',
        spec: wealthByTenureSpec(rows, { caveat }),
        tableRows: rows,
        tableColumns: [
          { key: 'wave', label: 'Survey wave' },
          { key: 'tenure', label: 'Tenure' },
          { key: 'median', label: 'Median household total wealth', format: fmtGBP },
        ],
      }
    }
    case 'housePrices': {
      const rows = rowsOf(data.housePrices)
      const annotations = rows.filter((r) => r.label)
      return {
        title: 'Average UK house price, 1995 onwards',
        spec: housePricesSpec(rows, { annotations }),
        tableRows: rows,
        tableColumns: [
          { key: 'year', label: 'Year', format: (v) => String(v) },
          { key: 'price', label: 'Average price', format: fmtGBP },
        ],
      }
    }
    case 'affordability': {
      const rows = rowsOf(data.affordability)
      return {
        title: 'House price to earnings ratio, England and Wales',
        spec: affordabilitySpec(rows),
        tableRows: rows,
        tableColumns: [
          { key: 'year', label: 'Year', format: (v) => String(v) },
          {
            key: 'ratio',
            label: 'Years of median earnings to buy a median home',
            format: (v) => fmtNumber(v, 1),
          },
        ],
      }
    }
    case 'wealthByAge': {
      const rows = rowsOf(data.medianWealthByAge).filter((r) => r.wave === 'latest')
      return {
        title: 'Median household total wealth by age band of household head',
        spec: wealthByAgeSpec(rows, { caveat, staged }),
        tableRows: rows,
        tableColumns: [
          { key: 'ageBand', label: 'Age band' },
          { key: 'median', label: 'Median household total wealth', format: fmtGBP },
        ],
      }
    }
    case 'wealthByAgeFacet': {
      const rows = rowsOf(data.medianWealthByAge).filter((r) => r.wave !== 'latest')
      return {
        title:
          'Median household total wealth by age band, compared between an earlier survey wave and the most recent one',
        spec: wealthByAgeFacetSpec(rows, { caveat }),
        tableRows: rows,
        tableColumns: [
          { key: 'wave', label: 'Survey wave' },
          { key: 'ageBand', label: 'Age band' },
          { key: 'median', label: 'Median household total wealth', format: fmtGBP },
        ],
      }
    }
    case 'regionalPricesMap': {
      const rows = rowsOf(data.regionalWealth).filter((r) => r.averagePrice != null)
      return {
        title: 'Average property value by area, mapped and ranked',
        spec: choroplethWithRankedBarSpec(data.regionalBoundaries, rows, {
          valueField: 'averagePrice',
          valueTitle: 'Average property value',
          ramp: palette.sequentialAlt,
        }),
        tableRows: rows.map((r) => ({ ...r, name: itl1ByCode[r.code]?.name ?? r.code })),
        tableColumns: [
          { key: 'name', label: 'Area' },
          { key: 'averagePrice', label: 'Average property value', format: fmtGBP },
        ],
      }
    }
    case 'localAuthorityIndex': {
      const rows = rowsOf(data.localAuthorityIndex)
      return {
        title:
          'Kensington and Chelsea and Blackpool property prices, indexed to a common base year of 100',
        spec: localAuthorityIndexSpec(rows),
        tableRows: rows,
        tableColumns: [
          { key: 'area', label: 'Local authority' },
          { key: 'year', label: 'Year', format: (v) => String(v) },
          { key: 'index', label: 'Index, base year = 100', format: (v) => fmtNumber(v, 0) },
        ],
      }
    }
    case 'regionalWealthMap': {
      const rows = rowsOf(data.regionalWealth)
      return {
        title: 'Median household total wealth by area, mapped and ranked',
        spec: choroplethWithRankedBarSpec(data.regionalBoundaries, rows, {
          valueField: 'median',
          valueTitle: 'Median household total wealth',
        }),
        tableRows: rows.map((r) => ({
          ...r,
          name: itl1ByCode[r.code]?.name ?? r.code,
          median: r.median,
        })),
        tableColumns: [
          { key: 'name', label: 'Area' },
          {
            key: 'median',
            label: 'Median household total wealth',
            format: (v) => (v == null ? 'No data: the survey covers Great Britain only' : fmtGBP(v)),
          },
        ],
      }
    }
    case 'missingTop': {
      const rows = rowsOf(data.missingTop)
      return {
        title: 'Household wealth observed in the survey, and the amount estimated to be missing',
        spec: missingTopSpec(rows),
        tableRows: rows,
        tableColumns: [
          { key: 'segment', label: 'Segment' },
          { key: 'amountBn', label: 'Amount, £bn', format: (v) => fmtNumber(v, 0) },
        ],
      }
    }
    case 'synthesisRecap': {
      // The recap reuses three charts already shown. Rendering them as one figure would need a
      // concat spec across three different data shapes; the shell renders them as three stacked
      // AccessibleCharts instead, which also keeps each one's table intact.
      return null
    }
    case 'locatorDistribution': {
      const rows = rowsOf(data.wealthDistribution)
      return {
        title: 'The household wealth distribution, with your position marked',
        spec: locatorDistributionSpec(rows, { readerValue, caveat }),
        tableRows: rows.filter((r) => r.percentile % 10 === 0),
        tableColumns: [
          { key: 'percentile', label: 'Percentile', format: (v) => String(v) },
          { key: 'wealth', label: 'Household total wealth at this percentile', format: fmtGBP },
        ],
      }
    }
    case 'typicalRenterVsOwner': {
      const rows = rowsOf(data.medianWealthByTenure)
        .filter((r) => r.wave === 'latest')
        .map((r) => ({ profile: r.tenure, median: r.median }))
      return {
        title: 'Median household total wealth for a typical renter and a typical owner',
        spec: typicalRenterVsOwnerSpec(rows, { caveat }),
        tableRows: rows,
        tableColumns: [
          { key: 'profile', label: 'Typical household' },
          { key: 'median', label: 'Median household total wealth', format: fmtGBP },
        ],
      }
    }
    default:
      return null
  }
}

/** The three anchor charts recapped at S17. */
export const SYNTHESIS_STEPS = ['S6', 'S10', 'S15']
