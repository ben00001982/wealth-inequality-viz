import { useCallback, useEffect, useState } from 'react'
import { Button } from 'react-aria-components'
import { buildReturnUrl, encodeReturnCode } from '../../study/returnCode.js'
import { isExposureComplete } from '../../state/conditions.js'
import { stepIds } from '../../data/narrative.js'
import { EXPLORER_VIEW } from '../../state/appReducer.js'

/*
 * The dwell vector spans the narrative steps AND the explorer views.
 *
 * It used to be `stepIds` alone, S0 to S18, which meant every explorer measure reached the researcher
 * only in the pilot's raw exports and was tier two for the main sample. The explorer views are logged
 * through the same open-and-close machinery as steps, so they belong in the same vector; the static
 * arm simply reports zero for them, which is correct and is what the parity filter expects.
 */
const CODE_STEP_ORDER = [...stepIds, ...Object.values(EXPLORER_VIEW)]

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
  // Milestones come from reducer state, so a change to one re-renders this panel. Reading them from
  // the logger's ref left the gate a render behind and the static arm never opened it at all.
  const complete = isExposureComplete(state.condition, {
    visitedSteps: state.visitedSteps,
    enteredExplorer: state.milestones.enteredExplorer,
    sawClose: state.milestones.sawClose,
  })

  /*
   * The code is generated on demand, not during render.
   *
   * It used to be a useMemo over the logger summary, which looked right and was wrong in a way that
   * cost the single most wanted measure. Dwell for the section still open is computed at the moment
   * summarise() runs, and no render happens while a reader sits reading the final view. So the code
   * captured the instant E7 opened, and E7 dwell was always zero: the close, whose dwell is the
   * point of the whole zoom-out sequence.
   *
   * Generating in the handler means the code reflects the state at the moment the participant takes
   * it, which is also the only moment that means anything. A slow refresh keeps the displayed code
   * current for a reader who selects it by hand rather than pressing the button, and it is slow
   * because each regeneration walks the event list.
   */
  const generate = useCallback(() => {
    if (!participantCode) return ''
    const s = logger.summarise()
    const done = isExposureComplete(state.condition, {
      visitedSteps: state.visitedSteps,
      enteredExplorer: state.milestones.enteredExplorer,
      sawClose: state.milestones.sawClose,
    })
    return encodeReturnCode({
      participantCode,
      condition: state.condition,
      stepOrder: CODE_STEP_ORDER,
      dwellS: s.dwellS,
      visibleDwellS: s.visibleDwellS,
      revisits: s.revisits,
      interactions: s.interactions,
      flags: {
        exposureComplete: done,
        reducedMotion: state.reducedMotion,
        resumed: s.resumed,
        storageWritable: logger.writable(),
      },
      sessionSeconds: s.sessionSeconds,
      eventCount: s.eventCount,
    })
  }, [participantCode, logger, state.condition, state.reducedMotion, state.visitedSteps, state.milestones])

  const [code, setCode] = useState('')

  useEffect(() => {
    if (!participantCode) return undefined
    const released = complete || acknowledgedEarly
    if (!released) return undefined
    setCode(generate())
    const id = setInterval(() => setCode(generate()), 10000)
    return () => clearInterval(id)
  }, [participantCode, complete, acknowledgedEarly, generate])

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
                    visitedSteps: state.visitedSteps.length,
                  })
                  // Regenerate at the moment of departure: the dwell on this last view is only
                  // known now, and it is the measure the close exists to produce.
                  const fresh = generate()
                  const url = returnUrl ? buildReturnUrl(returnUrl, fresh) : null
                  window.location.assign(url ?? target)
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
                  const fresh = generate()
                  setCode(fresh)
                  try {
                    await navigator.clipboard.writeText(fresh)
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
                    visitedSteps: state.visitedSteps.length,
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
