import { test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

// Visual audit harness: seeds a user + polls + votes through the real API,
// then captures every page at mobile / tablet / desktop widths into
// screenshots/audit/ for manual review.
// Run:  npx playwright test --config screenshots/playwright.config.ts audit.spec.ts

const API = process.env.API_URL ?? 'http://localhost:8080'
const OUT = path.resolve(import.meta.dirname, 'audit')

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

async function shot(page: Page, name: string, fullPage = true) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage })
}

// Scroll through the page so scroll-reveal sections have entered the viewport
// before a full-page screenshot is taken.
async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(240, Math.floor(window.innerHeight / 2))
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 90))
    }
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 300))
  })
}

test('audit capture', async ({ page, request }) => {
  test.setTimeout(600_000)
  fs.mkdirSync(OUT, { recursive: true })

  const stamp = Date.now()
  const signup = await request.post(`${API}/api/auth/signup`, {
    data: { name: 'Aditi Rao', email: `audit${stamp}@example.com`, password: 'supersecret123' },
  })
  const { token } = await signup.json()
  const H = { Authorization: `Bearer ${token}` }

  const mk = async (question: string, options: string[], description = '') => {
    const res = await request.post(`${API}/api/polls`, {
      headers: H,
      data: { question, description, options, multiSelect: false, expiresInMinutes: 0 },
    })
    return (await res.json()).poll as { id: string; slug: string; options: { id: string; text: string }[] }
  }

  const pollLive = await mk(
    'Which feature should we ship next?',
    ['Dark mode', 'Team workspaces', 'Slack integration'],
    'Vote for what the team should build in the next sprint.',
  )
  const pollFresh = await mk('Pizza or biryani for the team dinner?', ['Wood-fired pizza', 'Hyderabadi biryani', 'Both, obviously'])
  const pollClosed = await mk('Should we move standup to 10am?', ['Yes', 'No'])

  const vote = (slug: string, optionId: string, voter: string) =>
    request.post(`${API}/api/polls/slug/${slug}/vote`, { data: { optionIds: [optionId], voterId: voter } })

  for (let i = 0; i < 5; i++) await vote(pollLive.slug, pollLive.options[0].id, `audit-a-${stamp}-${i}`)
  for (let i = 0; i < 4; i++) await vote(pollLive.slug, pollLive.options[1].id, `audit-b-${stamp}-${i}`)
  for (let i = 0; i < 3; i++) await vote(pollLive.slug, pollLive.options[2].id, `audit-c-${stamp}-${i}`)
  for (let i = 0; i < 2; i++) await vote(pollFresh.slug, pollFresh.options[1].id, `audit-d-${stamp}-${i}`)
  for (let i = 0; i < 2; i++) await vote(pollClosed.slug, pollClosed.options[0].id, `audit-e-${stamp}-${i}`)
  await vote(pollClosed.slug, pollClosed.options[1].id, `audit-f-${stamp}`)
  await request.patch(`${API}/api/polls/${pollClosed.id}`, { headers: H, data: { closed: true } })

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    const v = vp.name

    // Public pages
    await page.goto('/')
    await page.waitForTimeout(1200)
    await scrollThrough(page)
    await shot(page, `landing-${v}`)
    await shot(page, `landing-hero-${v}`, false)

    await page.goto('/signup')
    await page.waitForTimeout(600)
    await shot(page, `signup-${v}`)

    await page.goto('/login')
    await page.waitForTimeout(600)
    await shot(page, `login-${v}`)

    // Authenticated pages
    await page.addInitScript((t) => localStorage.setItem('pp_token', t), token)

    await page.goto('/dashboard')
    await page.waitForSelector('text=Your polls', { timeout: 15_000 })
    await page.waitForTimeout(1200)
    await shot(page, `dashboard-${v}`)

    await page.goto('/polls/new')
    await page.waitForSelector('#question', { timeout: 15_000 })
    await page.fill('#question', 'Where should the offsite be this year?')
    await page.fill('textarea', 'Pick the destination - results update live on the big screen.')
    await page.fill('input[placeholder="Option 1"]', 'Goa beach resort')
    await page.fill('input[placeholder="Option 2"]', 'Himalayan trek')
    await page.click('button:has-text("Add option")')
    await page.fill('input[placeholder="Option 3"]', 'Stay in the city')
    await page.click('button:has-text("Multi-select")')
    await page.waitForTimeout(400)
    await shot(page, `create-poll-${v}`)

    await page.goto(`/p/${pollLive.slug}`)
    await page.waitForSelector('text=Live results', { timeout: 15_000 })
    await page.waitForTimeout(1500)
    await shot(page, `poll-open-${v}`)

    await page.click('button[aria-label="Share poll"]')
    await page.waitForSelector('text=Scan the code', { timeout: 15_000 })
    await page.waitForTimeout(700)
    await shot(page, `share-modal-${v}`, false)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)

    await page.goto(`/p/${pollFresh.slug}`)
    await page.waitForSelector('text=Live results', { timeout: 15_000 })
    await page.getByRole('button', { name: 'Wood-fired pizza', exact: true }).click()
    await page.getByTestId('submit-vote').click()
    await page.waitForSelector('text=Vote recorded', { timeout: 15_000 })
    await page.waitForTimeout(2400)
    await shot(page, `poll-voted-${v}`)

    await page.goto(`/p/${pollClosed.slug}`)
    await page.waitForSelector('text=Live results', { timeout: 15_000 })
    await page.waitForTimeout(800)
    await shot(page, `poll-closed-${v}`)

    await page.goto('/definitely-not-a-page')
    await page.waitForTimeout(600)
    await shot(page, `not-found-${v}`)

    // Reset per-viewport state
    await page.evaluate(() => localStorage.clear())
  }
})
