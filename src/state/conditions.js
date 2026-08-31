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
  /*
   * Demo override, and why it is guarded the way it is.
   *
   * The single-file offline build (`npm run build:single`) may be opened from a file:// URL or inside
   * a sandboxed frame, where a query string is not reliably available to the page. So that build
   * stamps its arm in as window.__WVIZ_CONDITION__.
   *
   * This is honoured ONLY when window.__WVIZ_EMBED__ is also true, which only the single-file build
   * sets. A deployed build never sets it, so a participant's arm can never be decided by anything
   * other than the URL they were sent. If you ever find yourself wanting to set __WVIZ_EMBED__ on a
   * hosted build, stop: that would put condition assignment inside the page, where the study cannot
   * audit it.
   */
  if (typeof window !== 'undefined' && window.__WVIZ_EMBED__ && CONDITIONS.includes(window.__WVIZ_CONDITION__)) {
    /*
     * The embedded build reports its condition as present and valid.
     *
     * It is stamped in at build time by scripts/build_singlefile.mjs, which produces one file per
     * arm, so the allocation is definitively known and cannot be edited by a participant. That makes
     * it MORE trustworthy than a URL parameter, not less, and it must satisfy the same
     * "explicit, valid condition" test that gates the participant code: otherwise a single-file build
     * could never run a session, and the offline viva fallback could not demonstrate the study flow.
     */
    return {
      condition: window.__WVIZ_CONDITION__,
      parameterPresent: true,
      parameterValid: true,
      rawValue: window.__WVIZ_CONDITION__,
      source: 'embedded-demo-build',
    }
  }

  const params = new URLSearchParams(search)
  const raw = params.get('condition')
  const valid = CONDITIONS.includes(raw)

  /*
   * A malformed condition parameter must NOT fall back to a condition.
   *
   * The default used to be 'interactive', which meant a truncated or mistyped link silently allocated
   * that participant to the interactive arm, undetectably, biasing allocation in one direction. The
   * study protocol's allocation section did not know this.
   *
   * Now: a present-but-invalid parameter is recorded as invalid and the session is refused a
   * participant code, so nothing is logged and the researcher sees the participant arrive at the
   * survey platform with no return code. A missing parameter still defaults, because that is the
   * public visitor case, and a public visitor is not in the study at all.
   */
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
 * Read the study parameters: the participant code, and the survey platform's return URL.
 *
 * **The participant code is the consent token, and that is the whole design.**
 *
 * Consent is taken on the survey platform, before the participant ever reaches the artefact. The
 * platform then hands over a code. So the presence of a valid code is proof that a consent step
 * happened, and its absence means this visitor is a member of the public who wandered in.
 *
 * Telemetry is therefore gated on the code, not on a `?study=1` flag. Before this, logging began as
 * soon as the data loaded, for anybody: the flag only hid the visible harness. The ethics application
 * told the committee that "the study build ships with the consent and capture path disabled", and
 * that was not true of the build. Now it is, and the mechanism is one that cannot drift: no code, no
 * session identifier, no events, nothing written to storage.
 *
 * The code is stripped from the visible address bar along with the condition, for the same reason.
 *
 * Format is deliberately restrictive. A panel or survey platform supplies something short and
 * alphanumeric; anything else is a malformed link or a participant editing the URL, and is refused
 * rather than sanitised into something that looks valid.
 */
const PID_PATTERN = /^[A-Za-z0-9_-]{4,64}$/

/**
 * Recover the participant code from a session already in progress in this browser.
 *
 * Why this is needed, and it is not a nicety. The code is stripped from the address bar as soon as it
 * is read, so that it is not advertised to the participant. The consequence is that a plain reload
 * lands on a URL with no code: the logger would go inert, nothing further would be recorded, and the
 * return panel would never render, so the participant could not obtain the code they need to finish.
 * They would be stranded, having done the reading, with no way to complete.
 *
 * People reload. The protocol asks them to read for up to twenty minutes on a page with a sticky
 * graphic, and a reload is the ordinary response to anything looking stuck.
 *
 * So a code already recorded against a session in this browser is treated as still in force. This
 * introduces no new stored data: the code is already inside the session object, because the analysis
 * needs it to perform the join. And it does not weaken the consent gate, because a visitor with
 * neither a code in the URL nor a session in storage is still inert: there is nothing to recover.
 */
function recoverParticipantCode() {
  try {
    const raw = window.localStorage.getItem('wviz.session.v3')
    if (!raw) return null
    const stored = JSON.parse(raw)
    const code = stored?.participantCode
    return code && PID_PATTERN.test(code) ? code : null
  } catch {
    return null
  }
}

export function readStudyParams(search = window.location.search, history = window.history) {
  const params = new URLSearchParams(search)
  const rawPid = params.get('pid')
  const rawReturn = params.get('return')

  const fromUrl = rawPid && PID_PATTERN.test(rawPid) ? rawPid : null
  const recovered = fromUrl ? null : recoverParticipantCode()
  const participantCode = fromUrl ?? recovered
  const pidRejected = Boolean(rawPid) && !fromUrl

  let returnUrl = null
  if (rawReturn) {
    try {
      const u = new URL(rawReturn)
      // Only https, and never a javascript: or data: URL dressed up as a return target.
      if (u.protocol === 'https:') returnUrl = u.toString()
    } catch {
      returnUrl = null
    }
  }

  if (rawPid !== null || rawReturn !== null) {
    params.delete('pid')
    params.delete('return')
    const qs = params.toString()
    const url = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
    try {
      history.replaceState(null, '', url)
    } catch {
      /* sandboxed frame; the values are already read */
    }
  }

  return {
    participantCode,
    pidRejected,
    returnUrl,
    // True when the code came from storage rather than the link, which means this is a reload or a
    // second visit. The analysis wants to know: a recovered session cannot have its arm re-checked
    // against the link, so it is reported separately in the per-protocol sensitivity analysis.
    codeRecovered: Boolean(recovered),
  }
}

/**
 * Minimum exposure, per arm, for a session to count.
 *
 * The protocol declares an exposure floor that gates participant inclusion, and until now there was
 * no data with which to apply it. These are the conditions, stated here rather than in a component so
 * the analysis and the artefact cannot disagree about what "completed the exposure" means.
 *
 * The static arm has no explorer, so requiring an explorer visit would exclude every static
 * participant. This asymmetry is not a parity breach: it is a per-arm definition of the same
 * construct, which is having seen everything that arm has to show.
 */
export const EXPOSURE_REQUIREMENTS = {
  static: { lastStep: 'S18', requiresExplorer: false, requiresClose: true },
  interactive: { lastStep: 'S18', requiresExplorer: true, requiresClose: true },
}

export function isExposureComplete(condition, { visitedSteps = [], enteredExplorer, sawClose }) {
  const req = EXPOSURE_REQUIREMENTS[condition] ?? EXPOSURE_REQUIREMENTS.static
  if (!visitedSteps.includes(req.lastStep)) return false
  if (req.requiresExplorer && !enteredExplorer) return false
  // "Close" is E7 in both arms: interactively stepped, or statically rendered as the small multiple.
  if (req.requiresClose && !sawClose) return false
  return true
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
