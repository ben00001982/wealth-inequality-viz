/**
 * The return code: how telemetry gets from the participant's browser to the researcher.
 *
 * The problem this replaces. The study protocol's step 13 asked the participant to press a download
 * button, find the resulting JSON file and send it to the researcher. That was going to be the single
 * largest source of data loss in the study: it asks a member of the public recruited through a panel
 * to perform a file operation, and any participant who declines, forgets, or cannot find their
 * downloads folder contributes a comprehension record with no behavioural data attached.
 *
 * The mechanism. The artefact encodes the whole behavioural record as one short opaque string. The
 * participant pastes it into a single field on the survey platform, or the artefact appends it to the
 * return URL so the platform captures it on redirect with no participant action at all. Both routes
 * are available: the redirect is the default when a return URL was supplied, and the paste is the
 * fallback when it was not, or when the redirect is blocked.
 *
 * Why this is small enough to work. A nineteen-step dwell vector, the visible-time vector, the
 * interaction counts and the exposure flags encode to roughly 200 characters. Browsers and survey
 * platforms handle query strings of a couple of thousand characters without difficulty, so there is
 * an order of magnitude of headroom. Nothing is compressed, because a compression step would add an
 * asynchronous API and a failure mode for a saving that is not needed.
 *
 * Base 36 for the numbers, because dwell is recorded in whole seconds and three base-36 digits cover
 * 46,655 seconds, which is thirteen hours. Any session longer than that is not a reading session.
 *
 * The checksum is the part that is easy to leave out and should not be. A pasted code can lose a
 * character, gain a space, or be truncated by a field length limit, and a corrupted dwell vector that
 * still parses is worse than one that fails, because it enters the analysis silently. The FNV-1a hash
 * on the end lets the decoder reject a damaged code, and the survey platform can validate it inline.
 *
 * Version 4, 1 September 2026. Two additions, both because a measure was specified and had no data
 * reaching the researcher. The event log carried `entryIndex` and `direction` on every step entry,
 * which is what makes `backtrack_count` computable, but the return code did not carry them: the code
 * is the only thing that reaches the researcher for the main sample, so the measure was still empty.
 * It now carries a per-step revisit count. And the dwell vectors now span the explorer views as well
 * as the narrative steps, so per-view dwell is tier one rather than pilot-only.
 *
 * What this deliberately does NOT carry: no free text, no timestamps, no user agent, no viewport, no
 * answers to any comprehension item. The instrument lives on the survey platform and the two are
 * joined by the participant code. See wealth-viz_p5-data-management-plan_v1 for why each field
 * survives, and docs/STUDY-HARNESS.md for the schema.
 */

export const RETURN_CODE_VERSION = 4
const SEP = '~'
const FIELD_SEP = '.'

/** FNV-1a, 32-bit, as eight hex digits. Not cryptographic: this detects corruption, not tampering. */
export function checksum(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    // The 32-bit FNV prime, as shifts, because a plain multiply overflows into float precision.
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
    h >>>= 0
  }
  return h.toString(16).padStart(8, '0')
}

const b36 = (n) => Math.max(0, Math.round(Number(n) || 0)).toString(36)
const unb36 = (s) => parseInt(s, 36) || 0

/**
 * Build the return code.
 *
 * @param {object} p
 * @param {string} p.participantCode  the code the survey platform supplied, echoed back so the two
 *                                    records can be joined. The join key: without it there is no
 *                                    behavioural data for anyone.
 * @param {string} p.condition        'static' | 'interactive'
 * @param {string[]} p.stepOrder      the canonical step ids, so position in the vector is meaningful
 * @param {object} p.dwellS           {stepId: seconds} total dwell
 * @param {object} p.visibleDwellS    {stepId: seconds} dwell with hidden time removed
 * @param {object} p.revisits        {stepId: entries beyond the first} the backtrack measure
 * @param {object} p.interactions     {controlName: count}
 * @param {object} p.flags            {reducedMotion, exposureComplete, resumed, storageWritable}
 * @param {number} p.sessionSeconds   total session length in seconds
 * @param {number} p.eventCount
 */
