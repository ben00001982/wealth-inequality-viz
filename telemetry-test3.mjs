import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const KEY='wviz.session.v3'
const URL='file:///home/claude/wealth-inequality-viz/wealth-viz-prototype-interactive.html?study=1&pid=TEST0001'

/* --- explorer view dwell now exists, and the last view is closed on pagehide --- */
const ctx = await b.newContext({ viewport:{width:1400,height:900}, offline:true })
const p = await ctx.newPage()
const errs=[]; p.on('pageerror',e=>errs.push(e.message))
await p.goto(URL); await p.waitForTimeout(1200)
await p.evaluate(()=>document.querySelector('[data-step-id="S18"]')?.scrollIntoView({block:'center'}))
await p.waitForTimeout(900)
const t=p.locator('.field__trigger')
for(let i=0;i<await t.count();i++){await t.nth(i).focus();await p.keyboard.press('Enter');await p.waitForTimeout(200);await p.keyboard.press('ArrowDown');await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');await p.waitForTimeout(200)}
await p.getByRole('button',{name:'Explore the data yourself'}).click(); await p.waitForTimeout(2200)
await p.getByRole('button',{name:/Compare two people/}).first().click(); await p.waitForTimeout(2600)
await p.getByRole('button',{name:/Off the chart/}).first().click(); await p.waitForTimeout(3100)
// leave the page: pagehide must close E7
await p.goto('about:blank'); await p.waitForTimeout(500)
const p2 = await ctx.newPage(); await p2.goto(URL); await p2.waitForTimeout(1000)
const l = await p2.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY)
const exits = l.events.filter(e=>e.type==='section_exit')
console.log('exits:')
for(const e of exits) console.log(`  ${e.sectionId.padEnd(6)} dwell=${e.dwellS}s visible=${e.visibleDwellS}s scope=${e.scope} closedBy=${e.closedBy??'observer'}`)
console.log(`\nexplorer views with a dwell: ${exits.filter(e=>e.scope==='interactive-only').map(e=>e.sectionId).join(', ')||'NONE'}`)
console.log(`last view (E7) closed on pagehide: ${exits.some(e=>e.sectionId==='E7'&&e.closedBy==='page-hidden')}`)
console.log(`S18 closed at handover: ${exits.some(e=>e.sectionId==='S18'&&e.closedBy==='explorer-view-change')}`)
console.log(`no duplicate sectionIds from splitting: ${new Set(exits.map(e=>e.sectionId)).size===exits.length}`)
console.log(`errors: ${errs.length?JSON.stringify(errs.slice(0,2)):'none'}`)
await b.close()
