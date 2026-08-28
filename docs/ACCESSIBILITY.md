# Accessibility

The WCAG 2.1 AA position for this artefact, written so it can serve as the report's accessibility
appendix. The design-time companion is `wealth-viz_p3-accessibility_v1` and the practice-level
treatment is the learning note `2026-08-24_L7-accessibility-in-practice_v1`.

## The hard problem

Vega-Lite renders to canvas or to SVG. Canvas is a single opaque bitmap to assistive technology. SVG
is better only in that the marks exist in the accessibility tree, where a screen reader reads them as
a meaningless list of shapes. Neither is a chart a blind reader can use, and no amount of ARIA on
individual marks fixes it, because the information in a chart is in the relationships between marks
rather than in any one of them.

`src/components/AccessibleChart.jsx` is the answer, and every chart in the artefact goes through it.
Four things in it are load-bearing.

**The SVG renderer.** Canvas is faster and forecloses every other option. SVG keeps the output
inspectable and printable and leaves the door open.

**`role="img"` with `aria-labelledby` and `aria-describedby` on the container.** This deliberately
collapses the internal mark tree, which is the point: an opaque labelled image with a good
description beats a transparent pile of unlabelled paths. There is a cost, and it must not be
double-counted in the audit: `role="img"` suppresses Vega's own internal ARIA output, so Vega's
`aria` support cannot also be claimed as a second mitigation. It is one mitigation, not two.

**The four-level description.** Lundgard and Satyanarayan (2022): what the chart is, how to read it,
the key fact, why it matters. The annotation text in `src/data/narrative.js` is written to exactly
that structure, and `describeStep` concatenates the same four fields that `StepAnnotation` renders
visibly. So the visible annotation and the accessible description are the same content rather than
two things that drift apart, which is the usual failure mode of alt text.

The ordering matters and is enforced in one place. A description that opens with the key fact reads
well to a sighted skim-reader and badly to a screen-reader user, who has no chart to orient against.

**The data table.** A real HTML table with a caption, a header row with `scope`, and formatted cells,
beneath every chart. Available to everyone rather than hidden behind a screen-reader-only class,
because a sighted reader who cannot separate a colour scale needs it too. It is collapsed in a
`details` element, not concealed. This is what lets the artefact claim 1.4.1 and 1.3.1 rather than
merely assert them.

## Keyboard operability, control by control

| Control | Component | How it works |
|---|---|---|
| Skip links | `SkipLinks.jsx` | Visible on focus, not permanently hidden. Four targets including the section list and the sources |
| Section navigation | `NarrativeShell.jsx` | Native buttons. Scrolls and lets the observer set state, then moves focus to the step |
| Scroll steps | `useScrollama.js` | `scrollToStep` sets `tabindex="-1"` on the step and focuses it, so the next Tab continues from where the reader is looking |
| Handover selects | `Handover.jsx` via React-aria `Select` | Enter to open, arrows to move, Enter to choose, focus returns to the trigger. Verified by keyboard in the smoke test |
| Cross-filter chips | `ExplorerPanel.jsx` | Native buttons with `aria-pressed`. Toggle semantics, because a filter can be cleared by pressing the active one again |
| Profile fields | `CompareProfiles.jsx` | Native `select` elements inside labels |
| Head-start slider | React-aria `Slider` | Arrow keys, Home and End, with the value announced through `SliderOutput` |
| E5 wave selection | `TimingWhatIf.jsx` | Native buttons in a labelled group |
| E7 stepper | `OffTheChart.jsx` | Two real buttons with a live position readout, not a scroll-driven effect |
| Telemetry export | `StudyBar.jsx` | Native button |

React-aria supplies the interaction model, the ARIA wiring and the focus management for the listbox
and slider patterns, which is a great deal of behaviour that is easy to get subtly wrong by hand:
type-ahead, wrap behaviour, the relationship between a trigger's accessible name and its selected
value, returning focus on close. What it does not supply is the visible focus indicator or the
contrast of the styling. Those are ours.

## Focus, and the two-tone ring

`:focus-visible` in `src/index.css` draws a white inner ring and a dark blue outer ring. A
single-colour ring fails 1.4.11 against one background or the other: a dark ring disappears on a dark
choropleth fill, a light ring disappears on the page. Two tones satisfy both at the cost of looking
slightly heavier than a designer would choose.

## The live region

A sticky graphic that changes as the reader scrolls is invisible to a screen-reader user: the page has
not navigated, so nothing is announced. `NarrativeShell` writes the active step's message into a
polite `aria-live` region, so the change is spoken. Without this the guided narrative would be
operable and incomprehensible.

## Reflow, text spacing, forced colours

Text is sized in rem throughout, so 1.4.4 resize and 1.4.12 text spacing hold without a separate
stylesheet. Below a sixty-rem viewport the two-panel layout collapses to a single column with the
graphic panel sticky above the text, which is 1.4.10 reflow at 320 CSS px. Wide content scrolls inside
its own container rather than pushing the page sideways.

