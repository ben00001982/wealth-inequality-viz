import { useEffect, useState } from 'react'

/**
 * prefers-reduced-motion, and the study-validity problem it creates.
 *
 * Honouring the preference is not optional: WCAG 2.3.3 and, more importantly, the participants who
 * set it. But in this artefact the interactive condition's staged within-chart transitions are part
 * of the manipulation (design spec B.6, pattern A6). Silently disabling them puts that participant
 * in an unlabelled third condition: interactive controls, static transitions.
 *
 * The resolution is not to override the preference. It is to record it. The flag is written to the
 * first telemetry event, so the analysis can report how many participants in each arm had reduced
 * motion set, and can treat it as a covariate or an exclusion, decided in advance in the analysis
 * plan rather than after seeing the numbers.
 */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    if (!window.matchMedia) return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e) => setReduced(e.matches)
    // addEventListener on MediaQueryList is the modern form; the addListener fallback covers older
    // Safari. Both are kept because the participant browser mix is not controlled.
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [])

  return reduced
}
