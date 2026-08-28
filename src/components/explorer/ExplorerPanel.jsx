import { useEffect, useMemo } from 'react'
import { Button } from 'react-aria-components'
import { EXPLORER_VIEW } from '../../state/appReducer.js'
import { AccessibleChart } from '../AccessibleChart.jsx'
import { MissingTopCaveat } from '../MissingTopCaveat.jsx'
import { crossFilterSpec } from '../../vega/explorerSpecs.js'
import { locatorDistributionSpec } from '../../vega/narrativeSpecs.js'
import { rowsOf } from '../../hooks/useData.js'
import { AGE_BANDS, ITL1, TENURES, captionFor, itl1ByCode, lookupMedian } from '../../data/lookup.js'
import { fmtGBP } from '../DataTable.jsx'
import { CompareProfiles } from './CompareProfiles.jsx'
import { TimingWhatIf } from './TimingWhatIf.jsx'
import { OffTheChart } from './OffTheChart.jsx'
import { CAVEAT_SHORT } from '../../data/narrative.js'

/**
 * The explorer bowl. Interactive condition only.
 *
 * Design spec B.4.4 sets the flow: The Explorer (E1) then E5 then E7, with E7 as the close. The bowl
 * is therefore *lightly re-guided*, which is a legitimate scaffolded-exploration variant of the
 * martini glass (Riche et al., 2018): it gives a consistent path through the views, which matters for
 * study comparability, while free exploration remains available inside E1.
 *
 * Every sub-capability is a layout mode over one data engine, not a separate artefact. That is why
 * they share `state.selection` and `state.compare` rather than holding their own state, and it is why
 * culling one at the prototype checkpoint costs nothing structural.
 */

const VIEWS = [
  { id: EXPLORER_VIEW.CROSS_FILTER, label: 'Cut the data', sub: 'E1.1 and E1.2' },
  { id: EXPLORER_VIEW.COMPARE, label: 'Compare two people', sub: 'E1.3 to E1.5' },
  { id: EXPLORER_VIEW.TIMING, label: 'Same person, different decade', sub: 'E5' },
  { id: EXPLORER_VIEW.OFF_THE_CHART, label: 'Off the chart', sub: 'E7' },
]

export function ExplorerPanel({ state, dispatch, data, logger }) {
  const { explorerView } = state

  // Persist the explorer state so a returning reader finds it where they left it. Design spec B.4.1
  // asks for this explicitly. Condition is never persisted: see the RESTORE case in appReducer.
  useEffect(() => {
    logger.saveExplorerState({
      selection: state.selection,
      compare: state.compare,
      explorerView: state.explorerView,
      timingWave: state.timingWave,
    })
  }, [state.selection, state.compare, state.explorerView, state.timingWave, logger])

  return (
    <section className="explorer" aria-label="Explore the data yourself">
      <header className="explorer__header">
        <h2>Now it is yours</h2>
        <p>
          Everything below is the same data you have just read. Nothing new is introduced here: you
          are re-cutting the same published figures, and every value is a survey median for a group
          of people, not a prediction about anybody.
        </p>
      </header>

      <nav className="explorer__tabs" aria-label="Explorer views">
        {VIEWS.map((v) => (
          <Button
            key={v.id}
            className={`tab ${explorerView === v.id ? 'is-current' : ''}`}
            aria-current={explorerView === v.id ? 'true' : undefined}
            onPress={() => {
              dispatch({ type: 'SET_EXPLORER_VIEW', view: v.id })
              logger.explorerEntered(v.id)
            }}
          >
            <span className="tab__label">{v.label}</span>
            <span className="tab__sub">{v.sub}</span>
          </Button>
        ))}
      </nav>

      <div className="explorer__view">
        {explorerView === EXPLORER_VIEW.CROSS_FILTER && (
          <CrossFilterView state={state} dispatch={dispatch} data={data} logger={logger} />
        )}
        {explorerView === EXPLORER_VIEW.COMPARE && (
          <CompareProfiles state={state} dispatch={dispatch} data={data} logger={logger} />
        )}
        {explorerView === EXPLORER_VIEW.TIMING && (
          <TimingWhatIf state={state} dispatch={dispatch} data={data} logger={logger} />
        )}
        {explorerView === EXPLORER_VIEW.OFF_THE_CHART && (
          <OffTheChart state={state} dispatch={dispatch} data={data} logger={logger} />
        )}
      </div>
    </section>
  )
}

