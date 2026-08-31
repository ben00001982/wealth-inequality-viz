import { useEffect, useMemo, useReducer, useState } from 'react'
import { appReducer, initialState, PHASE } from './state/appReducer.js'
import { can, readCondition, readStudyParams } from './state/conditions.js'
import { useData, rowsOf } from './hooks/useData.js'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion.js'
import { useSessionLogger } from './hooks/useSessionLogger.js'
import { lookupMedian } from './data/lookup.js'
import { NarrativeShell } from './components/NarrativeShell.jsx'
import { ExplorerPanel } from './components/explorer/ExplorerPanel.jsx'
import { TimingWhatIf } from './components/explorer/TimingWhatIf.jsx'
import { OffTheChart } from './components/explorer/OffTheChart.jsx'
import { SyntheticDataBanner } from './components/SyntheticDataBanner.jsx'
import { SkipLinks } from './components/SkipLinks.jsx'
import { StudyBar } from './components/study/StudyBar.jsx'
import { ReturnPanel } from './components/study/ReturnPanel.jsx'
import { Sources } from './components/Sources.jsx'

/**
 * The application root.
 *
 * Reads the condition, loads the data, builds the state machine and the logger, and then renders one
 * of two arrangements from the same component tree:
 *
 *   static       narrative S0 to S18 (S18 with no input), then the static equivalents of E5 and E7
 *   interactive  narrative S0 to S18 (S18 with inputs), then the explorer: E1, E5, E7
 *
 * The point of building both arms from one tree, rather than two apps or a branch at the top, is
 * that content parity becomes a property of the code rather than a promise in a document. Every
 * chart, every annotation and the whole accessibility layer are shared imports. What differs is
 * gated through `can(condition, capability)`, which reads from the single capability table in
 * src/state/conditions.js transcribed from design spec B.6.
 */
