/**
 * A/B condition assignment and the capability table.
 *
 * Design spec B.6: condition is assigned by the URL parameter `?condition=static|interactive`, and
 * the two conditions hold data, charts, messages, ordering and annotation identical, differing only
 * in interactivity.
 *
 * KNOWN WEAKNESS, stated rather than hidden. A URL parameter is visible to the participant and can
 * be edited, so allocation cannot be concealed the way a server-side assignment would be. The study
 * protocol handles this three ways: allocation comes from a pre-generated block-randomised list
 * keyed to an entry code rather than from anything the participant chooses; the parameter is
 * stripped from the visible address bar with history.replaceState after it is read, so it is not
 * advertised; and a switch is detectable in the telemetry, because the condition is logged as the
 * first event and any later disagreement is recorded. Analysis is intention-to-treat on the
 * as-randomised arm, with a per-protocol sensitivity analysis. See wealth-viz_p5-study-protocol_v1.
 */

export const CONDITIONS = ['static', 'interactive']
export const DEFAULT_CONDITION = 'interactive'

/**
 * Read the condition from the URL, then remove the parameter from the visible address so it is not
 * advertised to the participant. Returns the condition and whether the parameter was present at all.
 */
export function readCondition(search = window.location.search, history = window.history) {
  const params = new URLSearchParams(search)
  const raw = params.get('condition')
  const valid = CONDITIONS.includes(raw)
  const condition = valid ? raw : DEFAULT_CONDITION
  if (raw !== null) {
    params.delete('condition')
    const qs = params.toString()
    const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
    try {
      history.replaceState(null, '', url)
    } catch {
      // replaceState can throw in a sandboxed frame. Not fatal: the condition is already read.
    }
  }
  return { condition, parameterPresent: raw !== null, parameterValid: valid, rawValue: raw }
}

/**
 * The capability table, straight from design spec B.6. This is the single source of truth for what
 * each arm renders, so a component never decides for itself.
 *
 * Note what is deliberately identical: the annotation layer, the recurring missing-top caveat, the
 * chart set and the step ordering. Note also that the accessibility layer is not in this table at
 * all, because it must be identical in both arms. An accessibility affordance present in only one
 * arm would be a second manipulated variable.
 */
export const capabilities = {
  static: {
    guidedNeck: true,
    stagedWithinChartTransitions: false,
    perStepAnnotation: true,
    missingTopCaveat: true,
    handoverInput: false,
    handoverStaticComparison: true,
    explorer: false,
    timingInteractive: false,
    timingSmallMultiple: true,
    offTheChartInteractive: false,
    offTheChartSmallMultiple: true,
  },
  interactive: {
    guidedNeck: true,
    stagedWithinChartTransitions: true,
    perStepAnnotation: true,
    missingTopCaveat: true,
    handoverInput: true,
    handoverStaticComparison: false,
    explorer: true,
    timingInteractive: true,
    timingSmallMultiple: false,
    offTheChartInteractive: true,
    offTheChartSmallMultiple: false,
  },
}

export function can(condition, capability) {
  return Boolean(capabilities[condition]?.[capability])
}
