import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const KEY='wviz.session.v3'

/* --- A. visibility path, driven by overriding visibilityState and firing the event --- */
{
  const ctx = await b.newContext({ viewport:{width:1400,height:900}, offline:true })
  const p = await ctx.newPage()
  await p.goto('file:///home/claude/wealth-inequality-viz/wealth-viz-prototype-interactive.html?study=1&pid=TEST0001')
  await p.waitForTimeout(1200)
  await p.evaluate(() => document.querySelector('[data-step-id="S1"]')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(600)
  // hide for ~4s, then show, then leave the step
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await p.waitForTimeout(4000)
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await p.waitForTimeout(400)
  await p.evaluate(() => document.querySelector('[data-step-id="S3"]')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(1000)
  const l = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY)
  const vis = l.events.filter(e=>e.type==='visibility_change')
  const s1 = l.events.filter(e=>e.type==='section_exit'&&e.sectionId==='S1').pop()
  console.log(`A visibility: events=${vis.length} flags=${vis.map(e=>e.hidden).join(',')}`)
  console.log(`A S1 dwell total=${s1?.dwellS}s visible=${s1?.visibleDwellS}s  (expect total ~5s, visible ~1s)`)
  await ctx.close()
}

/* --- B. dump the real event stream so the payloads can be judged --- */
{
  const ctx = await b.newContext({ viewport:{width:1400,height:900}, offline:true })
  const p = await ctx.newPage()
  await p.goto('file:///home/claude/wealth-inequality-viz/wealth-viz-prototype-interactive.html?study=1&pid=TEST0001')
  await p.waitForTimeout(1200)
  for (const s of ['S1','S5','S18']) {
    await p.evaluate(x => document.querySelector(`[data-step-id="${x}"]`)?.scrollIntoView({block:'center'}), s)
    await p.waitForTimeout(800)
  }
  const t = p.locator('.field__trigger')
  for (let i=0;i<await t.count();i++){ await t.nth(i).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(200); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(200) }
  await p.getByRole('button',{name:'Explore the data yourself'}).click(); await p.waitForTimeout(1400)
  await p.locator('.chip').nth(1).click(); await p.waitForTimeout(400)
  await p.getByRole('button',{name:/Compare two people/}).first().click(); await p.waitForTimeout(1000)
  await p.locator('.compare__preset-row button').first().click(); await p.waitForTimeout(600)
  await p.getByRole('button',{name:/Off the chart/}).first().click(); await p.waitForTimeout(1000)
  await p.getByRole('button',{name:'Zoom out'}).click(); await p.waitForTimeout(500)
  const l = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY)
  console.log('\nB event stream:')
  for (const e of l.events) {
    const { seq, type, t: off, scope, ...rest } = e
    console.log(`  ${String(seq).padStart(2)} t+${String(off).padStart(3)}s ${type.padEnd(24)} ${String(scope).padEnd(17)} ${JSON.stringify(rest)}`)
  }
  const ci = l.events.filter(e=>e.type==='control_interaction')
  console.log(`\nB control_interaction: ${ci.length} events, controls=${[...new Set(ci.map(e=>e.control))].join(', ')}`)
  console.log(`B every control_interaction names a control: ${ci.every(e=>!!e.control)}`)
  await ctx.close()
}
await b.close()
