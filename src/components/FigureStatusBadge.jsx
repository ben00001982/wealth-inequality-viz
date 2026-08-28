/**
 * Build-time figure status.
 *
 * Design spec B.2 tags every design-time figure `[verified]` or `[confirm at build]`, and the P4
 * verification pass (wealth-viz_p4-figure-confirmation-log_v1) resolved some and left others open.
 * This badge surfaces an unresolved figure while the build is in development, so an unconfirmed
 * number cannot quietly reach a study participant.
 *
 * It renders only when `import.meta.env.DEV` is true, so it is absent from the deployed artefact.
 * That is the correct trade: the guard is for the developer, and a participant seeing internal
 * provenance tags would be a confound.
 *
 * A `withdrawn` figure is a stronger state than `confirm-at-build`: it is a claim the verification
 * pass could not support at all, which has been removed rather than replaced. It is listed here so
 * the reason survives in the codebase and not only in the log.
 */
export function FigureStatusBadge({ figures }) {
  if (!import.meta.env.DEV) return null
  const open = figures?.filter((f) => f.status === 'confirm-at-build' || f.status === 'withdrawn')
  if (!open?.length) return null

  return (
    <div className="figure-status" role="note">
      <strong className="figure-status__label">Build-time check</strong>
      <ul>
        {open.map((f) => (
          <li key={f.id}>
            <code>{f.id}</code> {f.status === 'withdrawn' ? 'WITHDRAWN' : 'CONFIRM AT BUILD'}:{' '}
            {f.claim}
            {f.note ? <em> {f.note}</em> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
