/**
 * The per-step annotation layer (pattern A7).
 *
 * Structured to the Lundgard and Satyanarayan (2022) four-level semantic model, and structured
 * visibly rather than as a paragraph, because the levels do different jobs. Level 1 and 2 are
 * scaffolding for a reader who does not read charts fluently, and no statistical literacy is
 * assumed anywhere. Level 3 is the single message the step exists to carry. Level 4 is the argument.
 *
 * The same text feeds the accessible description in AccessibleChart, so the visible annotation and
 * the screen-reader description cannot drift apart. That is the point of holding the annotation as
 * four fields rather than as prose.
 *
 * Identical in both conditions. Design spec B.6 lists per-step annotation as present with identical
 * text in the static and interactive arms, so this component takes no condition prop.
 */
export function StepAnnotation({ step }) {
  const a = step.annotation
  return (
    <div className="annotation">
      <h3 className="annotation__message">{step.message}</h3>
      <dl className="annotation__levels">
        <div className="annotation__level">
          <dt>What this shows</dt>
          <dd>{a.whatItIs}</dd>
        </div>
        <div className="annotation__level">
          <dt>How to read it</dt>
          <dd>{a.howToRead}</dd>
        </div>
        <div className="annotation__level annotation__level--key">
          <dt>The key fact</dt>
          <dd>{a.keyFact}</dd>
        </div>
        <div className="annotation__level">
          <dt>Why it matters</dt>
          <dd>{a.whyItMatters}</dd>
        </div>
      </dl>
    </div>
  )
}
