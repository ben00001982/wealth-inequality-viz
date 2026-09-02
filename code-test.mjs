import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ viewport:{width:1400,height:900}, offline:true })
const p = await ctx.newPage()
const errs=[]; p.on('pageerror',e=>errs.push(e.message))
await p.goto('file:///home/claude/wealth-inequality-viz/wealth-viz-prototype-interactive.html?pid=RT000001')
await p.waitForTimeout(1500)
// read a step, open its data table, backtrack, then complete the exposure
for (const s of ['S1','S3','S1','S18']) {
  await p.evaluate(x=>document.querySelector(`[data-step-id="${x}"]`)?.scrollIntoView({block:'center'}), s)
  await p.waitForTimeout(900)
  if (s === 'S1') { await p.locator('.sticky-panel details summary').first().click().catch(()=>{}); await p.waitForTimeout(400) }
}
const t = p.locator('.field__trigger')
for (let i=0;i<await t.count();i++){ await t.nth(i).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(200); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(200) }
await p.getByRole('button',{name:'Explore the data yourself'}).click(); await p.waitForTimeout(1500)
await p.getByRole('button',{name:/Off the chart/}).first().click(); await p.waitForTimeout(1500)
await p.evaluate(()=>document.querySelector('.return-panel')?.scrollIntoView({block:'center'}))
await p.waitForTimeout(600)
const code = await p.locator('#return-code').inputValue()
const l = await p.evaluate(()=>JSON.parse(localStorage.getItem('wviz.session.v3')))
const tableEvents = l.events.filter(e=>e.control==='data-table')
console.log('version:', code.split('~')[0])
console.log('fields:', code.split('~').length, '(expect 11: 6 header + 3 vectors + interactions + checksum)')
console.log('length:', code.length)
console.log('data-table events:', tableEvents.length, 'scope:', tableEvents[0]?.scope)
const rev = code.split('~')[8]
console.log('revisit vector:', rev)
console.log('revisit nonzero positions:', rev.split('.').map((v,i)=>v!=='0'?i:null).filter(v=>v!==null))
console.log('dwell vector length:', code.split('~')[6].split('.').length, '(expect 24: 19 steps + 5 explorer views)')
console.log('errors:', errs.length?errs.slice(0,2):'none')
console.log('CODE:', code)
await b.close()
