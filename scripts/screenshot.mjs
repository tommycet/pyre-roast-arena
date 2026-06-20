import pkg from '/root/node_modules/playwright/index.js'
const { chromium } = pkg

const BASE = 'http://localhost:5173'
const OUT = '/root/pyre/screenshots'
const ADDR = '0xf731837cc50039e85d455cc31126854a4f32b7cb' // studionet deployer

const ROUTES = [
  { name: '01-home',        url: '/' },
  { name: '02-arena',       url: '/arena' },
  { name: '03-battle',      url: '/battle/2' },
  { name: '04-submit',      url: '/submit/1' },
  { name: '05-flame',       url: '/flame' },
  { name: '06-combatant',   url: `/combatant/${ADDR}` },
  { name: '07-dispute',     url: '/dispute/1' },
]

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })

const log = (m) => process.stdout.write(m + '\n')
let okCount = 0, failCount = 0

for (const r of ROUTES) {
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 120)}`) })
  try {
    await page.goto(BASE + r.url, { waitUntil: 'networkidle', timeout: 15000 })
    // Settle: small wait for any Three.js / animations to start
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${OUT}/${r.name}.png`, fullPage: false })
    okCount++
    log(`  ✔ ${r.name} (${r.url})`)
  } catch (e) {
    failCount++
    log(`  ✗ ${r.name} (${r.url}): ${e.message?.slice(0, 80) || 'unknown'}`)
  }
  if (consoleErrors.length) {
    log(`     ${consoleErrors.length} console error(s) — first: ${consoleErrors[0]}`)
  }
  await page.close()
}

// One extra: home + arena dark-mode visual proof + a mobile viewport
const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
for (const r of [{ name: '08-home-mobile', url: '/' }, { name: '09-arena-mobile', url: '/arena' }]) {
  const page = await mobileCtx.newPage()
  try {
    await page.goto(BASE + r.url, { waitUntil: 'networkidle', timeout: 15000 })
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/${r.name}.png`, fullPage: false })
    log(`  ✔ ${r.name} (${r.url}) [mobile]`)
    okCount++
  } catch (e) {
    failCount++
    log(`  ✗ ${r.name} (${r.url}): ${e.message?.slice(0, 80) || 'unknown'}`)
  }
  await page.close()
}

await browser.close()
log('')
log(`Total: ${okCount} ok, ${failCount} fail`)
process.exit(failCount > 0 ? 1 : 0)
