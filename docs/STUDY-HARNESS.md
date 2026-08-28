# Study harness

The seams the artefact exposes for the P5 user study, and nothing beyond them. The comprehension
instrument is not part of the artefact: it is administered around it, and it is specified in
`wealth-viz_p5-comprehension-instrument_v1`. This document covers what the build provides for it to
attach to.

Design spec section B.10 lists three seams: the condition switch, clean entry and exit boundaries
where the study can inject its pre-screen and post-screen, and the telemetry hooks. The plumbing is
the artefact's; the test items that flow through it are P5's.

## The condition switch, and its honest weakness

`readCondition` in `src/state/conditions.js` reads `?condition=static|interactive` once at mount,
falls back to `interactive` on an absent or invalid value, and then deletes the parameter and rewrites
the address with `history.replaceState`. The condition is dispatched into the reducer before anything
is logged, so it lands on the first telemetry event.

A URL parameter cannot be concealed. A participant can see it before it is stripped, and can edit it.
The protocol handles that three ways rather than pretending otherwise:

Allocation does not come from anything the participant chooses. It comes from a pre-generated
block-randomised list keyed to an entry code, so the arms stay balanced and the assignment is made
before the participant sees a link.

A switch is detectable. Condition is the first event on the log and is authoritative; any later
disagreement is evidence rather than a silent contamination.

Analysis is intention-to-treat on the as-randomised arm, with a per-protocol sensitivity analysis
reported alongside it. `wealth-viz_p5-study-protocol_v1` carries the detail.

## Event schema

Every event shares a thin envelope and then carries a type-specific payload. `SCHEMA_VERSION` is 3 and
is stamped on the session and on the export, so a mid-study schema change cannot silently produce two
incompatible datasets.

Envelope, on every event: `seq` (a monotonic sequence number, so out-of-order or duplicated events are
detectable), `type`, `t` (whole seconds since session start), and `scope`.

| Event | Payload | When |
|---|---|---|
| `session_start` | `condition`, `reducedMotion`, `schemaVersion` | Once, first event on the log |
| `session_resumed` | `condition`, `priorEvents` | A returning reader with an existing log |
| `section_enter` | `sectionId`, `navigationSource` | A step enters the viewport |
| `section_exit` | `sectionId`, `dwellS`, `visibleDwellS` | A step leaves, or is superseded |
| `control_interaction` | `control`, plus per-control detail | Any control is used |
| `explorer_phase_entered` | `view` | The explorer is entered, and on each view change |
| `visibility_change` | `hidden` | The tab is backgrounded or foregrounded |
| `session_complete` | `visitedSteps` | The participant marks the session complete |
| `export` | `eventCount` | The participant downloads their file |

`navigationSource` is `scroll` for an observed entry and names the control for a jump. It exists
because the observer is the only path that sets step state, so a keyboard jump across several steps
produces a burst of enter events for steps nobody read. The analysis plan excludes sub-threshold
dwells on that basis.

## The scope field and the parity trap

`scope` is one of `both`, `interactive-only` or `harness`, and it is the mechanism that stops an
illegitimate comparison being made by accident.

The static arm cannot emit explorer interactions, because it has no explorer. So any cross-condition
comparison of interaction counts is meaningless by construction, not merely underpowered. Tagging
each event with its scope means the analysis filters on a field rather than on somebody remembering
the rule: cross-arm comparisons use `both` events only, and interaction breadth earns its keep in
within-condition analysis of the interactive arm.

`harness` marks the measurement wrapper, which is identical in both arms and is therefore never part
of the manipulation.

## What is not logged, and why

Three things the data management plan ruled out and which therefore do not exist in the schema:
absolute wall-clock timestamps, viewport pixel dimensions, and the user-agent string. Each was a
quasi-identifier that bought nothing the analysis needed.

Durations are quantised to whole seconds for the same reason. A millisecond-precision dwell vector
across nineteen steps is close to a fingerprint, and the analysis does not need that resolution. The
telemetry analysis plan accepts the quantisation explicitly and carries the consequence: the
pass-through floor for excluding a step as unread becomes one second rather than 500 milliseconds,
because the old value falls inside the rounding interval.

Times are offsets from session start, never clock times. `performance.now` is used rather than
`Date.now` because it is monotonic, so a system clock correction mid-session cannot produce a negative
dwell.

The session identifier is a random UUID, not a hash of anything about the participant, so it cannot be
reversed into an identity. Whether it or a study-issued participant number is the join key to the
questionnaire responses is an open item at protocol section 12.2.

## Visibility

A backgrounded tab keeps accumulating elapsed time while nobody is reading. The logger tracks hidden
intervals and reports `visibleDwellS` alongside total `dwellS`, so the difference is auditable rather
than invisible.

Visibility is an upper bound on attention, not a proxy for it. A visible tab with the reader looking
out of the window produces the same number as a visible tab being read closely. The analysis plan says
so and does not treat dwell as engagement.

## Export

Nothing leaves the browser until the participant presses the download button. There is no server to
transmit to, which is the stack constraint and also the strongest data-protection position available:
nothing in transit to intercept, no store to breach.

The exported file contains the session identifier, the schema version, the condition, the
reduced-motion flag and the full event array. It is plain JSON, formatted to be readable, so a
participant can open it and see exactly what they are sending before they send it. That is a
deliberate consent property, not a convenience.

`localStorage` keys: `wviz.session.v3` for the event log, `wviz.state.v3` for the explorer state that
lets a returning reader find the view where they left it. Both are versioned, so a schema change
cannot half-read an old log.

## The two ways telemetry is lost

**Storage is not writable.** Private browsing, a full quota, or a browser set to block site data.
Every read and write is wrapped, so the artefact still works and only the telemetry is lost. The
study bar shows a warning when this happens and tells the participant to say so before continuing,
because a session that records nothing is better identified at the start than at the analysis stage.

**The participant never presses export.** The commonest loss, and it cannot be engineered away
without a server. The protocol handles it by putting the export step inside the guided procedure with
its own screen rather than leaving it to a footer button, and by treating telemetry-missing
participants as retained for the primary comprehension test with the cost stated, since the
comprehension instrument is captured separately. Exclusion rules and thresholds are fixed in advance
in `wealth-viz_p5-telemetry-analysis-plan_v1`, before any data exists.
