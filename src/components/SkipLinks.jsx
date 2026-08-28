/**
 * Skip links.
 *
 * A scroll-driven narrative is the worst case for keyboard navigation: nineteen steps of content
 * between the top of the page and anything else, and a sticky graphic panel that a keyboard user has
 * no reason to tab through. Skip links are the standard answer and they are not optional here.
 *
 * Visible on focus rather than permanently hidden, so a sighted keyboard user can see where they are
 * going. That is the part most implementations get wrong: a skip link that never becomes visible is
 * only half a fix.
 *
 * Identical in both A/B conditions, like everything in the accessibility layer, because an
 * affordance present in one arm only would be a second manipulated variable.
 */
export function SkipLinks({ hasExplorer }) {
  return (
    <div className="skip-links">
      <a href="#narrative-start" className="skip-link">
        Skip to the story
      </a>
      <a href="#section-nav" className="skip-link">
        Skip to the section list
      </a>
      {hasExplorer && (
        <a href="#explorer" className="skip-link">
          Skip to the explorer
        </a>
      )}
      <a href="#sources" className="skip-link">
        Skip to sources and limitations
      </a>
    </div>
  )
}
