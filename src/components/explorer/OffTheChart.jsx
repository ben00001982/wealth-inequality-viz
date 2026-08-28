import { useMemo } from 'react'
import { Button } from 'react-aria-components'
import { AccessibleChart } from '../AccessibleChart.jsx'
import { MissingTopCaveat } from '../MissingTopCaveat.jsx'
import { offTheChartSpec, offTheChartSmallMultipleSpec } from '../../vega/explorerSpecs.js'
import { rowsOf } from '../../hooks/useData.js'
import { lookupMedian } from '../../data/lookup.js'
import { can } from '../../state/conditions.js'
import { fmtGBP } from '../DataTable.jsx'

/**
 * E7, "off the chart": the reader against the Rich List. The close of the whole piece.
 *
 * Design spec B.4.3. The view opens as an ordinary, readable, linear-axis chart: the reader's own
 * typical wealth beside the UK median household and the top-10% threshold. A zoom-out control
 * rescales the axis domain by roughly an order of magnitude per step. The reader's bar shrinks;
 * annotations track the climb past the top 1%, then past the survey ceiling into the shaded band the
 * survey cannot see, and only then does the Rich List entry threshold appear, then the largest
 * fortune. By the final frame the reader's bar, and even a wealthy owner's bar, is sub-pixel.
 *
 * Why stepped rather than continuous. A single chart across this range forces a bad choice: a linear
 * axis makes the reader invisible next to a billionaire, and a log axis makes everything visible but
 * misleads a lay audience about magnitude. The stepped zoom-out keeps every individual frame linear
 * and truthful while the sequence delivers the full range. True continuous scroll-to-scale is not
 * feasible in this stack (design spec B.8 flag 6), and that is stated in the report rather than
 * quietly worked around.
 *
 * Honesty about the Rich List itself. It is a journalistic estimate that undercounts hidden, offshore
 * and trust-held wealth, so it is annotated as a sourced lower bound on top concentration, not as an
 * authority. No individual is ever named: only published aggregates are used, which is design spec
 * B.8 flag 9. The same lesson as the £800bn missing from the survey, seen from the other side.
 *
 * PARITY. The static condition gets the same frames as a small multiple. This is not a courtesy: if
 * the Rich List anchor appeared only in the interactive arm, the interactive arm would carry a fact
 * the static arm never sees, and the study would be measuring content rather than interactivity.
 * Design spec B.6 names this as the artefact-level confound control, and the P5 comprehension
 * instrument has one item that must be dropped if this small multiple is not built.
 */
