import { useMemo } from 'react'
import { Button, Label, Slider, SliderOutput, SliderThumb, SliderTrack } from 'react-aria-components'
import { AccessibleChart } from '../AccessibleChart.jsx'
import { MissingTopCaveat } from '../MissingTopCaveat.jsx'
import { compareProfilesSpec } from '../../vega/explorerSpecs.js'
import { rowsOf } from '../../hooks/useData.js'
import { AGE_BANDS, ITL1, TENURES, captionFor, lookupMedian, presets } from '../../data/lookup.js'
import { fmtGBP } from '../DataTable.jsx'

/**
 * E1.3 compare two profiles, E1.4 archetype presets, E1.5 the head-start offset.
 *
 * Three sub-capabilities on one screen because they are one interaction: configure two profiles, or
 * load a pair, and optionally add a starting-wealth offset to either.
 *
 * E1.3. Paired bars on a common scale so the reader reads the gap directly from length, which is the
 * accurate encoding for a comparison task (Cleveland and McGill, 1984). Region is chosen from a
 * list, not by dropping a pin: design spec B.8 flag 8 rules the pin variant out because it needs
 * geocoding the static stack does not have and, more importantly, implies a spatial precision the
 * regional data does not have.
 *
 * E1.4. The archetypes are not neutral samples. They encode the narrative and keep the framing
 * ethical, centring renters, younger cohorts and northern regions, which is the D'Ignazio and Klein
 * (2020) commitment made concrete. They also give a soft on-ramp: a reader who will configure
 * nothing still gets the contrast.
 *
 * E1.5. The offset is a reader-driven what-if and is labelled as one. It is a separate stacked
 * segment so the head start stays visually separable from the survey baseline, because the baseline
 * is a published median and the offset is not a data claim. Whether to source a data-derived default
 * inheritance distribution instead of a pure what-if is still open at design spec B.9.
 */
