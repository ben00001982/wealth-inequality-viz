import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const KEY = 'wviz.session.v3'
const cases = [
  ['valid pair',           '?condition=static&pid=P0001&study=1'],
  ['malformed condition',  '?condition=bogus&pid=P0002&study=1'],
  ['pid too short',        '?condition=static&pid=ab&study=1'],
  ['pid with punctuation', '?condition=static&pid=P%20003%21&study=1'],
  ['no condition, pid ok', '?pid=P0004&study=1'],
  ['condition only',       '?condition=interactive&study=1'],
]
for (const [name, q] of cases) {
  const ctx = await b.newContext({ viewport: { width: 1300, height: 800 } })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message))
  await p.goto('http://localhost:4181/' + q)
  await p.waitForTimeout(1600)
  const l = await p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), KEY)
  const txt = await p.locator('.study-bar').innerText().catch(() => '')
  const url = await p.evaluate(() => window.location.search)
  const arm = await p.evaluate(() => !!document.querySelector('.static-coda'))
  console.log(
    `${name.padEnd(21)} rec=${String(l ? l.events.length : 0).padEnd(2)} pid=${String(l?.participantCode ?? '-').padEnd(6)} ` +
    `badLink=${/not complete/.test(txt) ? 'Y' : 'n'} recOff=${/recording is off/.test(txt) ? 'Y' : 'n'} ` +
    `staticArm=${arm ? 'Y' : 'n'} qs="${url}" err=${errs.length}`
  )
  await ctx.close()
}
await b.close()
