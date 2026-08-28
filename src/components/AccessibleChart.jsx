import { useId, useMemo } from 'react'
import { VegaEmbed } from 'react-vega'
import { DataTable } from './DataTable.jsx'
import { VisuallyHidden } from './ui/VisuallyHidden.jsx'

/**
 * The accessibility wrapper every chart in the artefact goes through.
 *
 * The problem this solves. Vega-Lite renders to canvas or SVG. Canvas is a single opaque bitmap to
 * assistive technology, and even the SVG renderer produces a mark-level tree that a screen reader
 * reads as a meaningless list of shapes. Neither is a chart a blind participant can use. So the
 * chart is presented as a labelled image with a description, and the underlying numbers are
 * available as a real HTML table.
 *
 * Four things are load-bearing here:
 *
 * 1. `renderer: 'svg'`. Canvas is faster but forecloses every option; SVG at least keeps the marks
 *    in the accessibility tree and makes the output inspectable and printable.
 * 2. `role="img"` plus `aria-labelledby` and `aria-describedby` on the container. This deliberately
 *    collapses the internal mark tree, which is the point: an opaque labelled image with a good
 *    description beats a transparent pile of unlabelled paths. Note the consequence, because it must
 *    not be double-counted in the audit: role="img" suppresses Vega's own internal ARIA, so Vega's
 *    aria output cannot also be claimed as a mitigation.
 * 3. The four-level description (Lundgard and Satyanarayan, 2022). Level 1 is what the chart is,
 *    level 2 is how to read it, level 3 is the key fact, level 4 is why it matters. The annotation
 *    text in src/data/narrative.js is written to exactly this structure, so the visible annotation
 *    and the accessible description are the same content rather than two things that drift apart.
 * 4. The data table. Available to everyone, not hidden behind a screen-reader-only class by default,
 *    because a sighted participant who cannot read a colour scale needs it too. It is collapsed, not
 *    concealed.
 *
 * PARITY. This wrapper is imported by both A/B conditions and is identical in both. An accessibility
 * affordance present in only one arm would be a second manipulated variable and would invalidate the
 * comparison. That is why the component takes no `condition` prop: there is nothing for it to branch on.
 */
export function AccessibleChart({
  spec,
  title,
  description,
  tableRows,
  tableColumns,
  actions = false,
  className = '',
  onEmbed,
}) {
  const baseId = useId()
  const titleId = `${baseId}-title`
  const descId = `${baseId}-desc`

  // Vega-Lite's `autosize` with a container width is what makes the charts reflow rather than
  // overflow. A concat or facet spec cannot take a container width at the top level, so those specs
  // set explicit widths per sub-view and this wrapper leaves their sizing alone.
  const isComposite = Boolean(spec.hconcat || spec.vconcat || spec.facet || spec.concat)
  const resolvedSpec = useMemo(
    () =>
      isComposite
        ? spec
        : { ...spec, autosize: { type: 'fit', contains: 'padding', resize: true } },
    [spec, isComposite],
  )

  // react-vega 8 exposes a single VegaEmbed component over vega-embed, rather than the separate
  // <Vega> and <VegaLite> components of version 7. Renderer and action-menu choices move into the
  // `options` object. Data stays inside the spec, which is where the spec builders in src/vega
  // already put it, so nothing else changes.
  const options = useMemo(
    () => ({ renderer: 'svg', actions, downloadFileName: 'wealth-inequality-chart' }),
    [actions],
  )

  return (
    <figure className={`chart ${className}`}>
      <div
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="chart__canvas"
      >
        <VegaEmbed spec={resolvedSpec} options={options} onEmbed={onEmbed} />
      </div>

      <VisuallyHidden id={titleId}>{title}</VisuallyHidden>
      <VisuallyHidden id={descId}>{description}</VisuallyHidden>

      {tableRows?.length > 0 && (
        <details className="chart__table">
          <summary>Show the numbers behind this chart</summary>
          <DataTable caption={title} rows={tableRows} columns={tableColumns} />
        </details>
      )}
    </figure>
  )
}

/**
 * Build a four-level description string from a narrative step's annotation.
 *
 * Kept here rather than in the data file so the ordering is enforced in one place: what it is, how
 * to read it, the key fact, why it matters. A description that opens with the key fact reads well to
 * a sighted skim-reader and badly to a screen-reader user, who has no chart to orient against.
 */
export function describeStep(step) {
  const a = step.annotation
  return [a.whatItIs, a.howToRead, a.keyFact, a.whyItMatters].filter(Boolean).join(' ')
}
