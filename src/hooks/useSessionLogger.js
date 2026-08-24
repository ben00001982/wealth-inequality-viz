import { useCallback, useEffect, useMemo, useRef } from 'react'

/**
 * localStorage-only session telemetry.
 *
 * Constraint and asset at once. The stack is a static site with no server, so there is nowhere to
 * POST to; the log therefore lives in the participant's own browser and leaves it only when they
 * choose to export it. That is the tech-stack constraint, and it is also the strongest data
 * protection story the project has: nothing is transmitted, so there is nothing in transit to
 * intercept and no store to breach. The cost is stated honestly in the report: capture is not
 * guaranteed, and an abandoned session is simply lost.
 *
 * Schema. Every event shares a common envelope and then carries a type-specific payload. The
 * envelope is deliberately thin, because every field is an ethics cost and the data management plan
 * had to justify each one. Three things the plan explicitly ruled out and which therefore do not
 * appear here: absolute wall-clock timestamps, viewport pixel dimensions, and the user-agent string.
 * Durations are quantised to whole seconds for the same reason, since a millisecond-precision dwell
 * vector across nineteen steps is close to a fingerprint.
 *
 * See wealth-viz_p5-telemetry-analysis-plan_v1 for the full field list and the analysis that
 * consumes it, and wealth-viz_p5-data-management-plan_v1 for why each field survives.
 */

export const SCHEMA_VERSION = 3
const STORAGE_KEY = 'wviz.session.v3'
const STATE_KEY = 'wviz.state.v3'

export const EVENT = {
  SESSION_START: 'session_start',
  SESSION_RESUMED: 'session_resumed',
  SECTION_ENTER: 'section_enter',
  SECTION_EXIT: 'section_exit',
  CONTROL_INTERACTION: 'control_interaction',
  EXPLORER_PHASE_ENTERED: 'explorer_phase_entered',
  VISIBILITY_CHANGE: 'visibility_change',
  SESSION_COMPLETE: 'session_complete',
  EXPORT: 'export',
}

/**
 * Interaction scope, so the parity constraint is enforced by the data rather than by a convention
 * someone has to remember. A `control_interaction` tagged 'interactive-only' cannot legitimately
 * appear in a between-condition comparison, because the static arm has no way to emit it. Analysis
 * code filters on this field; see the telemetry analysis plan.
 */
export const SCOPE = {
  BOTH: 'both', // an affordance present in both arms, for example a skip link
  INTERACTIVE_ONLY: 'interactive-only', // explorer controls, the handover input, E5 and E7 controls
  HARNESS: 'harness', // the measurement wrapper, identical in both arms
}

function nowMs() {
  // performance.now is monotonic, so it does not jump if the system clock is corrected mid-session.
  // Wall-clock time is never recorded; only offsets from session start are.
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}

function safeRead(key) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function safeWrite(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Private browsing, a full quota, or blocked site data. The artefact must still work; only the
    // telemetry is lost, and that loss is reported to the participant at the export step.
    return false
  }
}

