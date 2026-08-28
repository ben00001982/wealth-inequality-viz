import { useState } from 'react'
import { Button } from 'react-aria-components'

/**
 * The study harness seam.
 *
 * Design spec B.10 is explicit that the comprehension instrument is not part of the artefact: it is
 * administered around it by the P5 study design and would not appear in a public-facing build. What
 * the artefact must provide is the seams the harness attaches to, and this component is where they
 * are gathered so a reviewer can see all of them in one file:
 *
 *   1. The condition switch, read from the URL at mount and logged as the first telemetry event.
 *   2. Clean entry and exit boundaries, so the harness can inject its pre-screen before S0 and its
 *      post-screen after the close.
 *   3. The participant-triggered telemetry export.
 *
 * The bar is hidden unless `?study=1` is present, so a member of the public who finds the artefact
 * sees the artefact and not the apparatus. The condition parameter is not what gates it: a
 * participant is in a condition whether or not they can see the harness.
 */
export function StudyBar({ state, logger, onComplete }) {
  const [exported, setExported] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  const params = new URLSearchParams(window.location.search)
  if (params.get('study') !== '1') return null

  return (
    <div className="study-bar">
      <div className="study-bar__row">
        <span className="study-bar__tag">Study harness</span>
        <span>
          Condition: <strong>{state.condition}</strong>
        </span>
        <span>Events: {logger.eventCount()}</span>
        <span>Reduced motion: {state.reducedMotion ? 'on' : 'off'}</span>
        {!logger.writable() && (
          <span className="study-bar__warn">
            Local storage is not writable in this browser, so nothing is being recorded. Tell the
            researcher before continuing.
          </span>
        )}
        <Button className="button button--ghost" onPress={() => setShowDetail((v) => !v)}>
          {showDetail ? 'Hide detail' : 'What is recorded?'}
        </Button>
        <Button
          className="button"
          onPress={() => {
            logger.sessionComplete({ visitedSteps: state.visitedSteps.length })
            onComplete?.()
          }}
        >
          Mark session complete
        </Button>
        <Button
          className="button button--primary"
          onPress={() => {
            logger.exportLog()
            setExported(true)
          }}
        >
          {exported ? 'Download again' : 'Download my session file'}
        </Button>
      </div>

      {showDetail && (
        <div className="study-bar__detail">
          <p>
            Which sections you reached and how long each was on screen, which controls you used, and
            which of the two versions you were shown. No name, no email, no address, no IP address
            and no free text. Times are recorded to the nearest second as offsets from the start of
            the session, never as clock times.
          </p>
          <p>
            All of it stays in this browser until you press the download button. Nothing is
            transmitted while you read, because there is no server to transmit to. You then send the
            downloaded file to the researcher yourself, which means you can open it and see exactly
            what it contains first.
          </p>
        </div>
      )}
    </div>
  )
}