export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const reducedMotion = usePrefersReducedMotion()
  const { status, data, error, synthetic, mixed } = useData()

  /*
   * Condition and participant code are read once, synchronously, before anything can be logged.
   *
   * useState with an initialiser rather than useEffect, because both values are stripped from the
   * address bar as they are read, and an effect runs after the first render: the logger would already
   * have mounted without a participant code and decided it was inert.
   */
  const [studyParams] = useState(() => {
    const { condition, parameterValid, parameterPresent } = readCondition()
    const { participantCode, pidRejected, returnUrl, codeRecovered } = readStudyParams()
    /*
     * A participant code is honoured only alongside an explicit, valid condition parameter.
     *
     * Two failure modes, one rule. A malformed condition ('?condition=bogus') would fall back to the
     * default arm, and a missing one ('?pid=X' alone) would do the same, so either way the session
     * would be recorded in an arm nobody allocated it to, silently and always the same arm. That is
     * allocation bias with no trace in the data.
     *
     * A legitimate study link, generated from the block-randomised list, always carries both. So a
     * code arriving without a valid condition is a truncated or hand-edited link, and the honest
     * response is to record nothing and show the participant that the link is incomplete. Losing one
     * session to a bad link is recoverable; a quietly mis-allocated arm is not.
     */
    // A recovered code is exempt from the explicit-condition test: it belongs to a session that
    // already passed it, and the URL it was allocated by has since been stripped. Requiring the
    // parameter again here would strand exactly the reloading participant this recovery exists for.
    const conditionTrustworthy = codeRecovered || (parameterPresent && parameterValid)
    return {
      condition,
      participantCode: conditionTrustworthy ? participantCode : null,
      pidRejected: pidRejected || (participantCode && !conditionTrustworthy),
      returnUrl,
      codeRecovered,
    }
  })

  useEffect(() => {
    dispatch({ type: 'SET_CONDITION', condition: studyParams.condition })
  }, [studyParams.condition])

  useEffect(() => {
    dispatch({ type: 'SET_REDUCED_MOTION', value: reducedMotion })
  }, [reducedMotion])

  useEffect(() => {
    if (synthetic != null) dispatch({ type: 'SET_DATA_PROVENANCE', isSynthetic: synthetic })
  }, [synthetic])

  const logger = useSessionLogger({
    condition: state.condition,
    reducedMotion,
    participantCode: studyParams.participantCode,
    enabled: status === 'ready',
  })

  /*
   * The close, E7, is the last thing either arm shows, and reaching it is the exposure floor.
   *
   * Recorded from both arms: the interactive arm when the E7 view is opened, the static arm when the
   * coda renders, because in the static arm E7 is a small multiple with no view to open. Scope is
   * 'both' inside the logger, so the floor is applicable to either.
   */
  useEffect(() => {
    if (status !== 'ready') return
    const interactive = can(state.condition, 'explorer')
    const reachedClose = interactive
      ? state.explorerView === 'E7' && state.phase === PHASE.EXPLORER
      : state.visitedSteps.includes('S18')
    if (reachedClose && !state.milestones.sawClose) {
      dispatch({ type: 'REACH_MILESTONE', milestone: 'sawClose' })
      logger.sawClose()
    }
    if (interactive && state.phase === PHASE.EXPLORER && !state.milestones.enteredExplorer) {
      dispatch({ type: 'REACH_MILESTONE', milestone: 'enteredExplorer' })
    }
  }, [
    status,
    state.condition,
    state.explorerView,
    state.phase,
    state.visitedSteps,
    state.milestones,
    logger,
  ])

  // The reader's own value, threaded to S18 and to E7 so the same number appears in both. Computed
  // here rather than in each view so there is one lookup and no chance of two views disagreeing.
  const readerValue = useMemo(() => {
    if (status !== 'ready') return null
    const table = rowsOf(data.wasLookup)
    const complete = state.profile.ageBand && state.profile.tenure && state.profile.region
    if (!complete) return null
    return lookupMedian(table, state.profile).median
  }, [status, data, state.profile])

  if (status === 'loading') {
    return (
      <main className="app app--loading">
        <p>Loading the data.</p>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="app app--error">
        <h1>The data did not load</h1>
        <p>
          The charts on this page are built from JSON files served alongside it, and one of them could
          not be fetched. If you are running this locally, check that the pipeline has been run and
          that <code>public/data</code> is populated. See <code>docs/DATA-PIPELINE.md</code>.
        </p>
        <p className="app__error-detail">{String(error?.message ?? error)}</p>
      </main>
    )
  }

  const hasExplorer = can(state.condition, 'explorer')

  return (
    <>
      <SkipLinks hasExplorer={hasExplorer} />
      <SyntheticDataBanner synthetic={synthetic} mixed={mixed} />
      <StudyBar state={state} logger={logger} participantCode={studyParams.participantCode} pidRejected={studyParams.pidRejected} />

      <main className="app">
        <header className="masthead">
          <p className="masthead__eyebrow">A data story</p>
          <h1>Housing and the shape of British wealth</h1>
          <p className="masthead__standfirst">
            Most wealth in Britain is not earned. It is owned, and most of what is owned is housing.
            This is what that does to who ends up wealthy, in three parts: whether you own, when you
            were born, and where you live.
          </p>
          <p className="masthead__meta">
            Built on the Office for National Statistics Wealth and Assets Survey, the UK House Price
            Index and the English Housing Survey. Every figure here is a conservative floor, for
            reasons the piece explains before it ends.
          </p>
        </header>

        <div id="narrative-start" />
        <NarrativeShell
          state={state}
          dispatch={dispatch}
          data={data}
          logger={logger}
          readerValue={readerValue}
        />

        {hasExplorer && state.phase === PHASE.EXPLORER && (
          <div id="explorer">
            <ExplorerPanel state={state} dispatch={dispatch} data={data} logger={logger} />
          </div>
        )}

        {/*
          The static condition's coda. Design spec B.6 gives the static arm static equivalents of
          E5 and E7, not nothing: the timing series as waves side by side, and the off-the-chart
          frames as a small multiple. Without these the interactive arm would carry two facts the
          static arm never sees, and the comparison would be about content rather than interactivity.
        */}
        {!hasExplorer && (
          <section className="static-coda" aria-label="Two further comparisons">
            <TimingWhatIf state={state} dispatch={dispatch} data={data} logger={logger} />
            <OffTheChart state={state} dispatch={dispatch} data={data} logger={logger} />
          </section>
        )}

        <ReturnPanel
          state={state}
          logger={logger}
          participantCode={studyParams.participantCode}
          returnUrl={studyParams.returnUrl}
        />

        <Sources synthetic={synthetic} />
      </main>
    </>
  )
}
