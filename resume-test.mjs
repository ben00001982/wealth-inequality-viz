import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ viewport:{width:1300,height:800} })
const p = await ctx.newPage()
p.on('pageerror', e=>console.log('ERR', e.message))
const U = 'http://localhost:4181/?condition=interactive&pid=RES00001&study=1'
await p.goto(U); await p.waitForTimeout(1500)
console.log('url after strip:', await p.evaluate(()=>window.location.search))
await p.evaluate(()=>document.querySelector('[data-step-id="S3"]')?.scrollIntoView({block:'center'}))
await p.waitForTimeout(900)
const a = await p.evaluate(()=>JSON.parse(localStorage.getItem('wviz.session.v3')))
console.log('before reload:', a.events.length, 'events;', a.events.map(e=>e.type).join(','))

// A participant who reloads lands on the stripped URL, which is what actually happens.
await p.reload(); await p.waitForTimeout(1800)
const b2 = await p.evaluate(()=>JSON.parse(localStorage.getItem('wviz.session.v3')||'null'))
console.log('after plain reload:', b2 ? b2.events.length+' events; '+b2.events.map(e=>e.type).join(',') : 'NOTHING STORED')
console.log('bar present:', await p.locator('.study-bar').count())

// And a participant who re-uses the original link from the survey tab.
await p.goto(U); await p.waitForTimeout(1800)
const c = await p.evaluate(()=>JSON.parse(localStorage.getItem('wviz.session.v3')))
console.log('after re-visiting the link:', c.events.length, 'events; resumedLogged=', c.events.some(e=>e.type==='session_resumed'))
await b.close()
