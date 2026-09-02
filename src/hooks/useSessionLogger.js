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
  // Exposure markers. The protocol declares a floor that gates participant inclusion, and before
  // these there was no data with which to apply it: nothing recorded that a reader had actually
  // reached the end of what their arm had to show.
  EXPOSURE_MILESTONE: 'exposure_milestone',
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

export function useSessionLogger({ condition, reducedMotion, participantCode = null, enabled = true }) {
  /*
   * The participant code is the consent gate. No code, no logging.
   *
   * Consent is taken on the survey platform before the artefact is reached, and the platform hands
   * over the code, so a valid code is evidence that consent happened. Its absence means this is a
   * member of the public, who is not in the study and about whom nothing is recorded: no session
   * identifier is generated, no event is emitted, and nothing is written to storage.
   *
   * This replaces gating on `?study=1`, which only hid the visible harness while logging ran for
   * everybody. The ethics application told the committee that capture ships disabled; that is now
   * true of the build, and the mechanism is structural rather than a flag someone must remember.
   */
  const consented = Boolean(participantCode)
  const active = enabled && consented
  const stateRef = useRef(null)

  // Lazily initialise once. The session identifier is a random value, not a hash of anything about
  // the participant, so it cannot be reversed into an identity.
  if (stateRef.current === null && !consented) {
    // A no-op logger. Every method exists so callers need no conditionals, and none of them records.
    stateRef.current = {
      sessionId: null, schemaVersion: SCHEMA_VERSION, seq: 0, events: [], t0: nowMs(),
      openSection: null, visibleSince: nowMs(), hiddenAccumMs: 0, resumed: false,
      writable: true, inert: true, enterCounts: {}, lastScrollY: 0,
      milestones: { enteredExplorer: false, sawClose: false },
    }
  }

  if (stateRef.current === null) {
    const existing = safeRead(STORAGE_KEY)
    const resumed = Boolean(existing?.sessionId)
    stateRef.current = {
      sessionId: existing?.sessionId ?? newSessionId(),
      schemaVersion: SCHEMA_VERSION,
      seq: existing?.events?.length ?? 0,
      events: existing?.events ?? [],
      /*
       * On a resume, t0 is pushed back so that `t` continues from where the stored log left off
       * rather than restarting at zero. Without this the offsets are not monotonic across a reload:
       * restored events keep their old values while new ones start again from 0, so any duration
       * derived from the last event's `t` understates a resumed session, silently.
       */
      t0: nowMs() - (existing?.events?.[existing.events.length - 1]?.t ?? 0) * 1000,
      openSection: null,
      visibleSince: nowMs(),
      hiddenAccumMs: 0,
      resumed,
      writable: true,
      inert: false,
      // Per-section entry counter, so a revisit is distinguishable from a first read and
      // backtrack_count becomes computable. It was specified in the analysis plan and absent here.
      enterCounts: existing?.enterCounts ?? {},
      lastScrollY: typeof window !== 'undefined' ? window.scrollY : 0,
      milestones: existing?.milestones ?? { enteredExplorer: false, sawClose: false },
    }
  }

  const persist = useCallback(() => {
    const s = stateRef.current
    if (s.inert) return
    const ok = safeWrite(STORAGE_KEY, {
      sessionId: s.sessionId,
      schemaVersion: s.schemaVersion,
      participantCode,
      events: s.events,
      enterCounts: s.enterCounts,
      milestones: s.milestones,
    })
    s.writable = ok
  }, [participantCode])

  const log = useCallback(
    (type, payload = {}) => {
      if (!active) return
      const s = stateRef.current
      if (s.inert) return
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
    [active, persist],
  )

  // Condition assignment is the first event on the log, which is what makes an arm switch
  // detectable later: the first event is authoritative and any disagreement is evidence.
  useEffect(() => {
    if (!active) return
    const s = stateRef.current
    if (s.events.length === 0) {
      log(EVENT.SESSION_START, {
        condition,
        participantCode,
        reducedMotion,
        schemaVersion: SCHEMA_VERSION,
        scope: SCOPE.HARNESS,
      })
    } else if (s.resumed) {
      s.resumed = false
      log(EVENT.SESSION_RESUMED, { condition, priorEvents: s.events.length - 1, scope: SCOPE.HARNESS })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  /**
   * Tab visibility. A background tab keeps accumulating elapsed time but nobody is reading, so raw
   * elapsed dwell is not a reading measure. The hook tracks hidden time and reports visible dwell as
   * the primary measure, with total elapsed retained so the difference is auditable. Visibility is
   * not attention, and the analysis plan says so: it is an upper bound on attention, not a proxy
   * for it.
   */
  useEffect(() => {
    if (!active) return undefined
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
  }, [active, log])

  /**
   * Flush the open section when the page goes away.
   *
   * Without this, the last thing a reader looked at has no dwell at all: they close the tab, no exit
   * event ever fires, and the final step or explorer view is silently absent from the analysis. That
   * is a systematic bias rather than random loss, because the final view is E7, which is the one the
   * study most wants a dwell for.
   *
   * `pagehide` is the hook, and it is the only one. `beforeunload` is unreliable on mobile Safari and
   * does not fire when a tab is discarded. It writes synchronously to localStorage, which is
   * permitted during teardown; anything asynchronous would not complete.
   *
   * Deliberately NOT hooked to the hidden branch of `visibilitychange`, even though that is the usual
   * advice for persisting state. Closing the open section on backgrounding would split one step into
   * two dwell records every time a reader switched tabs, and would make the hidden-time subtraction
   * in `visibleDwellS` redundant, since a section could never span a hidden interval. The whole point
   * of tracking `hiddenAccumMs` is to keep the section open across backgrounding and report visible
   * time within it.
   *
   * The residual loss, stated so the analysis knows about it: if a hidden tab is silently discarded by
   * the browser, `pagehide` may not fire and that one final dwell is lost. The events before it are
   * already persisted, because every event writes on emission.
   */
  useEffect(() => {
    if (!active) return undefined
    const flush = () => {
      if (stateRef.current.openSection) closeOpen('page-hidden')
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  /**
   * Close whatever section or explorer view is currently open, and emit its dwell.
   *
   * Defined before the enter and exit helpers because both delegate to it. One function owns the
   * dwell arithmetic, so a narrative step and an explorer view are measured the same way and the
   * analysis has one code path rather than two.
   */
  const closeOpen = useCallback(
    (reason) => {
      const s = stateRef.current
      const open = s.openSection
      if (!open) return null
      const elapsedMs = nowMs() - open.at
      const hiddenDuringMs = s.hiddenAccumMs - open.hiddenAt
      s.openSection = null
      log(EVENT.SECTION_EXIT, {
        sectionId: open.id,
        // Whole seconds, per the data management plan's quantisation requirement.
        dwellS: Math.round(elapsedMs / 1000),
        visibleDwellS: Math.max(0, Math.round((elapsedMs - hiddenDuringMs) / 1000)),
        scope: open.scope,
        ...(reason ? { closedBy: reason } : {}),
      })
      return open.id
    },
    [log],
  )

  const openSection = useCallback((id, scope) => {
    const s = stateRef.current
    s.openSection = { id, scope, at: nowMs(), hiddenAt: s.hiddenAccumMs }
  }, [])

  const sectionEnter = useCallback(
    (sectionId, navigationSource = 'scroll') => {
      const s = stateRef.current
      // Close any section still open. Scrollama can fire an enter without a matching exit when a
      // fast scroll skips a step, and a keyboard jump deliberately skips several.
      if (s.openSection && s.openSection.id !== sectionId) closeOpen('superseded')

      /*
       * Entry index and scroll direction.
       *
       * Both were specified in the telemetry analysis plan and neither existed, which made
       * `backtrack_count` uncomputable. It is one of only two behavioural measures both arms can
       * emit, so without it the between-condition behavioural comparison rested on a single measure.
       *
       * entryIndex is 1 on the first visit to a step and increments on every return, so a revisit is
       * distinguishable from a first read without inferring it from event order. direction compares
       * the current scroll position with the last recorded one: 'up' is a backtrack. A keyboard jump
       * reports 'jump', because its direction is not a reading behaviour.
       */
      const count = (s.enterCounts[sectionId] ?? 0) + 1
      s.enterCounts[sectionId] = count
      const y = typeof window !== 'undefined' ? window.scrollY : 0
      const direction =
        navigationSource !== 'scroll' ? 'jump' : y < s.lastScrollY ? 'up' : 'down'
      s.lastScrollY = y

      openSection(sectionId, SCOPE.BOTH)
      log(EVENT.SECTION_ENTER, {
        sectionId,
        navigationSource,
        entryIndex: count,
        direction,
        scope: SCOPE.BOTH,
      })
    },
    [log, closeOpen, openSection],
  )

  const sectionExit = useCallback(
    (sectionId) => {
      const open = stateRef.current.openSection
      if (!open || open.id !== sectionId) return
      closeOpen(null)
    },
    [closeOpen],
  )

  const controlInteraction = useCallback(
    (control, detail = {}, scope = SCOPE.INTERACTIVE_ONLY) => {
      log(EVENT.CONTROL_INTERACTION, { control, scope, ...detail })
    },
    [log],
  )

  /**
   * Explorer view entry, measured the same way as a narrative step.
   *
   * The explorer used to emit an enter event with no matching exit, which meant per-view dwell could
   * only be recovered by differencing consecutive enters, and the last view a reader looked at had no
   * duration at all. Routing view changes through the same open and close machinery gives every view
   * a real `section_exit` with a dwell, tagged interactive-only so the parity filter still keeps it
   * out of any cross-condition comparison.
   *
   * It also closes S18 at the moment of handover rather than whenever the scroll observer next fires,
   * which is the more accurate boundary for the neck-to-bowl transition.
   */
  const explorerEntered = useCallback(
    (view) => {
      const s = stateRef.current
      if (s.openSection && s.openSection.id !== view) closeOpen('explorer-view-change')
      log(EVENT.EXPLORER_PHASE_ENTERED, { view, scope: SCOPE.INTERACTIVE_ONLY })
      openSection(view, SCOPE.INTERACTIVE_ONLY)
      if (!s.milestones.enteredExplorer) {
        s.milestones.enteredExplorer = true
        log(EVENT.EXPOSURE_MILESTONE, { milestone: 'entered_explorer', scope: SCOPE.INTERACTIVE_ONLY })
      }
    },
    [log, closeOpen, openSection],
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
      // The join key was missing from the export, so pilot files could only be matched by hand.
      participantCode,
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
  }, [condition, reducedMotion, participantCode, log])

  /**
   * Record that the reader reached the close, E7.
   *
   * Called from both arms: the interactive arm when the E7 view is entered, the static arm when the
   * small-multiple equivalent is rendered. Scope is 'both', because it is the same construct in each
   * and the exposure floor has to be applicable to both.
   */
  const sawClose = useCallback(() => {
    const s = stateRef.current
    if (s.inert || s.milestones.sawClose) return
    s.milestones.sawClose = true
    log(EVENT.EXPOSURE_MILESTONE, { milestone: 'saw_close', scope: SCOPE.BOTH })
  }, [log])

  /** The raw material the return code needs: dwell vectors and interaction counts, derived. */
  const summarise = useCallback(() => {
    const s = stateRef.current
    const dwellS = {}
    const visibleDwellS = {}
    const revisits = {}
    const interactions = {}
    for (const e of s.events) {
      if (e.type === EVENT.SECTION_EXIT) {
        dwellS[e.sectionId] = (dwellS[e.sectionId] ?? 0) + (e.dwellS ?? 0)
        visibleDwellS[e.sectionId] = (visibleDwellS[e.sectionId] ?? 0) + (e.visibleDwellS ?? 0)
      } else if (e.type === EVENT.SECTION_ENTER) {
        // Entries beyond the first. entryIndex is 1 on a first read, so a step read once contributes
        // nothing and only genuine returns register. This is the backtrack measure.
        if ((e.entryIndex ?? 1) > 1) revisits[e.sectionId] = (revisits[e.sectionId] ?? 0) + 1
      } else if (e.type === EVENT.CONTROL_INTERACTION) {
        interactions[e.control] = (interactions[e.control] ?? 0) + 1
      }
    }
    /*
     * Include the section that is still open.
     *
     * Dwell is written on exit, so whatever the reader is looking at when the return code is
     * generated contributes nothing. That is not a marginal loss: the reader takes the code at the
     * end, so the open section is always the close, E7, whose dwell is one of the measures the study
     * most wants. Adding the elapsed time of the open section here fixes it for the return code
     * without emitting a duplicate exit event, which would double-count once pagehide fires.
     */
    const open = s.openSection
    if (open) {
      const elapsedS = Math.round((nowMs() - open.at) / 1000)
      const hiddenS = Math.round((s.hiddenAccumMs - open.hiddenAt) / 1000)
      dwellS[open.id] = (dwellS[open.id] ?? 0) + elapsedS
      visibleDwellS[open.id] = (visibleDwellS[open.id] ?? 0) + Math.max(0, elapsedS - hiddenS)
    }

    const last = s.events[s.events.length - 1]
    return {
      dwellS,
      visibleDwellS,
      revisits,
      interactions,
      sessionSeconds: last?.t ?? 0,
      eventCount: s.events.length,
      milestones: { ...s.milestones },
      resumed: s.events.some((e) => e.type === EVENT.SESSION_RESUMED),
      visitedSteps: [...new Set(s.events.filter((e) => e.type === EVENT.SECTION_ENTER).map((e) => e.sectionId))],
    }
  }, [])

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
      consented,
      inert: stateRef.current.inert,
      eventCount: () => stateRef.current.events.length,
      writable: () => stateRef.current.writable,
      summarise,
      sawClose,
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
      consented,
      summarise,
      sawClose,
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