`forced-colors: active` is handled explicitly rather than left to the browser, because a sticky
scrollytelling layout degrades badly under Windows high contrast. Selected states keep a border so
they remain distinguishable when the OS palette overrides the fill, and the focus ring falls back to
`Highlight`.

## prefers-reduced-motion, and the study-validity problem

This is the most interesting thing in this document.

Honouring the preference is not optional, both because of 2.3.3 and because of the people who set it.
But in this artefact the interactive condition's staged within-chart transitions are part of the
manipulation (design spec section B.6, L1 pattern A6). Silently disabling them puts that participant
in an unlabelled third condition: interactive controls, static transitions. They are then neither arm.

The resolution is not to override the preference. It is to record it. `usePrefersReducedMotion` reads
the media query and the value is written onto the first telemetry event, so the analysis can report
how many participants in each arm had reduced motion set, and can treat it as a covariate or an
exclusion. The decision must be made in advance in `wealth-viz_p5-telemetry-analysis-plan_v1` rather
than after seeing the numbers.

## Audit

Status honestly distinguishes what has been exercised in a browser from what has only been designed
for. The browser column reflects a headless Chromium smoke run of both conditions across all nineteen
steps and all four explorer views, with the handover driven by keyboard only.

| Criterion | Level | How it is met | Status |
|---|---|---|---|
| 1.1.1 Non-text content | A | `role="img"` with a four-level description; data table alternative | Verified in browser |
| 1.3.1 Info and relationships | A | Real tables with scope; fieldsets with legends; labelled groups | Verified in browser |
| 1.3.2 Meaningful sequence | A | DOM order follows reading order; sticky panel precedes step text | Verified in browser |
| 1.4.1 Use of colour | A | Every choropleth paired with a ranked bar; selection shown by outline; tables everywhere | Verified in browser |
| 1.4.3 Contrast (minimum) | AA | Palette roles from ColorBrewer and Okabe and Ito | Designed; needs a measured pass |
| 1.4.4 Resize text | AA | rem sizing throughout | Verified in browser |
| 1.4.10 Reflow | AA | Single-column collapse; charts scroll in their own container | Verified in browser |
| 1.4.11 Non-text contrast | AA | Two-tone focus ring; bordered controls | Designed; needs a measured pass |
| 1.4.12 Text spacing | AA | No fixed line heights on body text | Designed |
| 1.4.13 Content on hover or focus | AA | Vega tooltips are dismissable and do not obscure the trigger | Not yet verified |
| 2.1.1 Keyboard | A | Every control is a native button, select, or React-aria primitive | Verified in browser |
| 2.1.2 No keyboard trap | A | No custom focus containment anywhere | Verified in browser |
| 2.2.2 Pause, stop, hide | A | No autoplaying motion exists to pause | Not applicable |
| 2.3.3 Animation from interactions | AAA | Reduced motion honoured, and recorded | Verified in browser. Above target, adopted deliberately |
| 2.4.1 Bypass blocks | A | Skip links to four targets | Verified in browser |
| 2.4.3 Focus order | A | `scrollToStep` moves focus with the scroll | Verified in browser |
| 2.4.7 Focus visible | AA | Two-tone ring on `:focus-visible` | Verified in browser |
| 3.2.1 On focus | A | Nothing changes context on focus | Verified in browser |
| 3.3.2 Labels or instructions | A | Every input labelled; the handover states what happens to the data | Verified in browser |
| 4.1.2 Name, role, value | A | React-aria for composite widgets; `aria-pressed` on toggles | Verified in browser |
| 4.1.3 Status messages | AA | Polite live regions for step changes and for lookup results | Verified in browser |

The three criteria most often missed in data visualisation work are 1.4.11, 1.4.13 and 4.1.3. Two are
addressed and 1.4.13 is the one still to check.

## Testing workflow

Executable by one person in about an hour.

Run axe DevTools and Lighthouse on both conditions. Do a keyboard-only pass from the top of the page
to the end of the explorer without touching the mouse, which is the test that catches focus-order
problems no automated tool sees. Do a screen-reader pass with NVDA on Windows or VoiceOver on macOS,
listening specifically for whether the chart descriptions are useful rather than merely present. Zoom
to 200% and then 400% and check reflow. Turn on Windows high contrast. Set the operating system
reduced-motion preference and confirm both that the transitions stop and that the flag reaches the
telemetry.

## Parity

Everything in this document applies identically to both A/B conditions, and that is enforced
structurally rather than by intention: `AccessibleChart`, `StepAnnotation`, `SkipLinks` and the whole
of `index.css` are shared imports, and `AccessibleChart` takes no `condition` prop because there is
nothing for it to branch on. An accessibility affordance present in one arm only would be a second
manipulated variable, and the comprehension comparison would no longer be a comparison of
interactivity.