export function CompareProfiles({ state, dispatch, data, logger }) {
  const table = useMemo(() => rowsOf(data.wasLookup), [data.wasLookup])

  const resultA = useMemo(() => lookupMedian(table, state.compare.a), [table, state.compare.a])
  const resultB = useMemo(() => lookupMedian(table, state.compare.b), [table, state.compare.b])

  const cards = [
    {
      label: describeProfile(state.compare.a) || 'Profile A',
      median: resultA.median,
      headStart: state.compare.a.headStart ?? 0,
    },
    {
      label: describeProfile(state.compare.b) || 'Profile B',
      median: resultB.median,
      headStart: state.compare.b.headStart ?? 0,
    },
  ]

  const maxValue = Math.max(
    ...cards.map((c) => (c.median ?? 0) + (c.headStart ?? 0)),
    1,
  )

  const spec = useMemo(
    () => compareProfilesSpec(cards, { missingBandFrom: maxValue * 1.05, showMissingBand: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(cards), maxValue],
  )

  const gap =
    resultA.median != null && resultB.median != null
      ? Math.abs(resultA.median - resultB.median)
      : null
  const ratio =
    resultA.median && resultB.median
      ? Math.max(resultA.median, resultB.median) / Math.min(resultA.median, resultB.median)
      : null

  return (
    <div className="compare">
      <div className="compare__presets">
        <h3>Start from a ready-made pair</h3>
        <p className="compare__presets-note">
          Four contrasts drawn from the story you have just read. Load one, then change anything you
          like.
        </p>
        <div className="compare__preset-row">
          {presets.map((p) => (
            <Button
              key={p.id}
              className="button button--ghost"
              onPress={() => {
                dispatch({ type: 'LOAD_PRESET', preset: p })
                logger.controlInteraction('preset', { preset: p.id }, 'interactive-only')
              }}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="compare__cards">
        <ProfileCard
          card="a"
          title="Profile A"
          profile={state.compare.a}
          result={resultA}
          dispatch={dispatch}
          logger={logger}
        />
        <ProfileCard
          card="b"
          title="Profile B"
          profile={state.compare.b}
          result={resultB}
          dispatch={dispatch}
          logger={logger}
        />
      </div>

      <AccessibleChart
        spec={spec}
        title="Two profiles compared, with any reader-added head start shown as a separate segment"
        description={
          'A pair of bars on the same scale, one for each profile, showing the Wealth and Assets Survey ' +
          'median household total wealth for a group with those characteristics. Where a head start has ' +
          'been added with the slider, it appears as a second segment stacked on top of the survey ' +
          'median, so the added amount stays distinguishable from the published figure. A shaded band ' +
          'above the bars marks the wealth the survey cannot see; it is empty here, and the off-the-chart ' +
          'view fills it.'
        }
        tableRows={cards.map((c) => ({
          profile: c.label,
          median: c.median,
          headStart: c.headStart,
          total: (c.median ?? 0) + (c.headStart ?? 0),
        }))}
        tableColumns={[
          { key: 'profile', label: 'Profile' },
          { key: 'median', label: 'Survey median for this group', format: fmtGBP },
          { key: 'headStart', label: 'Reader-added head start', format: fmtGBP },
          { key: 'total', label: 'Total shown', format: fmtGBP },
        ]}
      />

      <div className="compare__readout" aria-live="polite">
        {gap != null ? (
          <p>
            The gap between these two groups is {fmtGBP(gap)}
            {ratio ? `, a ratio of about ${ratio.toFixed(1)} to 1` : ''}. Both figures are survey
            medians for the characteristic group, not predictions about individuals.
          </p>
        ) : (
          <p>Configure both profiles, or load a ready-made pair, to see the gap.</p>
        )}
      </div>

      <MissingTopCaveat variant="short" />
    </div>
  )
}

function ProfileCard({ card, title, profile, result, dispatch, logger }) {
  const set = (field, value) => {
    dispatch({ type: 'SET_COMPARE_FIELD', card, field, value })
    logger.controlInteraction('compare-field', { card, field }, 'interactive-only')
  }

  return (
    <fieldset className="profile-card">
      <legend>{title}</legend>

      <label className="profile-card__row">
        <span>Age band</span>
        <select
          value={profile.ageBand ?? ''}
          onChange={(e) => set('ageBand', e.target.value || null)}
        >
          <option value="">Any</option>
          {AGE_BANDS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>

      <label className="profile-card__row">
        <span>Tenure</span>
        <select value={profile.tenure ?? ''} onChange={(e) => set('tenure', e.target.value || null)}>
          <option value="">Any</option>
          {TENURES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="profile-card__row">
        <span>Area</span>
        <select value={profile.region ?? ''} onChange={(e) => set('region', e.target.value || null)}>
          <option value="">Any</option>
          {ITL1.filter((r) => r.wasCovered).map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      {/* E1.5. React-aria's Slider gives the keyboard model, the ARIA value semantics and the
          output association. The label states plainly that this is a what-if, because a slider
          beside two published medians could otherwise be read as data. */}
      <Slider
        className="slider"
        minValue={0}
        maxValue={200000}
        step={5000}
        value={profile.headStart ?? 0}
        onChange={(v) => set('headStart', v)}
      >
        <div className="slider__head">
          <Label>Add a head start (a gift or an inheritance)</Label>
          <SliderOutput className="slider__output">
            {({ state: s }) => fmtGBP(Number(s.values[0]))}
          </SliderOutput>
        </div>
        <SliderTrack className="slider__track">
          <SliderThumb className="slider__thumb" />
        </SliderTrack>
        <p className="slider__note">
          This is a what-if you are setting, not a figure from the data. It shows what a head start of
          that size would do to the starting position.
        </p>
      </Slider>

      <p className="profile-card__caption">{captionFor(result)}</p>
    </fieldset>
  )
}

function describeProfile(p) {
  const bits = []
  if (p.ageBand) bits.push(`age ${p.ageBand}`)
  if (p.tenure) bits.push(TENURES.find((t) => t.id === p.tenure)?.label ?? p.tenure)
  if (p.region) bits.push(ITL1.find((r) => r.code === p.region)?.name ?? p.region)
  return bits.join(', ')
}
