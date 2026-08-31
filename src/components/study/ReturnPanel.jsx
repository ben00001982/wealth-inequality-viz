import { useMemo, useState } from 'react'
import { Button } from 'react-aria-components'
import { buildReturnUrl, encodeReturnCode } from '../../study/returnCode.js'
import { isExposureComplete } from '../../state/conditions.js'
import { stepIds } from '../../data/narrative.js'

/**
 * The end of the study session: how the participant gets back to the survey with their data.
 *
 * This replaces the protocol's step 13, which asked the participant to press a download button, find
 * a JSON file and send it to the researcher. That step was going to lose data from every participant
 * who declined, forgot, or could not find their downloads folder, and those are not random: a
 * participant who struggles with a file operation is plausibly also one who found the artefact hard,
 * so the loss would have been correlated with the outcome.
 *
 * Two routes, in order of preference.
 *
 * If the survey platform supplied a return URL, the button sends the participant back with the code
 * already appended as a query parameter. The platform captures it on arrival and the participant does
 * nothing at all. This is the route the protocol should use.
 *
 * Otherwise the code is shown for copying and pasting into a single survey field. The copy button
 * uses the clipboard API with a select-all fallback, and the code stays visible either way, because a
 * clipboard write can fail silently in an iframe and a participant who cannot see the code has
 * nothing to fall back on.
 *
 * The exposure gate. The code is not released until the reader has reached the end of what their arm
 * has to show, which is the exposure floor the protocol declares and previously had no data for. It
 * is not a punishment: a participant who stops early still gets the code, with the incomplete flag
 * set, after an explicit acknowledgement. Blocking them entirely would strand them mid-study with no
 * way to claim payment, which is its own ethics problem.
 */
export function ReturnPanel({ state, logger, participantCode, returnUrl }) {
  const [copied, setCopied] = useState(false)
  const [acknowledgedEarly, setAcknowledgedEarly] = useState(false)

  /*
   * Every hook runs before the participant-code check.
   *
   * The early return for a non-study visitor has to come AFTER the hooks, not before, or the hook
   * order differs between renders the moment a code is present and React throws. The summarise call
   * is cheap and returns empty structures when the logger is inert, so running it unconditionally
   * costs nothing.
   */
  const summary = logger.summarise()
  // Milestones come from reducer state, so a change to one re-renders this panel. Reading them from
  // the logger's ref left the gate a render behind and the static arm never opened it at all.
  const complete = isExposureComplete(state.condition, {
    visitedSteps: state.visitedSteps,
    enteredExplorer: state.milestones.enteredExplorer,
    sawClose: state.milestones.sawClose,
  })

  const code = useMemo(
    () =>
      !participantCode
        ? ''
        : encodeReturnCode({
            participantCode,
            condition: state.condition,
            stepOrder: stepIds,
            dwellS: summary.dwellS,
            visibleDwellS: summary.visibleDwellS,
            interactions: summary.interactions,
            flags: {
              exposureComplete: complete,
              reducedMotion: state.reducedMotion,
              resumed: summary.resumed,
              storageWritable: logger.writable(),
            },
            sessionSeconds: summary.sessionSeconds,
            eventCount: summary.eventCount,
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [participantCode, state.condition, state.reducedMotion, complete, JSON.stringify(summary)],
  )

  // Not a study session. A member of the public who finds the artefact sees the artefact.
  if (!participantCode) return null

  const released = complete || acknowledgedEarly
  const target = returnUrl ? buildReturnUrl(returnUrl, code) : null

  return (
    <section className="return-panel" aria-labelledby="return-heading">
      <h2 id="return-heading">Finished? Back to the questions</h2>

      {!released && (
        <>
          <p>
            There is a little more to see before you go back.{' '}
            {state.condition === 'interactive'
              ? 'Scroll to the end of the story, then open the explorer and work through to the last view, "Off the chart".'
              : 'Scroll to the end of the story, including the two comparisons after it.'}
          </p>
          <p className="return-panel__note">
            If you would rather stop here, that is completely fine and you will still be paid. Press
            the button below and we will note that you finished early.
          </p>
          <Button
            className="button button--ghost"
            onPress={() => {
              setAcknowledgedEarly(true)
              logger.log('early_exit_acknowledged', { scope: 'harness' })
            }}
          >
            I would rather stop here
          </Button>
        </>
      )}

      {released && (
        <>
          {!complete && (
            <p className="return-panel__note">
              Recorded as finished early. That is not a problem and it does not affect your payment.
            </p>
          )}

          {target ? (
            <>
              <p>
                Press this to go back to the questions. Your answers about how you read the page go
                with you automatically, and there is no file to send.
              </p>
              <Button
                className="button button--primary"
                onPress={() => {
                  logger.sessionComplete({
                    exposureComplete: complete,
                    route: 'redirect',
                    visitedSteps: summary.visitedSteps.length,
                  })
                  window.location.assign(target)
                }}
              >
                Back to the questions
              </Button>
            </>
          ) : (
            <>
              <p>
                Copy the code below and paste it into the box on the next survey page. It contains
                which sections you looked at and for how long. There is no name, no email and no free
                text in it.
              </p>
              <div className="return-panel__code">
                <label htmlFor="return-code">Your code</label>
                <textarea
                  id="return-code"
                  readOnly
                  rows={3}
                  value={code}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <Button
                className="button button--primary"
                onPress={async () => {
                  try {
                    await navigator.clipboard.writeText(code)
                    setCopied(true)
                  } catch {
                    // Clipboard writes fail silently in some frames. The code is on screen anyway,
                    // and the textarea selects on focus, so there is always a manual route.
                    setCopied(false)
                    document.getElementById('return-code')?.select()
                  }
                  logger.sessionComplete({
                    exposureComplete: complete,
                    route: 'paste',
                    visitedSteps: summary.visitedSteps.length,
                  })
                }}
              >
                {copied ? 'Copied' : 'Copy my code'}
              </Button>
              {copied && (
                <p className="return-panel__note" role="status">
                  Copied. Now go back to the survey tab and paste it in.
                </p>
              )}
            </>
          )}

          {!logger.writable() && (
            <p className="return-panel__warn">
              This browser would not let the page store anything, so the code below records almost
              nothing. Please tell the researcher when you hand it in.
            </p>
          )}
        </>
      )}
    </section>
  )
}
