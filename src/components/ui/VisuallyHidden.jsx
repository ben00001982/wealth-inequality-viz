/**
 * Content available to assistive technology and not painted on screen.
 *
 * The clip-rect technique rather than `display: none` or `visibility: hidden`, both of which remove
 * the element from the accessibility tree as well as from the page, and rather than a negative
 * text-indent, which breaks in right-to-left contexts. `white-space: nowrap` prevents a one-pixel
 * box from wrapping its text into an unreadable column in some engines.
 *
 * React-aria ships an equivalent primitive. This local one is kept so the technique is visible in
 * the codebase and defensible in the viva, rather than being an opaque import.
 */
export function VisuallyHidden({ as: Tag = 'span', children, ...rest }) {
  return (
    <Tag {...rest} className="visually-hidden">
      {children}
    </Tag>
  )
}