function newSessionId() {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  } catch {
    /* fall through */
  }
  // Fallback: 16 random bytes as hex. Not a person, and not derived from anything about them.
  const bytes = new Uint8Array(16)
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes)
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function useSessionLogger({ condition, reducedMotion, enabled = true }) {
  const stateRef = useRef(null)

  // Lazily initialise once. The session identifier is a random value, not a hash of anything about
  // the participant, so it cannot be reversed into an identity.
  if (stateRef.current === null) {
    const existing = safeRead(STORAGE_KEY)
    const resumed = Boolean(existing?.sessionId)
    stateRef.current = {
      sessionId: existing?.sessionId ?? newSessionId(),
      schemaVersion: SCHEMA_VERSION,
      seq: existing?.events?.length ?? 0,
      events: existing?.events ?? [],
      t0: nowMs(),
      openSection: null,
      visibleSince: nowMs(),
      hiddenAccumMs: 0,
      resumed,
      writable: true,
    }
  }

  const persist = useCallback(() => {
    const s = stateRef.current
    const ok = safeWrite(STORAGE_KEY, {
      sessionId: s.sessionId,
      schemaVersion: s.schemaVersion,
      events: s.events,
    })
    s.writable = ok
  }, [])

  const log = useCallback(
    (type, payload = {}) => {
      if (!enabled) return
      const s = stateRef.current
      s.seq += 1
      s.events.push({
        seq: s.seq,
        type,
        // Offset from session start in whole seconds. No wall-clock time is recorded.
        t: Math.round((nowMs() - s.t0) / 1000),
        ...payload,
      })
      persist()
    },
    [enabled, persist],
  )

  // Condition assignment is the first event on the log, which is what makes an arm switch
  // detectable later: the first event is authoritative and any disagreement is evidence.
  useEffect(() => {
    if (!enabled) return
    const s = stateRef.current
    if (s.events.length === 0) {
      log(EVENT.SESSION_START, {
        condition,
        reducedMotion,
        schemaVersion: SCHEMA_VERSION,
        scope: SCOPE.HARNESS,
      })
    } else if (s.resumed) {
      s.resumed = false
      log(EVENT.SESSION_RESUMED, { condition, priorEvents: s.events.length - 1, scope: SCOPE.HARNESS })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  /**
   * Tab visibility. A background tab keeps accumulating elapsed time but nobody is reading, so raw
   * elapsed dwell is not a reading measure. The hook tracks hidden time and reports visible dwell as
   * the primary measure, with total elapsed retained so the difference is auditable. Visibility is
   * not attention, and the analysis plan says so: it is an upper bound on attention, not a proxy
   * for it.
   */
  useEffect(() => {
    if (!enabled) return undefined
    const onVisibility = () => {
      const s = stateRef.current
      const hidden = document.visibilityState === 'hidden'
      if (hidden) {
        s.visibleSince = s.visibleSince ?? nowMs()
        s.hiddenFrom = nowMs()
      } else if (s.hiddenFrom) {
        s.hiddenAccumMs += nowMs() - s.hiddenFrom
        s.hiddenFrom = null
      }
      log(EVENT.VISIBILITY_CHANGE, { hidden, scope: SCOPE.HARNESS })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [enabled, log])

  const sectionEnter = useCallback(
    (sectionId, navigationSource = 'scroll') => {
      const s = stateRef.current
      // Close any section still open. Scrollama can fire an enter without a matching exit when a
      // fast scroll skips a step, and a keyboard jump deliberately skips several.
      if (s.openSection && s.openSection.id !== sectionId) {
        sectionExit(s.openSection.id)
      }
      s.openSection = { id: sectionId, at: nowMs(), hiddenAt: s.hiddenAccumMs }
      log(EVENT.SECTION_ENTER, { sectionId, navigationSource, scope: SCOPE.BOTH })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [log],
  )

  const sectionExit = useCallback(
    (sectionId) => {
      const s = stateRef.current
      const open = s.openSection
      if (!open || open.id !== sectionId) return
      const elapsedMs = nowMs() - open.at
      const hiddenDuringMs = s.hiddenAccumMs - open.hiddenAt
      s.openSection = null
      log(EVENT.SECTION_EXIT, {
        sectionId,
        // Whole seconds, per the data management plan's quantisation requirement.
        dwellS: Math.round(elapsedMs / 1000),
        visibleDwellS: Math.max(0, Math.round((elapsedMs - hiddenDuringMs) / 1000)),
        scope: SCOPE.BOTH,
      })
    },
    [log],
  )

  const controlInteraction = useCallback(
    (control, detail = {}, scope = SCOPE.INTERACTIVE_ONLY) => {
      log(EVENT.CONTROL_INTERACTION, { control, scope, ...detail })
    },
    [log],
  )

  const explorerEntered = useCallback(
    (view) => log(EVENT.EXPLORER_PHASE_ENTERED, { view, scope: SCOPE.INTERACTIVE_ONLY }),
    [log],
  )

  const sessionComplete = useCallback(
    (detail = {}) => log(EVENT.SESSION_COMPLETE, { ...detail, scope: SCOPE.HARNESS }),
    [log],
  )

  /** Participant-triggered export. Nothing leaves the browser until this runs. */
  const exportLog = useCallback(() => {
    const s = stateRef.current
    log(EVENT.EXPORT, { eventCount: s.events.length, scope: SCOPE.HARNESS })
    const payload = {
      sessionId: s.sessionId,
      schemaVersion: SCHEMA_VERSION,
      condition,
      reducedMotion,
      // No absolute timestamps: only the offsets already on each event.
      events: s.events,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wviz-session-${s.sessionId.slice(0, 8)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return payload
  }, [condition, reducedMotion, log])

  /** State persistence for the explorer, so E1.1 remembers the last cross-filter state. */
  const saveExplorerState = useCallback((partial) => safeWrite(STATE_KEY, partial), [])
  const loadExplorerState = useCallback(() => safeRead(STATE_KEY), [])

  const clearAll = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
      window.localStorage.removeItem(STATE_KEY)
    } catch {
      /* nothing to do */
    }
  }, [])

  return useMemo(
    () => ({
      sessionId: stateRef.current.sessionId,
      eventCount: () => stateRef.current.events.length,
      writable: () => stateRef.current.writable,
      log,
      sectionEnter,
      sectionExit,
      controlInteraction,
      explorerEntered,
      sessionComplete,
      exportLog,
      saveExplorerState,
      loadExplorerState,
      clearAll,
    }),
    [
      log,
      sectionEnter,
      sectionExit,
      controlInteraction,
      explorerEntered,
      sessionComplete,
      exportLog,
      saveExplorerState,
      loadExplorerState,
      clearAll,
    ],
  )
}