export function encodeReturnCode({
  participantCode,
  condition,
  stepOrder,
  dwellS = {},
  visibleDwellS = {},
  revisits = {},
  interactions = {},
  flags = {},
  sessionSeconds = 0,
  eventCount = 0,
}) {
  const parts = [
    `v${RETURN_CODE_VERSION}`,
    (participantCode || 'nopid').replace(/[^A-Za-z0-9_-]/g, ''),
    condition === 'interactive' ? 'i' : 's',
    b36(sessionSeconds),
    b36(eventCount),
    // Flags as a fixed-order bit string, so a new flag appended later cannot shift the old ones.
    [
      flags.exposureComplete ? '1' : '0',
      flags.reducedMotion ? '1' : '0',
      flags.resumed ? '1' : '0',
      flags.storageWritable === false ? '0' : '1',
    ].join(''),
    stepOrder.map((s) => b36(dwellS[s] ?? 0)).join(FIELD_SEP),
    stepOrder.map((s) => b36(visibleDwellS[s] ?? 0)).join(FIELD_SEP),
    // Revisits: entries beyond the first, per step. Zero for a step read once, which is most of them,
    // so the field stays short. This is the data behind backtrack_count.
    stepOrder.map((s) => b36(revisits[s] ?? 0)).join(FIELD_SEP),
    Object.entries(interactions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${b36(v)}`)
      .join(FIELD_SEP),
  ]
  const body = parts.join(SEP)
  return `${body}${SEP}${checksum(body)}`
}

/**
 * Decode and validate. Returns {ok, reason, data}.
 *
 * The decoder lives beside the encoder rather than only in the Python analysis, so the survey
 * platform can validate a pasted code at the point of entry and ask the participant to re-paste
 * while they are still on the page. A code rejected two weeks later is a lost participant.
 */
export function decodeReturnCode(code, stepOrder) {
  if (typeof code !== 'string' || !code.includes(SEP)) {
    return { ok: false, reason: 'not-a-code' }
  }
  const trimmed = code.trim().replace(/\s+/g, '')
  const idx = trimmed.lastIndexOf(SEP)
  const body = trimmed.slice(0, idx)
  const given = trimmed.slice(idx + 1)
  if (checksum(body) !== given) {
    return { ok: false, reason: 'checksum-failed' }
  }
  const [version, pid, cond, sess, events, flagBits, dwellV, visV, revV, inter] = body.split(SEP)
  if (version !== `v${RETURN_CODE_VERSION}`) {
    return { ok: false, reason: `version-mismatch:${version}` }
  }
  const dwellArr = (dwellV || '').split(FIELD_SEP).map(unb36)
  const visArr = (visV || '').split(FIELD_SEP).map(unb36)
  if (stepOrder && dwellArr.length !== stepOrder.length) {
    return { ok: false, reason: `step-count:${dwellArr.length}!=${stepOrder.length}` }
  }
  const zip = (arr) =>
    stepOrder
      ? Object.fromEntries(stepOrder.map((s, i) => [s, arr[i] ?? 0]))
      : arr

  return {
    ok: true,
    data: {
      participantCode: pid === 'nopid' ? null : pid,
      condition: cond === 'i' ? 'interactive' : 'static',
      sessionSeconds: unb36(sess),
      eventCount: unb36(events),
      exposureComplete: flagBits[0] === '1',
      reducedMotion: flagBits[1] === '1',
      resumed: flagBits[2] === '1',
      storageWritable: flagBits[3] === '1',
      dwellS: zip(dwellArr),
      visibleDwellS: zip(visArr),
      revisits: zip((revV || '').split(FIELD_SEP).map(unb36)),
      interactions: Object.fromEntries(
        (inter || '')
          .split(FIELD_SEP)
          .filter(Boolean)
          .map((kv) => {
            const [k, v] = kv.split(':')
            return [k, unb36(v)]
          }),
      ),
    },
  }
}

/** Append the return code to the survey platform's return URL. */
export function buildReturnUrl(returnUrl, code, param = 'wviz') {
  try {
    const u = new URL(returnUrl)
    u.searchParams.set(param, code)
    return u.toString()
  } catch {
    return null
  }
}
