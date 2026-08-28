# Architecture

How the artefact is put together and why. Written for two readers: whoever returns to this codebase
after a gap, and a marker or examiner checking that a claim in the report is actually implemented.

## The shape of it

One React application renders both A/B conditions. The guided narrative is a scroll-driven,
sticky-graphic sequence of nineteen steps; the explorer is a set of layout modes over a single data
engine; and which of the two a reader gets is decided by one URL parameter read once at mount.

```
public/data/*.json          fifteen files, each declaring its own provenance in a __meta block
        |
        v
useData()                   fetches all of them, reports whether any is a synthetic placeholder
        |
        v
App.jsx                     reads the condition, builds the reducer and the logger
        |            \
        v             v
NarrativeShell        ExplorerPanel            (explorer is interactive-condition only)
  |                     |
  v                     v
ChartForStep          CrossFilterView / CompareProfiles / TimingWhatIf / OffTheChart
  |                     |
  +----------+----------+
             v
      src/vega/*.js       pure functions returning Vega-Lite JSON
             v
      AccessibleChart     role="img", four-level description, HTML data table
```

## The state machine

`src/state/appReducer.js` holds the martini-glass state: which phase the reader is in, which step is
active, which steps have been visited, the reader's profile from the handover, the two compare-mode
profiles, the cross-filter selection, the E5 wave, the E7 zoom step, and the two environment facts
(condition, reduced motion) that the telemetry needs on its first event.

The design spec puts it plainly at section B.1: martini-glass state lives in React, encodings live in
Vega-Lite. Nothing in `src/vega` holds state and nothing there reads React context, which is what
makes it possible to render two conditions from one component tree.

Two guards in the reducer are worth knowing about because they look redundant and are not.
`ENTER_EXPLORER` returns the state unchanged in the static condition, so a stray dispatch cannot
break condition parity even if a view-layer guard is later removed. And `RESTORE` deliberately drops
any persisted condition, because a returning participant must always take their arm from the URL: a
condition restored from `localStorage` would silently put someone in the wrong arm.

## Three single-source-of-truth rules

These are the rules a future change could most easily break, so they are stated here as well as in
the code comments.

**The Scrollama observer is the only path that sets step state.** Keyboard navigation and the section
list do not dispatch; they call `scrollIntoView` and let the observer fire. If two paths could set
the active step they would disagree the moment a reader used both, and the telemetry would record a
step order that never happened. The cost of the rule is real: a keyboard jump across several steps
produces a burst of `section_enter` events for steps nobody read. That is why every enter event
carries a `navigationSource` field, and why the analysis plan excludes sub-threshold dwells.

**Selection lives in the reducer, not in a Vega selection parameter.** A Vega `point` selection would
give click-to-select inside the chart, but its state would sit inside the view where the reducer, the
telemetry and the accessible chip controls cannot see it. So selection is a boolean field on each data
row and the chart reads it through a test expression. The consequence, stated rather than hidden: the
marks are not click-selectable in this build. The chips beneath the chart are the selection
interface, which is also the keyboard interface, so nothing is available by mouse that is not
available by keyboard.

**`can(condition, capability)` is the only place a condition branch is allowed.** The capability table
in `src/state/conditions.js` is transcribed from design spec section B.6. A component that decides for
itself what the static arm should show is how content parity rots. Note what is deliberately absent
from that table: the accessibility layer, because it must be identical in both arms. An affordance
present in one arm only would be a second manipulated variable and would invalidate the comparison.

## Why the Vega-Lite specs are pure functions

Every builder in `src/vega/narrativeSpecs.js` and `src/vega/explorerSpecs.js` takes data and options
and returns a plain JSON object. Three things follow.

Each spec can be pasted straight into the Vega-Lite online editor, which is how the tech stack says
each chart should be prototyped before it is wired up. A spec expressed as JSX props cannot be.

The specs are diffable. When a chart changes, the change is visible in a data structure rather than
buried in render logic.

And the `staged` option, which is the interactive condition's within-chart emphasis change (L1
pattern A6), can be audited in one place. Read the builders: `staged` only ever moves colour between
emphasis and muted. It never adds a mark or a data point, because adding data under `staged` would
break content parity and the study would then measure content volume rather than interactivity.

