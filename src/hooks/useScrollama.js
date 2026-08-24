import { useEffect, useRef } from 'react'
import scrollama from 'scrollama'

/**
 * Scrollama binding.
 *
 * One rule governs this hook and it is worth stating at the top: **the observer is the only path
 * that sets step state.** Nothing else calls the step-enter dispatch. Keyboard navigation does not
 * set state directly; it calls scrollIntoView and lets the observer fire. If two paths could set
 * the active step, they would disagree the moment a participant used both, and the telemetry would
 * record a step order that never happened.
 *
 * The cost of that rule is real and is handled in the telemetry: a keyboard jump across several
 * steps produces a burst of section_enter events for steps that were never read. The
 * `navigationSource` field on each enter event exists so the analysis can distinguish a scrolled
 * entry from a jumped one, and the analysis plan excludes sub-threshold dwells accordingly.
 */
export function useScrollama({ stepSelector = '.step', offset = 0.55, onStepEnter, onStepExit }) {
  const scrollerRef = useRef(null)
  const handlersRef = useRef({ onStepEnter, onStepExit })
  handlersRef.current = { onStepEnter, onStepExit }

  useEffect(() => {
    const scroller = scrollama()
    scrollerRef.current = scroller

    scroller
      .setup({ step: stepSelector, offset, debug: false })
      .onStepEnter((response) => {
        const id = response.element?.dataset?.stepId
        if (id) handlersRef.current.onStepEnter?.(id, response)
      })
      .onStepExit((response) => {
        const id = response.element?.dataset?.stepId
        if (id) handlersRef.current.onStepExit?.(id, response)
      })

    const onResize = () => scroller.resize()
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      scroller.destroy()
      scrollerRef.current = null
    }
  }, [stepSelector, offset])

  /**
   * Programmatic navigation for the keyboard controls and the in-page step list. Deliberately does
   * not touch state: it scrolls, and the observer does the rest. `behavior` respects reduced motion
   * because an instant jump is the correct behaviour for someone who has asked for less movement.
   */
  const scrollToStep = (stepId, { reducedMotion = false } = {}) => {
    const el = document.querySelector(`[data-step-id="${stepId}"]`)
    if (!el) return false
    el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' })
    // Move focus so a keyboard user's focus follows the visual jump. Without this the next Tab
    // press continues from wherever focus was, which breaks 2.4.3 focus order in practice even
    // though nothing technically fails.
    const focusTarget = el.querySelector('[data-step-focus]') ?? el
    if (focusTarget instanceof HTMLElement) {
      focusTarget.setAttribute('tabindex', '-1')
      focusTarget.focus({ preventScroll: true })
    }
    return true
  }

  return { scrollToStep, resize: () => scrollerRef.current?.resize() }
}