/**
 * E1.1 coordinated cross-filter views, with E1.2 locate-yourself layered underneath.
 *
 * Three linked panels over one shared selection: median wealth by age band, median wealth by tenure,
 * and a choropleth paired with a ranked bar. The reset control is visible rather than hidden, because
 * a cross-filter with no obvious way back is a trap (Nielsen's user control and freedom).
 *
 * Selection is held in the reducer and the chart reads it, rather than living inside a Vega selection
 * parameter. Two consequences follow, and both are deliberate. The chip controls beneath the chart are
 * the selection interface, so everything available by mouse is available by keyboard, which is what
 * makes the interaction operable at all: Vega marks are not focusable controls and dressing them up as
 * a listbox would be a poor imitation of one. And the telemetry sees every selection, because they all
 * route through one dispatch.
 *
 * See the comment at the head of crossFilterSpec for why the panels show marginals with the selection
 * highlighted rather than genuinely re-filtering one another. That is a property of the published data,
 * not of the code.
 */
function CrossFilterView({ state, dispatch, data, logger }) {
  const lookupTable = useMemo(() => rowsOf(data.wasLookup), [data.wasLookup])

  /*
   * Each panel shows its own dimension's marginal, and the current selection is highlighted rather
   * than used to re-filter the other panels' values. That is not a shortcut: it is the honest
   * behaviour given the data that exists.
   *
   * ONS does not publish the three-way age-by-tenure-by-region cross-tabulation (see build_lookup()
   * in scripts/clean_was.py). With marginals only, a genuine cross-filter would return the same
   * degraded value for every category in a panel, because the lookup drops dimensions until it finds
   * a published cell. Three panels of identical bars would look broken and, worse, would imply the
   * data supports a cut it does not.
   *
   * So the panels show what is published and the selection highlights it, while the readout beneath
   * reports the combined lookup together with the caption naming exactly which dimensions had to be
   * dropped to answer it. If the WAS microdata is later obtained through the UK Data Service and the
   * real cross-tab is computed, these three memos become true cross-filters and nothing else changes.
   */
  const byAge = useMemo(
    () =>
      AGE_BANDS.map((ageBand) => {
        const r = lookupMedian(lookupTable, { ageBand })
        return {
          ageBand,
          median: r.median,
          sampleSize: r.sampleSize,
          selected: state.selection.ageBand === ageBand,
        }
      }).filter((d) => d.median != null),
    [lookupTable, state.selection.ageBand],
  )

  const byTenure = useMemo(
    () =>
      TENURES.map((t) => {
        const r = lookupMedian(lookupTable, { tenure: t.id })
        return {
          tenure: t.label,
          tenureId: t.id,
          median: r.median,
          sampleSize: r.sampleSize,
          selected: state.selection.tenure === t.id,
        }
      }).filter((d) => d.median != null),
    [lookupTable, state.selection.tenure],
  )

  const byRegion = useMemo(
    () =>
      ITL1.filter((r) => r.wasCovered)
        .map((r) => {
          const res = lookupMedian(lookupTable, { region: r.code })
          return {
            code: r.code,
            median: res.median,
            sampleSize: res.sampleSize,
            selected: state.selection.region === r.code,
          }
        })
        .filter((d) => d.median != null),
    [lookupTable, state.selection.region],
  )

  const current = useMemo(() => lookupMedian(lookupTable, state.selection), [lookupTable, state.selection])
  const distribution = rowsOf(data.wealthDistribution)

  const spec = useMemo(
    () =>
      crossFilterSpec({
        byAge,
        byTenure,
        byRegion,
        boundaries: data.regionalBoundaries,
        selectedRegion: state.selection.region,
      }),
    [byAge, byTenure, byRegion, data.regionalBoundaries, state.selection.region],
  )

  const anySelected = Boolean(state.selection.ageBand || state.selection.tenure || state.selection.region)

  return (
    <div className="cross-filter">
      <FilterControls state={state} dispatch={dispatch} logger={logger} />

      <AccessibleChart
        spec={spec}
        title="Median household total wealth by age band, by tenure and by area, cross-filtered"
        description={
          'Three linked panels showing median household total wealth: by age band, by tenure, and by ' +
          'area both as a map and as a ranked bar chart. Choosing a value in any of the controls above ' +
          'filters all four panels to that group. The figures are Wealth and Assets Survey medians and ' +
          'are conservative lower bounds. Northern Ireland carries no value because the survey covers ' +
          'Great Britain only.'
        }
        tableRows={byRegion.map((r) => ({ area: itl1ByCode[r.code]?.name ?? r.code, median: r.median }))}
        tableColumns={[
          { key: 'area', label: 'Area' },
          { key: 'median', label: 'Median household total wealth', format: fmtGBP },
        ]}
      />

      <div className="cross-filter__readout" aria-live="polite">
        {anySelected ? (
          <>
            <p className="cross-filter__value">
              {current.median != null
                ? `Selected group: ${fmtGBP(current.median)}`
                : 'The survey cannot report a figure for that combination.'}
            </p>
            <p className="cross-filter__caption">{captionFor(current)}</p>
          </>
        ) : (
          <p className="cross-filter__caption">
            No filter set, so every panel shows all households. Choose an age band, a tenure or an
            area to narrow it.
          </p>
        )}
      </div>

      {/* E1.2 locate yourself: the same distribution as S18, with the reader's position marked. */}
      <div className="locate-yourself">
        <h3>Where that sits in the whole distribution</h3>
        <AccessibleChart
          spec={locatorDistributionSpec(distribution, {
            readerValue: current.median,
            readerLabel: 'The group you selected',
            caveat: CAVEAT_SHORT,
          })}
          title="The household wealth distribution, with the selected group marked"
          description={
            'A chart of household total wealth at each percentile of the distribution, from the least ' +
            'wealthy on the left to the most wealthy on the right, with a horizontal marker at the ' +
            'median wealth of the group currently selected. It shows where that group sits relative to ' +
            'everybody else.'
          }
          tableRows={distribution.filter((d) => d.percentile % 10 === 0)}
          tableColumns={[
            { key: 'percentile', label: 'Percentile', format: (v) => String(v) },
            { key: 'wealth', label: 'Household total wealth', format: fmtGBP },
          ]}
        />
      </div>

      <MissingTopCaveat variant="short" />
    </div>
  )
}

