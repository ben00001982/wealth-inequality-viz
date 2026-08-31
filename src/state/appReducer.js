/**
 * The martini-glass state machine.
 *
 * Design spec B.1: "Martini-glass state (which phase, scroll progress, reader inputs, condition)
 * lives in React (useReducer), not in the chart specs." Every Vega-Lite spec in src/vega is a pure
 * function of this state; no spec holds its own mutable state. That separation is L1 pattern A1 and
 * it is what makes the two A/B conditions renderable from one component tree.
 */

export const PHASE = {
  NARRATIVE: 'narrative', // the guided neck, S0 to S17
  HANDOVER: 'handover', // S18, "where do you fit"
  EXPLORER: 'explorer', // the bowl: E1, then E5, then E7
}

export const EXPLORER_VIEW = {
  CROSS_FILTER: 'E1.1',
  LOCATE: 'E1.2',
  COMPARE: 'E1.3',
  TIMING: 'E5',
  OFF_THE_CHART: 'E7',
}

/** An empty reader profile. Region is an ITL1 code, tenure and ageBand are lookup keys. */
export const emptyProfile = { ageBand: null, tenure: null, region: null, headStart: 0 }

export const initialState = {
  condition: 'interactive', // overwritten at mount from the URL parameter
  phase: PHASE.NARRATIVE,
  activeStep: 'S0',
  visitedSteps: [],
  profile: { ...emptyProfile },
  // E1.3 compare mode holds two independently configured profiles.
  compare: { a: { ...emptyProfile }, b: { ...emptyProfile }, enabled: false },
  explorerView: EXPLORER_VIEW.CROSS_FILTER,
  // E1.1 cross-filter selection, shared by all three linked panels.
  selection: { ageBand: null, tenure: null, region: null },
  // E5 holds a survey wave rather than a market-entry decade. See design spec revision r2.6:
  // WAS carries no market-entry-decade variable, so the interactive lever is the wave.
  timingWave: null,
  // E7 zoom step index into the stepped-rescale sequence.
  zoomStep: 0,
  reducedMotion: false,
  dataIsSynthetic: true,
  /*
   * Exposure milestones live here, not in the telemetry hook.
   *
   * They were in a ref inside useSessionLogger, which mutated without triggering a render. The
   * return panel reads them to decide whether the exposure floor is met, so it rendered one step
   * behind and, in the static arm, never re-rendered at all: the last milestone arrives on the same
   * state change that produced the final render, so nothing followed it. The static arm therefore
   * never released its return code, which would have lost every static participant's behavioural
   * data.
   *
   * The rule this enforces: anything the interface renders from is reducer state. The logger records
   * facts; it does not hold them.
   */
  milestones: { enteredExplorer: false, sawClose: false },
}

export function appReducer(state, action) {
  switch (action.type) {
    case 'SET_CONDITION':
      return { ...state, condition: action.condition }

    case 'SET_REDUCED_MOTION':
      return { ...state, reducedMotion: action.value }

    case 'SET_DATA_PROVENANCE':
      return { ...state, dataIsSynthetic: action.isSynthetic }

    case 'STEP_ENTER': {
      const visited = state.visitedSteps.includes(action.step)
        ? state.visitedSteps
        : [...state.visitedSteps, action.step]
      const phase = action.step === 'S18' ? PHASE.HANDOVER : PHASE.NARRATIVE
      return { ...state, activeStep: action.step, visitedSteps: visited, phase }
    }

    case 'SET_PROFILE_FIELD': {
      const profile = { ...state.profile, [action.field]: action.value }
      // The handover seeds the explorer, so a profile edit also seeds the cross-filter selection
      // and compare card A. Design spec B.3: "Those inputs seed the explorer's initial state, so
      // exploration starts from 'me' and radiates outward."
      return {
        ...state,
        profile,
        selection: { ...state.selection, [action.field]: action.value },
        compare: { ...state.compare, a: { ...state.compare.a, [action.field]: action.value } },
      }
    }

    case 'REACH_MILESTONE': {
      if (state.milestones[action.milestone]) return state // idempotent: fire once, record once
      return { ...state, milestones: { ...state.milestones, [action.milestone]: true } }
    }

    case 'ENTER_EXPLORER':
      // Static condition never reaches the explorer. Guarded here as well as in the view layer so
      // a stray dispatch cannot break condition parity.
      if (state.condition === 'static') return state
      return { ...state, phase: PHASE.EXPLORER, explorerView: action.view ?? state.explorerView }

    case 'SET_EXPLORER_VIEW':
      return { ...state, explorerView: action.view }

    case 'SET_SELECTION': {
      const selection = { ...state.selection, [action.field]: action.value }
      return { ...state, selection }
    }

    case 'CLEAR_SELECTION':
      return { ...state, selection: { ageBand: null, tenure: null, region: null } }

    case 'SET_COMPARE_FIELD': {
      const card = { ...state.compare[action.card], [action.field]: action.value }
      return { ...state, compare: { ...state.compare, [action.card]: card } }
    }

    case 'LOAD_PRESET':
      // E1.4 archetype loader: seeds both compare cards and the cross-filter selection at once.
      return {
        ...state,
        compare: {
          ...state.compare,
          enabled: true,
          a: { ...emptyProfile, ...action.preset.a },
          b: { ...emptyProfile, ...action.preset.b },
        },
        selection: {
          ageBand: action.preset.a.ageBand ?? null,
          tenure: action.preset.a.tenure ?? null,
          region: action.preset.a.region ?? null,
        },
      }

    case 'TOGGLE_COMPARE':
      return { ...state, compare: { ...state.compare, enabled: !state.compare.enabled } }

    case 'SET_TIMING_WAVE':
      return { ...state, timingWave: action.wave }

    case 'SET_ZOOM_STEP':
      return { ...state, zoomStep: action.step }

    case 'RESET_EXPLORER':
      return {
        ...state,
        selection: { ageBand: null, tenure: null, region: null },
        compare: { a: { ...emptyProfile }, b: { ...emptyProfile }, enabled: false },
        timingWave: null,
        zoomStep: 0,
      }

    case 'RESTORE':
      // localStorage rehydration. Condition is never restored: it must always come from the URL,
      // or a returning participant could silently land in the wrong arm.
      return { ...state, ...action.state, condition: state.condition }

    default:
      return state
  }
}
