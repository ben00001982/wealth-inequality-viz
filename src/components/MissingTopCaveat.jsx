import { CAVEAT_SHORT, CAVEAT_ACCREDITATION } from '../data/narrative.js'

/**
 * The recurring missing-top caveat.
 *
 * Design spec B.7 requires this on every chart that reports a wealth level or share, in both
 * conditions: S1, S6, S10, S15 and every explorer wealth view. It is a component rather than a
 * string copied into each chart so that the wording cannot drift between steps, and so a reviewer can
 * grep for one import to audit the placement.
 *
 * Two pieces of evidence sharpen it and both are stated rather than softened. The same work that
 * produced the £800bn estimate used the Sunday Times Rich List to show the survey understates the
 * very top, lifting the top-1% share from about 18% to about 23%. And the survey's own standing has
 * weakened: the Office for Statistics Regulation suspended its accredited status in June 2025. Both
 * reinforce the artefact's message rather than undermining it, because the headline figures are
 * floors.
 */
export function MissingTopCaveat({ variant = 'short', className = '' }) {
  return (
    <aside className={`caveat ${className}`} aria-label="Data limitation">
      <p className="caveat__text">{CAVEAT_SHORT}</p>
      {variant === 'full' && <p className="caveat__text">{CAVEAT_ACCREDITATION}</p>}
    </aside>
  )
}