export function OffTheChart({ state, dispatch, data, logger }) {
  const table = useMemo(() => rowsOf(data.wasLookup), [data.wasLookup])
  const rich = data.richList?.rows?.[0] ?? data.richList ?? {}
  const distribution = rowsOf(data.wealthDistribution)

  const readerProfile = state.compare.a.tenure ? state.compare.a : state.profile
  const reader = useMemo(() => lookupMedian(table, readerProfile), [table, readerProfile])

  const ukMedian = useMemo(() => {
    const p50 = distribution.find((d) => d.percentile === 50)
    return p50?.wealth ?? null
  }, [distribution])

  const topDecileFloor = useMemo(() => {
    const p90 = distribution.find((d) => d.percentile === 90)
    return p90?.wealth ?? null
  }, [distribution])

  const topPercentFloor = useMemo(() => {
    const p99 = distribution.find((d) => d.percentile === 99)
    return p99?.wealth ?? null
  }, [distribution])

  const frames = useMemo(
    () =>
      buildFrames({
        readerValue: reader.median,
        ukMedian,
        topDecileFloor,
        topPercentFloor,
        entryThreshold: rich.entryThresholdGBP ?? null,
        largestFortune: rich.largestFortuneGBP ?? null,
      }),
    [reader.median, ukMedian, topDecileFloor, topPercentFloor, rich],
  )

  const interactive = can(state.condition, 'offTheChartInteractive')
  const step = Math.min(state.zoomStep, frames.length - 1)
  const frame = frames[step]

  const ratioText = useMemo(() => {
    if (!rich.entryThresholdGBP || !ukMedian) return null
    const n = Math.round(rich.entryThresholdGBP / ukMedian)
    return `It would take roughly ${n.toLocaleString('en-GB')} median households stacked together to equal the smallest Rich List fortune.`
  }, [rich.entryThresholdGBP, ukMedian])

  if (!interactive) {
    // Static condition: the same frames, side by side.
    const flat = frames.flatMap((f, i) =>
      f.bars.map((b) => ({ ...b, frame: i, frameLabel: f.label })),
    )
    return (
      <div className="off-chart">
        <h3>Off the chart</h3>
        <p>{frames[frames.length - 1].caption}</p>
        <AccessibleChart
          spec={offTheChartSmallMultipleSpec(flat)}
          title="The same comparison at five successively larger scales"
          description={describeFrames(frames, ratioText)}
          tableRows={flat}
          tableColumns={[
            { key: 'frameLabel', label: 'Scale' },
            { key: 'label', label: 'Compared with' },
            { key: 'value', label: 'Wealth', format: fmtGBP },
          ]}
        />
        <RichListNote rich={rich} />
        <MissingTopCaveat variant="full" />
      </div>
    )
  }

  return (
    <div className="off-chart">
      <h3>Off the chart</h3>
      <p className="off-chart__caption" aria-live="polite">
        {frame.caption}
      </p>

      <AccessibleChart
        spec={offTheChartSpec(frame.bars, {
          domainMax: frame.domainMax,
          missingBand: frame.missingBand,
          ratioReadout: step >= 3 ? ratioText : null,
        })}
        title={`Wealth comparison at scale step ${step + 1} of ${frames.length}: ${frame.label}`}
        description={frame.description}
        tableRows={frame.bars}
        tableColumns={[
          { key: 'label', label: 'Compared with' },
          { key: 'value', label: 'Wealth', format: fmtGBP },
        ]}
      />

      {/* The stepper is the whole interaction, so it is a pair of real buttons with a live
          position readout, fully keyboard operable, and not a scroll-driven effect. */}
      <div className="off-chart__stepper" role="group" aria-label="Change the scale">
        <Button
          className="button"
          isDisabled={step === 0}
          onPress={() => {
            dispatch({ type: 'SET_ZOOM_STEP', step: Math.max(0, step - 1) })
            logger.controlInteraction('zoom-out-step', { direction: 'in', to: step - 1 }, 'interactive-only')
          }}
        >
          Zoom back in
        </Button>
        <span className="off-chart__position">
          Scale {step + 1} of {frames.length}
        </span>
        <Button
          className="button button--primary"
          isDisabled={step === frames.length - 1}
          onPress={() => {
            dispatch({ type: 'SET_ZOOM_STEP', step: Math.min(frames.length - 1, step + 1) })
            logger.controlInteraction('zoom-out-step', { direction: 'out', to: step + 1 }, 'interactive-only')
          }}
        >
          Zoom out
        </Button>
      </div>

      {step >= 3 && ratioText && <p className="off-chart__ratio">{ratioText}</p>}

      <RichListNote rich={rich} />
      <MissingTopCaveat variant="full" />
    </div>
  )
}

/**
 * The frame sequence. Each frame is a linear-axis chart with its own domain, roughly an order of
 * magnitude apart, and each adds one comparator rather than all of them at once. Frames are built
 * only from values that exist: a null comparator drops out rather than being filled in.
 */
