import { useCallback, useEffect, useRef } from 'react'
import { useScrollama } from '../hooks/useScrollama.js'
import { steps, stepById, blocks } from '../data/narrative.js'
import { StepAnnotation } from './StepAnnotation.jsx'
import { ChartForStep, SYNTHESIS_STEPS } from './ChartForStep.jsx'
import { MissingTopCaveat } from './MissingTopCaveat.jsx'
import { FigureStatusBadge } from './FigureStatusBadge.jsx'
import { Handover } from './Handover.jsx'

/**
 * The guided neck: the scroll-driven, sticky-graphic narrative, S0 to S18.
 *
 * Layout is the standard scrollytelling arrangement: a sticky graphic panel on one side, a column of
 * step blocks that scroll past it on the other. Scrollama observes the step blocks and reports
 * entry and exit; the sticky panel renders whatever the active step's chart is.
 *
 * The rule from useScrollama holds here: the observer is the only thing that sets the active step.
 * The in-page step navigation scrolls and lets the observer fire, so there is exactly one path to
 * state and the telemetry cannot record an order that never happened.
 */
export function NarrativeShell({ state, dispatch, data, logger, readerValue }) {
  const { condition, activeStep, reducedMotion } = state
  const lastEntered = useRef(null)

  const onStepEnter = useCallback(
    (stepId) => {
      if (lastEntered.current === stepId) return
      lastEntered.current = stepId
      dispatch({ type: 'STEP_ENTER', step: stepId })
      logger.sectionEnter(stepId, 'scroll')
    },
    [dispatch, logger],
  )

  const onStepExit = useCallback(
    (stepId) => {
      logger.sectionExit(stepId)
    },
    [logger],
  )

  const { scrollToStep } = useScrollama({ stepSelector: '.step', offset: 0.55, onStepEnter, onStepExit })

  // Announce the active step to assistive technology. A sticky graphic that changes silently is
  // invisible to a screen-reader user: the page has not navigated, so nothing is announced by
  // default. A polite live region is the fix.
  const liveRef = useRef(null)
  useEffect(() => {
    const step = stepById[activeStep]
    if (liveRef.current && step) {
      liveRef.current.textContent = `${step.message}`
    }
  }, [activeStep])

  const active = stepById[activeStep] ?? steps[0]

  return (
    <div className="narrative">
      <nav className="narrative__nav" aria-label="Sections of this story">
        <ol>
          {blocks.map((b) => {
            const first = steps.find((s) => s.block === b.id)
            return (
              <li key={b.id}>
                <button
                  type="button"
                  className={active.block === b.id ? 'is-current' : ''}
                  aria-current={active.block === b.id ? 'true' : undefined}
                  onClick={() => {
                    scrollToStep(first.id, { reducedMotion })
                    // Deliberately no dispatch here. See useScrollama: the observer owns the state.
                    logger.controlInteraction('section-nav', { target: first.id }, 'both')
                  }}
                >
                  {b.label}
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="narrative__body">
        <div className="narrative__sticky" aria-hidden={false}>
          <div className="sticky-panel">
            {active.chart === 'synthesisRecap' ? (
              <div className="recap">
                {SYNTHESIS_STEPS.map((id) => (
                  <ChartForStep
                    key={id}
                    step={stepById[id]}
                    data={data}
                    condition={condition}
                    reducedMotion={reducedMotion}
                  />
                ))}
              </div>
            ) : (
              <ChartForStep
                step={active}
                data={data}
                condition={condition}
                reducedMotion={reducedMotion}
                readerValue={readerValue}
              />
            )}
            {active.caveat && <MissingTopCaveat variant={active.id === 'S16' ? 'full' : 'short'} />}
            <FigureStatusBadge figures={active.figures} />
          </div>
        </div>

        <div className="narrative__steps">
          {steps.map((step) => (
            <section
              key={step.id}
              className={`step step--${step.kind} ${activeStep === step.id ? 'is-active' : ''}`}
              data-step-id={step.id}
              aria-labelledby={`${step.id}-heading`}
            >
              <span className="visually-hidden" id={`${step.id}-heading`}>
                {step.message}
              </span>
              <div data-step-focus tabIndex={-1}>
                {step.id === 'S18' ? (
                  <Handover state={state} dispatch={dispatch} data={data} logger={logger} />
                ) : (
                  <StepAnnotation step={step} />
                )}
              </div>
            </section>
          ))}
        </div>
      </div>

      <div aria-live="polite" aria-atomic="true" className="visually-hidden" ref={liveRef} />
    </div>
  )
}
