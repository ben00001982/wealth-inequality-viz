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
export function StudyBar({ state, logger, participantCode, pidRejected, onComplete }) {
  const [exported, setExported] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  /*
   * Shown when a participant code is present, or when ?study=1 is set for a researcher walkthrough.
   *
   * Previously it was gated on ?study=1 alone, which had two consequences the protocol did not know
   * about: the redirect the protocol specifies does not set that flag, so no participant would ever
   * have seen the export control step 13 told them to press; and when the flag WAS set the bar
   * printed the condition in plain text, so fixing the first problem would have destroyed allocation
   * concealment. Now the arm is shown only on an explicit researcher walkthrough, never to a
   * participant, and the participant's route out is the ReturnPanel at the foot of the page.
   */
  const params = new URLSearchParams(window.location.search)
  const researcherView = params.get('study') === '1'
  if (!researcherView && !participantCode && !pidRejected) return null

  return (
    <div className="study-bar">
      <div className="study-bar__row">
        <span className="study-bar__tag">{researcherView ? 'Researcher view' : 'Study session'}</span>
        {/* The arm is never shown to a participant: printing it would defeat concealment. */}
        {researcherView && (
          <span>
            Condition: <strong>{state.condition}</strong>
          </span>
        )}
        {pidRejected && (
          <span className="study-bar__warn">
            This link is not complete, so nothing is being recorded. Please go back to the survey and
            use the link it gave you.
          </span>
        )}
        {!pidRejected && !participantCode && researcherView && (
          <span className="study-bar__warn">
            No participant code, so recording is off. Add a pid parameter to record a session.
          </span>
        )}
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
        {/* The file export is retained as a researcher fallback only. The participant's route is the
            return code at the foot of the page, which needs no file operation. */}
        {researcherView && (
          <Button
            className="button button--primary"
            onPress={() => {
              logger.exportLog()
              setExported(true)
            }}
          >
            {exported ? 'Download again' : 'Download the raw log'}
          </Button>
        )}
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
            All of it stays in this browser while you read. Nothing is transmitted, because there is
            no server to transmit to. At the end you are given a short code, which you can read, that
            carries only those figures back to the survey. There is no file to find and no file to
            send.
          </p>
        </div>
      )}
    </div>
  )
}
