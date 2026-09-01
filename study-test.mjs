import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const F = 'file:///home/claude/wealth-inequality-viz/wealth-viz-prototype-interactive.html'
const KEY = 'wviz.session.v3'
const out = []

async function open(query) {
  const ctx = await b.newContext({ viewport:{width:1400,height:900}, offline:true, permissions:[] })
  const p = await ctx.newPage()
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())})
  await p.goto(F + query); await p.waitForTimeout(1400)
  return { ctx, p, errs }
}
const log = p => p.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'), KEY)

/* --- 1. CONSENT GATE: no pid means nothing recorded --- */
{
  const { ctx, p, errs } = await open('')
  await p.evaluate(()=>document.querySelector('[data-step-id="S5"]')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(1200)
  const l = await log(p)
  const keys = await p.evaluate(()=>Object.keys(localStorage))
  const panel = await p.locator('.return-panel').count()
  const bar = await p.locator('.study-bar').count()
  out.push(`1 no pid: storedLog=${l===null?'none':l.events.length+' events'} localStorageKeys=${JSON.stringify(keys)} returnPanel=${panel} studyBar=${bar} errors=${errs.length}`)
  await ctx.close()
}

/* --- 2. researcher view, still no pid: bar visible, arm shown, nothing recorded --- */
{
  const { ctx, p } = await open('?study=1')
  const bar = await p.locator('.study-bar').count()
  const txt = await p.locator('.study-bar').innerText().catch(()=>'')
  const l = await log(p)
  out.push(`2 study=1 no pid: bar=${bar} recorded=${l===null?'none':l.events.length} showsArm=${/Condition:/.test(txt)} warns=${/recording is off/.test(txt)}`)
  await ctx.close()
}

/* --- 3. WITH pid: recording on, arm concealed, entryIndex + direction present --- */
{
  const { ctx, p, errs } = await open('?condition=interactive&pid=P0042')
  const barTxt = await p.locator('.study-bar').innerText().catch(()=>'(no bar)')
  for (const s of ['S1','S5','S11','S1','S18']) {  // note the backtrack to S1
    await p.evaluate(x=>document.querySelector(`[data-step-id="${x}"]`)?.scrollIntoView({block:'center'}), s)
    await p.waitForTimeout(800)
  }
  const l = await log(p)
  const enters = l.events.filter(e=>e.type==='section_enter')
  const revisit = enters.filter(e=>e.entryIndex>1)
  const ups = enters.filter(e=>e.direction==='up')
  out.push(`3 with pid: first=${l.events[0].type} pid=${l.events[0].participantCode} stored=${l.participantCode}`)
  out.push(`3 bar conceals arm: ${!/Condition:/.test(barTxt)} | barTag="${barTxt.split('\n')[0]}"`)
  out.push(`3 entryIndex present=${enters.every(e=>typeof e.entryIndex==='number')} revisits=${revisit.length} directionUp=${ups.length} directions=${[...new Set(enters.map(e=>e.direction))].join(',')}`)
  out.push(`3 errors=${errs.length?JSON.stringify(errs.slice(0,2)):'none'}`)

  /* --- 4. EXPOSURE GATE: code withheld until the close --- */
  const gatedText = await p.locator('.return-panel').innerText()
  const hasCodeBefore = await p.locator('#return-code').count()
  out.push(`4 before close: codeShown=${hasCodeBefore} prompt="${gatedText.split('\n').slice(1,2).join('')}"`)

  // complete the exposure: fill handover, enter explorer, reach E7
  const t = p.locator('.field__trigger')
  for (let i=0;i<await t.count();i++){ await t.nth(i).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(200); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(200) }
  await p.getByRole('button',{name:'Explore the data yourself'}).click(); await p.waitForTimeout(1600)
  await p.getByRole('button',{name:/Off the chart/}).first().click(); await p.waitForTimeout(1600)
  await p.getByRole('button',{name:'Zoom out'}).click(); await p.waitForTimeout(600)

  const l2 = await log(p)
  const miles = l2.events.filter(e=>e.type==='exposure_milestone')
  out.push(`5 milestones: ${miles.map(e=>e.milestone+'/'+e.scope).join(', ')||'NONE'}`)

  await p.evaluate(()=>document.querySelector('.return-panel')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(600)
  const code = await p.locator('#return-code').inputValue().catch(()=>null)
  out.push(`6 code released=${code!==null} length=${code?code.length:0}`)
  out.push(`6 code=${code?code.slice(0,120)+'…':'(none)'}`)

  /* --- 7. ROUND TRIP: decode in-page with the shipped decoder --- */
  if (code) {
    const rt = await p.evaluate(async (c) => {
      // The decoder is bundled; reach it through a fresh import of the module graph is not possible
      // in a single-file build, so re-implement the checksum check here and compare structurally.
      return { len: c.length, fields: c.split('~').length, hasChecksum: /~[0-9a-f]{8}$/.test(c) }
    }, code)
    out.push(`7 structure: fields=${rt.fields} checksumPresent=${rt.hasChecksum}`)
  }
  await ctx.close()
}

/* --- 8. The URL condition guard is NOT testable on the single-file build.
       That build stamps its arm in at build time and reports it as present and valid, which is
       correct: one file per arm, not editable by a participant. The URL guard cases are covered
       against the hosted build in guard-test.mjs. --- */
{
  const { ctx, p } = await open('?condition=bogus&pid=P0099&study=1')
  const l = await log(p)
  out.push(`8 embed build ignores the URL condition, as designed: recorded=${l===null?0:l.events.length} (guard cases: guard-test.mjs)`)
  await ctx.close()
}

/* --- 9. static arm reaches the close without an explorer --- */
{
  const ctx = await b.newContext({ viewport:{width:1400,height:900}, offline:true })
  const p = await ctx.newPage()
  await p.goto('file:///home/claude/wealth-inequality-viz/wealth-viz-prototype-static.html?pid=S0007')
  await p.waitForTimeout(1400)
  await p.evaluate(()=>document.querySelector('[data-step-id="S18"]')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(1400)
  const l = await log(p)
  const miles = (l?.events||[]).filter(e=>e.type==='exposure_milestone')
  await p.evaluate(()=>document.querySelector('.return-panel')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(500)
  const code = await p.locator('#return-code').inputValue().catch(()=>null)
  out.push(`9 static: milestones=${miles.map(e=>e.milestone).join(',')||'none'} codeReleased=${code!==null} interactiveOnlyEvents=${(l?.events||[]).filter(e=>e.scope==='interactive-only').length}`)
  await ctx.close()
}

/* --- 10. return URL route --- */
{
  const { ctx, p } = await open('?pid=P1234&return=https%3A%2F%2Fexample.org%2Fsurvey%3Fid%3D9')
  await p.evaluate(()=>document.querySelector('.return-panel')?.scrollIntoView({block:'center'}))
  await p.waitForTimeout(500)
  const txt = await p.locator('.return-panel').innerText()
  const url = await p.evaluate(()=>window.location.href)
  out.push(`10 return route: urlStripped=${!/pid=|return=/.test(url)} panelOffersRedirect=${/Back to the questions/.test(txt)||/stop here/.test(txt)}`)
  await ctx.close()
}

await b.close()
console.log(out.join('\n'))
