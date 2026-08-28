import { useMemo } from 'react'
import { Button } from 'react-aria-components'
import { AccessibleChart } from '../AccessibleChart.jsx'
import { MissingTopCaveat } from '../MissingTopCaveat.jsx'
import { timingWhatIfSpec } from '../../vega/explorerSpecs.js'
import { rowsOf } from '../../hooks/useData.js'
import { TENURES, ITL1, lookupMedian } from '../../data/lookup.js'
import { can } from '../../state/conditions.js'
import { fmtGBP } from '../DataTable.jsx'

/**
 * E5, "same characteristics, different survey wave".
 *
 * REDEFINED, and the redefinition is worth stating in full because it is the one place where P4 data
 * verification forced a design change rather than a value change.
 *
 * The frozen spec (design spec B.4.2) asked for a market-entry-decade slider: hold a profile
 * constant and slide the decade in which that household entered the housing market. The P4
 * verification pass established that the Wealth and Assets Survey carries no market-entry-decade
 * variable. Building the slider would therefore mean deriving an entry decade from something else,
 * which is exactly the invention the brief forbids.
 *
 * The lever becomes the survey wave. Hold age band, tenure and region constant and move through the
 * waves the survey actually ran. It answers the same question the design was reaching for, "how much
 * does when you did this matter?", from data that exists. The encoding is unchanged, which is why
 * this is a redefinition and not a redesign, and it is recorded as revision r2.6 pending Ben's
 * sign-off.
 *
 * The honest caveat, which is on screen and not only in the code: comparing waves is not the same as
 * following one household through time. The survey is a repeated cross-section here, so this shows
 * how a group with these characteristics looked at different points, not how any household's own
 * wealth moved.
 */
export function TimingWhatIf({ state, dispatch, data, logger }) {
  const table = useMemo(() => rowsOf(data.wasLookup), [data.wasLookup])
  const waves = useMemo(() => {
    const set = new Set(table.map((r) => r.wave).filter(Boolean))
    return Array.from(set).sort()
  }, [table])

  const profile = state.compare.a.tenure || state.profile.tenure ? state.compare.a : state.profile

  const series = useMemo(
    () =>
      waves.map((wave) => {
        const r = lookupMedian(
          table.filter((row) => row.wave === wave),
          profile,
        )
        return {
          wave,
          median: r.median,
          profile: describe(profile),
          sampleSize: r.sampleSize,
        }
      }),
    [waves, table, profile],
  )

  const withData = series.filter((s) => s.median != null)
  const first = withData[0]
  const last = withData[withData.length - 1]

  const spec = useMemo(
    () => timingWhatIfSpec(withData, { highlightWave: state.timingWave }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(withData), state.timingWave],
  )

  return (
    <div className="timing">
      <h3>Same characteristics, different survey wave</h3>
      <p className="timing__note">
        This holds the profile fixed and moves through the survey waves. It is not the same as
        following one household through time: the survey interviews a fresh sample each wave, so what
        you are seeing is how a group like this looked at different points, not how anybody&rsquo;s own
        wealth moved.
      </p>

      {/* The static condition gets the same series without the highlight control: the waves side by
          side are the static small-multiple equivalent design spec B.6 requires, so both arms see
          the same figures and only the interaction differs. */}
      <div
        className="timing__waves"
        role="group"
        aria-label="Highlight a survey wave"
        hidden={!can(state.condition, 'timingInteractive')}
      >
        {withData.map((s) => (
          <Button
            key={s.wave}
            className={`chip ${state.timingWave === s.wave ? 'is-on' : ''}`}
            onPress={() => {
              dispatch({ type: 'SET_TIMING_WAVE', wave: state.timingWave === s.wave ? null : s.wave })
              logger.controlInteraction('timing-wave', { wave: s.wave }, 'interactive-only')
            }}
          >
            {s.wave}
          </Button>
        ))}
      </div>

      <AccessibleChart
        spec={spec}
        title="Median household total wealth for a fixed profile, across survey waves"
        description={
          'A line chart with one point per Wealth and Assets Survey wave, showing the median household ' +
          'total wealth for households matching the selected age band, tenure and area. The horizontal ' +
          'axis is the survey wave in order; the vertical axis is median wealth in pounds. Each wave is ' +
          'a separate sample, so the line shows how a group with these characteristics compared across ' +
          'waves rather than how any one household changed.'
        }
        tableRows={withData}
        tableColumns={[
          { key: 'wave', label: 'Survey wave' },
          { key: 'median', label: 'Median household total wealth', format: fmtGBP },
          { key: 'sampleSize', label: 'Households in the survey cell', format: (v) => String(v ?? '') },
        ]}
      />

      {first && last && (
        <p className="timing__readout" aria-live="polite">
          For this profile the median went from {fmtGBP(first.median)} in {first.wave} to{' '}
          {fmtGBP(last.median)} in {last.wave}.
        </p>
      )}

      <MissingTopCaveat variant="short" />
    </div>
  )
}

function describe(p) {
  const bits = []
  if (p.ageBand) bits.push(`age ${p.ageBand}`)
  if (p.tenure) bits.push(TENURES.find((t) => t.id === p.tenure)?.label ?? p.tenure)
  if (p.region) bits.push(ITL1.find((r) => r.code === p.region)?.name ?? p.region)
  return bits.length ? bits.join(', ') : 'All households'
}
