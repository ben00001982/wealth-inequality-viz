/**
 * The provenance banner.
 *
 * The pipeline has not yet run against real Office for National Statistics downloads, so the files
 * in public/data are synthetic placeholders with the right shape and the wrong numbers. That is a
 * legitimate way to build and test a front end before data access completes. It becomes illegitimate
 * the moment a placeholder is shown without saying so, because the brief's hard constraint is that
 * values are never invented or approximated.
 *
 * So the banner is not decoration and it is not a development aid: it ships. It disappears by itself
 * when the real pipeline output replaces the files, because it is driven by the `__meta.synthetic`
 * flag each file carries rather than by a build-time switch someone has to remember to flip.
 *
 * The study cannot run while this banner is visible. That is deliberate, and it is stated in the
 * study protocol as a launch precondition.
 */
export function SyntheticDataBanner({ synthetic, mixed }) {
  if (!synthetic) return null
  return (
    <div className="provenance-banner" role="status">
      <strong>Placeholder data.</strong> The figures in these charts are synthetic values generated
      for development. They have the right shape and the wrong numbers, and they must not be read as
      findings. The real series come from the Office for National Statistics Wealth and Assets
      Survey, the UK House Price Index and the English Housing Survey once the pipeline has run
      against them: see <code>docs/DATA-PIPELINE.md</code>.
      {mixed && (
        <>
          {' '}
          <strong>Warning:</strong> this build is serving a mix of real and synthetic files, which is
          worse than either. Comparing a real series against a placeholder one produces a number that
          means nothing. Re-run the pipeline so all files come from one source.
        </>
      )}
    </div>
  )
}