/**
 * The accessible, keyboard-operable path to the cross-filter state.
 *
 * Also the details-on-demand affordance and the reset. Grouped in a fieldset with a legend so a
 * screen-reader user hears what the group of controls is for, which is 1.3.1 information and
 * relationships rather than a nicety.
 */
function FilterControls({ state, dispatch, logger }) {
  const set = (field, value) => {
    dispatch({ type: 'SET_SELECTION', field, value })
    logger.controlInteraction('cross-filter', { field, value }, 'interactive-only')
  }

  return (
    <fieldset className="filters">
      <legend>Filter every panel below</legend>

      <ChipGroup
        label="Age band"
        options={AGE_BANDS.map((b) => ({ id: b, label: b }))}
        value={state.selection.ageBand}
        onChange={(v) => set('ageBand', v)}
      />
      <ChipGroup
        label="Tenure"
        options={TENURES.map((t) => ({ id: t.id, label: t.label }))}
        value={state.selection.tenure}
        onChange={(v) => set('tenure', v)}
      />
      <ChipGroup
        label="Area"
        options={ITL1.filter((r) => r.wasCovered).map((r) => ({ id: r.code, label: r.name }))}
        value={state.selection.region}
        onChange={(v) => set('region', v)}
      />

      <Button
        className="button button--ghost"
        onPress={() => {
          dispatch({ type: 'CLEAR_SELECTION' })
          logger.controlInteraction('cross-filter-reset', {}, 'interactive-only')
        }}
      >
        Clear all filters
      </Button>
    </fieldset>
  )
}

/**
 * A single-select chip group as real toggle buttons.
 *
 * `aria-pressed` rather than a radio group, because these are filters that can be cleared by
 * pressing the active one again, which is toggle semantics rather than radio semantics. Native
 * buttons, so keyboard operation and focus come for free and there is nothing to reimplement.
 */
function ChipGroup({ label, options, value, onChange }) {
  const groupId = `chips-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="chips" role="group" aria-labelledby={groupId}>
      <span className="chips__label" id={groupId}>
        {label}
      </span>
      <div className="chips__row">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`chip ${value === o.id ? 'is-on' : ''}`}
            aria-pressed={value === o.id}
            onClick={() => onChange(value === o.id ? null : o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
