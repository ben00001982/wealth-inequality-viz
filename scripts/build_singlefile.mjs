/**
 * Build one self-contained HTML file per A/B condition.
 *
 * Run: node scripts/build_singlefile.mjs        (or `npm run build:single`)
 *
 * Why this exists. Two real needs, not a novelty.
 *
 * The viva demo has to survive a dead network. A Vite build served from a local server root already
 * needs a relative base, and even then it is a directory of files that has to be served rather than
 * opened. A single file opens from the desktop with no server at all, which removes a whole class of
 * failure from a live demonstration.
 *
 * And a reviewer, marker or supervisor should be able to look at the artefact without installing
 * Node. Sending one HTML file is the lowest-friction way to do that.
 *
 * How it works. Vite builds normally with a relative base, then this script inlines the CSS and the
 * JS bundle into the HTML and stamps the data in as `window.__WVIZ_DATA__`, with
 * `window.__WVIZ_EMBED__` set so the two embed paths in src/hooks/useData.js and
 * src/state/conditions.js activate. Nothing else about the application changes: same components,
 * same specs, same accessibility layer, same provenance banner.
 *
 * Honesty note. The data inlined here is whatever public/data currently holds. If that is synthetic
 * placeholder output, every `__meta.synthetic` flag comes along with it and the built file shows the
 * placeholder banner exactly as the hosted build would. The single-file format cannot be used to
 * quietly ship unlabelled numbers, which is the point.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'dist-single')
const DATA_DIR = join(ROOT, 'public', 'data')

const CONDITIONS = ['interactive', 'static']

/** Anything inlined inside a <script> must not be able to close it early. */
function safeForScript(text) {
  return text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
}

function buildOnce() {
  console.log('Building with a relative base and no sourcemap')
  execFileSync('npx', ['vite', 'build'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE: './', VITE_OUT_DIR: 'dist-single' },
  })
}

function readData() {
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'))
  if (files.length === 0) {
    throw new Error(
      'public/data holds no JSON. Run `npm run data` for placeholders, or the real pipeline.',
    )
  }
  // Keys must match the FILES map in src/hooks/useData.js: file name to camelCase key.
  const keyFor = {
    'wealth_by_decile.json': 'wealthByDecile',
    'tenure_composition.json': 'tenureComposition',
    'median_wealth_by_tenure.json': 'medianWealthByTenure',
    'median_wealth_by_age.json': 'medianWealthByAge',
    'house_prices.json': 'housePrices',
    'affordability.json': 'affordability',
    'regional_wealth.json': 'regionalWealth',
    'regional_boundaries.json': 'regionalBoundaries',
    'top_share_trend.json': 'topShareTrend',
    'wealth_composition.json': 'wealthComposition',
    'local_authority_index.json': 'localAuthorityIndex',
    'was_lookup.json': 'wasLookup',
    'wealth_distribution.json': 'wealthDistribution',
    'missing_top.json': 'missingTop',
    'rich_list.json': 'richList',
  }

  const out = {}
  let synthetic = 0
  for (const file of files) {
    const key = keyFor[file]
    if (!key) {
      console.log(`  skipping ${file}: not in the front end's file map`)
      continue
    }
    const parsed = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'))
    if (parsed?.__meta?.synthetic) synthetic += 1
    out[key] = parsed
  }

  const missing = Object.values(keyFor).filter((k) => !(k in out))
  if (missing.length) {
    throw new Error(`Data files missing for: ${missing.join(', ')}`)
  }

  console.log(`  inlining ${Object.keys(out).length} data files (${synthetic} synthetic)`)
  return { data: out, synthetic }
}

function inline(condition, data) {
  const html = readFileSync(join(OUT_DIR, 'index.html'), 'utf8')

  const cssHref = html.match(/href="([^"]+\.css)"/)?.[1]
  const jsSrc = html.match(/src="([^"]+\.js)"/)?.[1]
  if (!cssHref || !jsSrc) {
    throw new Error('Could not find the built CSS and JS references in dist-single/index.html.')
  }

  const css = readFileSync(join(OUT_DIR, cssHref.replace(/^\.?\//, '')), 'utf8')
  const js = readFileSync(join(OUT_DIR, jsSrc.replace(/^\.?\//, '')), 'utf8')

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? 'Wealth inequality visualisation'
  const description = html.match(/name="description"\s+content="([^"]*)"/)?.[1] ?? ''

  const out = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<!--
  Self-contained build, condition: ${condition}
  Generated by scripts/build_singlefile.mjs. Everything is inlined: no network requests, no server
  needed. Open it directly. The data below is whatever public/data held at build time, with its
  provenance metadata intact, so a placeholder build says so on screen.
-->
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>
window.__WVIZ_EMBED__ = true;
window.__WVIZ_CONDITION__ = ${JSON.stringify(condition)};
window.__WVIZ_DATA__ = ${safeForScript(JSON.stringify(data))};
</script>
<script type="module">${safeForScript(js)}</script>
</body>
</html>
`
  const name = `wealth-viz-prototype-${condition}.html`
  writeFileSync(join(ROOT, name), out, 'utf8')
  const kb = Buffer.byteLength(out) / 1000
  console.log(`  wrote ${name} (${kb.toFixed(0)} kB)`)
  return name
}

function main() {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true })
  buildOnce()
  const { data, synthetic } = readData()
  const written = CONDITIONS.map((c) => inline(c, data))
  console.log('\nDone:', written.join(', '))
  if (synthetic > 0) {
    console.log(
      `\nNOTE: ${synthetic} of the inlined data files are synthetic placeholders, so both files will\n` +
        'show the placeholder banner. That is correct behaviour, not a bug.',
    )
  }
}

main()