## Data flow and the provenance gate

`useData` fetches all fifteen files, then reads `__meta.synthetic` on each. If any file is a
placeholder the application shows a standing banner; if the set is mixed it shows a stronger warning,
because a real series beside a placeholder one invites a comparison that means nothing. The banner is
driven by the data rather than by a build flag, so it disappears by itself when real pipeline output
replaces the files and nobody has to remember to turn it off.

This is not decoration. The brief forbids inventing or approximating values, and an unlabelled
placeholder is an invented value. The banner is the mechanism that keeps the placeholder honest, and
the study protocol names its absence as a launch precondition.

## File map

| File | What it does | Where the interesting part is |
|---|---|---|
| `src/App.jsx` | Root. Reads condition, loads data, renders one of two arrangements | The static coda: the static arm gets static equivalents of E5 and E7, not nothing |
| `src/state/appReducer.js` | The martini-glass state machine | `SET_PROFILE_FIELD` seeds the explorer from the handover; `RESTORE` refuses to restore condition |
| `src/state/conditions.js` | URL parameter handling and the capability table | `readCondition` strips the parameter with `replaceState` after reading it |
| `src/data/narrative.js` | The S0 to S18 script | Every numeric claim carries a `figures` entry with a status; one claim is `withdrawn` |
| `src/data/lookup.js` | The WAS median lookup engine | `lookupMedian` drops dimensions in a fixed order until a published cell is found, and reports which |
| `src/theme.js` | Palette roles and the shared Vega config | The note on why WCAG contrast binds text and interface but not data fills |
| `src/hooks/useScrollama.js` | Scroll-step binding | `scrollToStep` moves focus as well as scroll, and does not touch state |
| `src/hooks/useSessionLogger.js` | localStorage-only telemetry | The `SCOPE` constant, which enforces the A/B parity trap in the data |
| `src/hooks/useData.js` | Data loading and the provenance gate | The mixed-provenance detection |
| `src/hooks/usePrefersReducedMotion.js` | Reduced-motion preference | The study-validity problem it creates, and why the answer is to record it |
| `src/vega/narrativeSpecs.js` | Specs for S1 to S18 | `choroplethWithRankedBarSpec`: colour for pattern, position for ranking |
| `src/vega/explorerSpecs.js` | Specs for E1.1, E1.3, E1.5, E5, E7 | `offTheChartSpec`: the stepped rescale, every frame linear and honest |
| `src/components/AccessibleChart.jsx` | The accessibility wrapper every chart goes through | Why `role="img"` is the right trade, and what it costs |
| `src/components/ChartForStep.jsx` | Registry binding step to spec, data and table | One file to audit design spec B.5 against the code |
| `src/components/NarrativeShell.jsx` | The scrollytelling shell | The live region announcing step changes |
| `src/components/StepAnnotation.jsx` | The four-level annotation layer | Same four fields feed the accessible description |
| `src/components/Handover.jsx` | S18, both arms | The static arm has no input at all, by design |
| `src/components/explorer/*.jsx` | E1.1 to E1.5, E5, E7 | `CrossFilterView`: why the panels show marginals and highlight rather than re-filter |
| `src/components/study/StudyBar.jsx` | The study harness seam | Hidden unless `?study=1`; the plain-English account of what is recorded |
| `src/components/Sources.jsx` | Sources and limitations, in the artefact | The framing statement, made openly rather than implied |

## Optional additions not built

Both are named in code comments and neither exists today. Do not describe either as implemented.

**Click-selectable marks.** Adding a Vega `point` selection whose signal dispatches into the reducer
would give click-to-select inside the charts without creating a second source of truth. It is a small
addition and it would improve the cross-filter interaction. It is not in this build.

**A demo deep-link parameter.** The frozen spec defines exactly one URL parameter, `condition`.
Explorer seed state is `localStorage` only, so the spec-native way to pre-seed a demo is to walk the
artefact beforehand in a dedicated browser profile. A demo-only deep link that seeds profile and
selection from the query string would make the viva demo more robust, and is listed in the viva pack
as an optional additive P4 item.
