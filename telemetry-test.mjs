import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const KEY = 'wviz.session.v3'
const out = []

async function open(cond, opts = {}) {
  const ctx = await b.newContext({
    viewport: { width: 1400, height: 900 }, offline: true, acceptDownloads: true, ...opts,
  })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message))
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  await p.goto(`file:///home/claude/wealth-inequality-viz/wealth-viz-prototype-${cond}.html?study=1&pid=TEST0001`)
  await p.waitForTimeout(1200)
  return { ctx, p, errs }
}
const log = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY)

/* ---- 1. does anything get recorded at all, and is condition first ---- */
{
  const { ctx, p, errs } = await open('interactive')
  const l = await log(p)
  out.push(`1 first event: type=${l?.events?.[0]?.type} condition=${l?.events?.[0]?.condition} schema=${l?.schemaVersion} sessionId=${(l?.sessionId||'').length}ch errors=${errs.length}`)
  await ctx.close()
}

/* ---- 2. dwell: sit on a step for a measured time and read it back ---- */
{
  const { ctx, p } = await open('interactive')
  await p.evaluate(() => document.querySelector('[data-step-id="S1"]')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(4000)
  await p.evaluate(() => document.querySelector('[data-step-id="S3"]')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(1500)
  const l = await log(p)
  const exits = l.events.filter(e => e.type === 'section_exit')
  out.push(`2 dwell: ${exits.length} exits; ${exits.map(e=>`${e.sectionId}=${e.dwellS}s/vis${e.visibleDwellS}s`).join(' ')}`)
  out.push(`2 enters carry navigationSource: ${l.events.filter(e=>e.type==='section_enter').every(e=>!!e.navigationSource)}`)
  await ctx.close()
}

/* ---- 3. visibility: background the tab mid-step, check visible < total ---- */
{
  const { ctx, p } = await open('interactive')
  const p2 = await ctx.newPage()   // backgrounds p
  await p.evaluate(() => document.querySelector('[data-step-id="S1"]')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(500)
  await p2.goto('about:blank'); await p2.bringToFront()
  await p.waitForTimeout(3500)
  await p.bringToFront(); await p.waitForTimeout(300)
  await p.evaluate(() => document.querySelector('[data-step-id="S3"]')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(1200)
  const l = await log(p)
  const vis = l.events.filter(e => e.type === 'visibility_change')
  const s1 = l.events.filter(e => e.type === 'section_exit' && e.sectionId === 'S1').pop()
  out.push(`3 visibility events=${vis.length} hiddenFlags=${vis.map(e=>e.hidden).join(',')} | S1 total=${s1?.dwellS}s visible=${s1?.visibleDwellS}s`)
  await ctx.close()
}

/* ---- 4. scope tagging and A/B parity ---- */
for (const cond of ['interactive','static']) {
  const { ctx, p } = await open(cond)
  for (const s of ['S1','S5','S11','S18']) {
    await p.evaluate(x => document.querySelector(`[data-step-id="${x}"]`)?.scrollIntoView({block:'center'}), s)
    await p.waitForTimeout(700)
  }
  if (cond === 'interactive') {
    const t = p.locator('.field__trigger')
    for (let i=0;i<await t.count();i++){ await t.nth(i).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(200); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(200) }
    await p.getByRole('button',{name:'Explore the data yourself'}).click(); await p.waitForTimeout(1500)
    await p.locator('.chip').nth(2).click(); await p.waitForTimeout(400)
    await p.getByRole('button',{name:/Off the chart/}).first().click(); await p.waitForTimeout(1200)
    await p.getByRole('button',{name:'Zoom out'}).click(); await p.waitForTimeout(400)
  }
  const l = await log(p)
  const byScope = {}
  for (const e of l.events) byScope[e.scope ?? 'MISSING'] = (byScope[e.scope ?? 'MISSING']||0)+1
  const types = [...new Set(l.events.map(e=>e.type))]
  out.push(`4 ${cond}: events=${l.events.length} scopes=${JSON.stringify(byScope)} types=${types.length}`)
  out.push(`4 ${cond}: interactive-only present=${l.events.some(e=>e.scope==='interactive-only')}`)
  out.push(`4 ${cond}: seq monotonic=${l.events.every((e,i)=>e.seq===i+1)} | any absolute timestamp field=${l.events.some(e=>Object.keys(e).some(k=>/date|time|stamp/i.test(k)&&k!=='t'))}`)
  await ctx.close()
}

/* ---- 5. session_complete and export download ---- */
{
  const { ctx, p, errs } = await open('interactive')
  await p.evaluate(() => document.querySelector('[data-step-id="S3"]')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(800)
  await p.getByRole('button',{name:'Mark session complete'}).click()
  await p.waitForTimeout(300)
  const dl = p.waitForEvent('download', { timeout: 8000 }).catch(() => null)
  await p.getByRole('button',{name:/Download the raw log/}).click()
  const d = await dl
  let parsed = null, name = null
  if (d) { name = d.suggestedFilename(); const path = await d.path(); parsed = JSON.parse(readFileSync(path,'utf8')) }
  out.push(`5 download fired=${!!d} filename=${name} keys=${parsed?Object.keys(parsed).join(','):'-'} events=${parsed?.events?.length} condition=${parsed?.condition}`)
  const l = await log(p)
  out.push(`5 complete+export logged=${['session_complete','export'].every(t=>l.events.some(e=>e.type===t))} errors=${errs.length}`)
  await ctx.close()
}

/* ---- 6. resume: reload and check it continues rather than restarting ---- */
{
  const { ctx, p } = await open('interactive')
  await p.evaluate(() => document.querySelector('[data-step-id="S3"]')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(900)
  const before = await log(p)
  await p.reload(); await p.waitForTimeout(1500)
  const after = await log(p)
  out.push(`6 resume: before=${before.events.length} after=${after.events.length} sameSession=${before.sessionId===after.sessionId} resumedEvent=${after.events.some(e=>e.type==='session_resumed')}`)
  await ctx.close()
}

/* ---- 7. storage blocked: does the artefact still work, and does it warn ---- */
{
  const ctx = await b.newContext({ viewport:{width:1400,height:900}, offline:true })
  const p = await ctx.newPage()
  const errs=[]; p.on('pageerror', e=>errs.push(e.message))
  await p.addInitScript(() => {
    const boom = () => { throw new DOMException('blocked','SecurityError') }
    Object.defineProperty(window,'localStorage',{ get(){ return { getItem:boom, setItem:boom, removeItem:boom } } })
  })
  await p.goto('file:///home/claude/wealth-inequality-viz/wealth-viz-prototype-interactive.html?study=1&pid=TEST0001')
  await p.waitForTimeout(1500)
  await p.evaluate(() => document.querySelector('[data-step-id="S3"]')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(900)
  const rendered = await p.locator('.sticky-panel svg.marks').count()
  const warn = await p.locator('.study-bar__warn').count()
  out.push(`7 storage blocked: chartsRender=${rendered} warningShown=${warn} pageErrors=${errs.length?JSON.stringify(errs.slice(0,2)):'none'}`)
  await ctx.close()
}

await b.close()
console.log(out.join('\n'))
