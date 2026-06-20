import pkg from '/root/node_modules/playwright/index.js'
const { chromium } = pkg

const BASE = 'http://localhost:5174'  // bradbury static build
const OUT = '/root/pyre/screenshots'
const ADDR = '0xb6F2927dFF8D65D3b02634f12326DA47463384c7' // bradbury deployer

const ROUTES = [
  { name: '10-bradbury-home',        url: '/' },
  { name: '11-bradbury-arena',       url: '/arena' },
  { name: '12-bradbury-battle-2',    url: '/battle/2' },  // both_burned, 2 burns, no verdict
  { name: '13-bradbury-battle-3',    url: '/battle/3' },  // current E2E attempt, both_joined
  { name: '14-bradbury-submit-3',    url: '/submit/3' },
  { name: '15-bradbury-flame',       url: '/flame' },
  { name: '16-bradbury-combatant',   url: `/combatant/${ADDR}` },
  { name: '17-bradbury-dispute-2',   url: '/dispute/2' },
]

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

let okCount = 0, failCount = 0
for (const r of ROUTES) {
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 120)}`) })
  try {
    await page.goto(BASE + r.url, { waitUntil: 'networkidle', timeout: 20000 })
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/${r.name}.png`, fullPage: false })
    okCount++
    console.log(`  ✔ ${r.name} (${r.url})`)
  } catch (e) {
    failCount++
    console.log(`  ✗ ${r.name} (${r.url}): ${e.message?.slice(0, 80) || 'unknown'}`)
  }
  if (consoleErrors.length) console.log(`     ${consoleErrors.length} console error(s) — first: ${consoleErrors[0]}`)
  await page.close()
}

await browser.close()
console.log('')
console.log(`Total: ${okCount} ok, ${failCount} fail`)
process.exit(failCount > 0 ? 1 : 0)
