import { useEffect, useState } from 'react'

/**
 * Data loading, with an explicit provenance gate.
 *
 * The pipeline has not run against real Office for National Statistics downloads yet, so the files
 * in public/data are synthetic placeholders emitted by scripts/make_synthetic.py. Every one of them
 * carries a `__meta.synthetic: true` flag, and this hook surfaces that flag to the application so
 * the interface can say so in plain sight.
 *
 * This is not a nicety. The brief's hard constraint is that values are never invented or
 * approximated, and a placeholder shown without a label is an invented value. The banner is the
 * mechanism that keeps the placeholder honest, and it must stay in the build until the real pipeline
 * output replaces the files, at which point the flag flips to false and the banner disappears by
 * itself.
 */

const FILES = {
  wealthByDecile: 'wealth_by_decile.json',
  tenureComposition: 'tenure_composition.json',
  medianWealthByTenure: 'median_wealth_by_tenure.json',
  medianWealthByAge: 'median_wealth_by_age.json',
  housePrices: 'house_prices.json',
  affordability: 'affordability.json',
  regionalWealth: 'regional_wealth.json',
  regionalBoundaries: 'regional_boundaries.json',
  // Beyond the eight files named in the tech stack, these are needed by steps the frozen design
  // spec specifies. They are documented in docs/DATA-PIPELINE.md alongside the original eight.
  topShareTrend: 'top_share_trend.json',
  wealthComposition: 'wealth_composition.json',
  localAuthorityIndex: 'local_authority_index.json',
  wasLookup: 'was_lookup.json',
  wealthDistribution: 'wealth_distribution.json',
  missingTop: 'missing_top.json',
  richList: 'rich_list.json',
}

export function useData() {
  const [state, setState] = useState({ status: 'loading', data: null, error: null, synthetic: null })

  useEffect(() => {
    let cancelled = false
    const base = import.meta.env.BASE_URL ?? '/'

    /*
     * Embedded-data path, for the single-file offline build.
     *
     * `npm run build:single` produces one self-contained HTML file with the data inlined as
     * window.__WVIZ_DATA__ and window.__WVIZ_EMBED__ set. That build exists for two real reasons:
     * the viva needs a demo that works with the network interface disabled, and a reviewer should be
     * able to open the artefact from a single file without running a server.
     *
     * It is a delivery format, not a different artefact. The data objects are the same files
     * public/data serves, `__meta` blocks included, so the provenance banner behaves identically and
     * a placeholder build still announces itself.
     */
    if (typeof window !== 'undefined' && window.__WVIZ_EMBED__ && window.__WVIZ_DATA__) {
      const data = window.__WVIZ_DATA__
      const flags = Object.values(data).map((d) => Boolean(d?.__meta?.synthetic))
      setState({
        status: 'ready',
        data,
        error: null,
        synthetic: flags.some(Boolean),
        mixed: flags.some(Boolean) && flags.some((f) => !f),
      })
      return undefined
    }

    async function loadAll() {
      try {
        const entries = await Promise.all(
          Object.entries(FILES).map(async ([key, file]) => {
            const res = await fetch(`${base}data/${file}`)
            if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`)
            return [key, await res.json()]
          }),
        )
        if (cancelled) return
        const data = Object.fromEntries(entries)
        // Synthetic if ANY file is synthetic. A mixed load is the dangerous case, because a real
        // series beside a placeholder one invites a comparison that means nothing.
        const flags = Object.values(data).map((d) => Boolean(d?.__meta?.synthetic))
        const synthetic = flags.some(Boolean)
        const mixed = synthetic && flags.some((f) => !f)
        setState({ status: 'ready', data, error: null, synthetic, mixed })
      } catch (error) {
        if (!cancelled) setState({ status: 'error', data: null, error, synthetic: null })
      }
    }

    loadAll()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

/** Unwrap a data file to its rows, tolerating both a bare array and a {__meta, rows} envelope. */
export function rowsOf(file) {
  if (!file) return []
  if (Array.isArray(file)) return file
  return file.rows ?? []
}