function buildFrames({
  readerValue,
  ukMedian,
  topDecileFloor,
  topPercentFloor,
  entryThreshold,
  largestFortune,
}) {
  const you = readerValue ?? ukMedian ?? 0
  const frames = []

  const push = (label, bars, domainMax, caption, description, missingBand = null) => {
    frames.push({
      label,
      bars: bars.filter((b) => b.value != null),
      domainMax,
      caption,
      description,
      missingBand,
    })
  }

  push(
    'Households like yours',
    [
      { label: 'A household like yours', value: you, kind: 'you' },
      { label: 'The UK median household', value: ukMedian, kind: 'household' },
    ],
    Math.max(you, ukMedian ?? 0) * 1.3 || 1,
    'Start here. Your position beside the middle of the country. This is a scale you can read.',
    'A bar chart with two bars on a linear scale: a household like yours, and the median United Kingdom household. Both are readable at this scale.',
  )

  push(
    'The top tenth',
    [
      { label: 'A household like yours', value: you, kind: 'you' },
      { label: 'The UK median household', value: ukMedian, kind: 'household' },
      { label: 'Entry to the wealthiest tenth', value: topDecileFloor, kind: 'threshold' },
    ],
    (topDecileFloor ?? you) * 1.25 || 1,
    'Now add the threshold for the wealthiest tenth. The first two bars have already shrunk.',
    'The same two bars with a third added for the wealth needed to enter the wealthiest tenth of households. The axis has been rescaled, so the first two bars are shorter than before.',
  )

  push(
    'The top one per cent',
    [
      { label: 'A household like yours', value: you, kind: 'you' },
      { label: 'Entry to the wealthiest tenth', value: topDecileFloor, kind: 'threshold' },
      { label: 'Entry to the wealthiest one per cent', value: topPercentFloor, kind: 'threshold' },
    ],
    (topPercentFloor ?? topDecileFloor ?? you) * 1.25 || 1,
    'The top one per cent. Your bar is becoming hard to see, and we have not left the survey yet.',
    'The same comparison rescaled again to include the threshold for the wealthiest one per cent of households. The reader bar is now a small fraction of the tallest bar.',
  )

  const surveyCeiling = (topPercentFloor ?? 0) * 4 || 1
  push(
    'Past what the survey can see',
    [
      { label: 'A household like yours', value: you, kind: 'you' },
      { label: 'Entry to the wealthiest one per cent', value: topPercentFloor, kind: 'threshold' },
      { label: 'Entry to the Rich List', value: entryThreshold, kind: 'richlist' },
    ],
    (entryThreshold ?? surveyCeiling) * 1.2 || 1,
    'Here the survey runs out. The shaded band is the wealth it cannot see, and the Rich List entry threshold sits above it.',
    'The comparison rescaled to include the entry threshold for the Sunday Times Rich List. A shaded band marks the wealth estimated to be missing from the survey. The reader bar is close to invisible at this scale.',
    { from: surveyCeiling, to: (entryThreshold ?? surveyCeiling) * 0.98 },
  )

  push(
    'The largest single fortune',
    [
      { label: 'A household like yours', value: you, kind: 'you' },
      { label: 'Entry to the Rich List', value: entryThreshold, kind: 'richlist' },
      { label: 'The largest single fortune on the list', value: largestFortune, kind: 'richlist' },
    ],
    (largestFortune ?? entryThreshold ?? 1) * 1.1,
    'The last frame. Your bar, and a wealthy owner’s bar, are now smaller than a pixel. The distance from comfortable to the Rich List dwarfs the whole poor-to-comfortable gap this piece was about.',
    'The final scale, including the largest single fortune on the Rich List. The reader bar and the Rich List entry threshold are both negligible against it.',
    { from: surveyCeiling, to: (entryThreshold ?? surveyCeiling) * 0.98 },
  )

  return frames
}

function describeFrames(frames, ratioText) {
  return (
    'Five small charts, each the same comparison drawn at a successively larger scale, roughly an ' +
    'order of magnitude apart. ' +
    frames.map((f, i) => `Scale ${i + 1}, ${f.label}: ${f.caption}`).join(' ') +
    (ratioText ? ` ${ratioText}` : '')
  )
}

function RichListNote({ rich }) {
  return (
    <aside className="caveat" aria-label="About the Rich List figures">
      <p className="caveat__text">
        The Rich List figures are published aggregates from the{' '}
        {rich.edition ? `${rich.edition} edition` : 'most recent edition'} and no individual is named
        here. The list is a journalistic estimate that undercounts hidden, offshore and trust-held
        wealth, so it is used as a sourced lower bound on top concentration rather than as an
        authority. That is the same lesson as the wealth missing from the survey, seen from the other
        side: even the most visible measure of top wealth is an undercount.
      </p>
    </aside>
  )
}
