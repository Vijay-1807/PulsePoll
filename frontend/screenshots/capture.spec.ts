import { test, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

// Generates the screenshots used in the repo README.
// Requires the Go backend on :8080 with Mongo + Redis (docker compose up -d).

const OUT = path.resolve(import.meta.dirname, '../../docs/screenshots')

const unique = () => Math.random().toString(36).slice(2, 10)

async function snap(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage })
}

test('capture product screenshots', async ({ browser, request }) => {
  fs.mkdirSync(OUT, { recursive: true })
  const apiBase = 'http://localhost:8080'
  const email = `shots-${unique()}@pulsepoll.dev`

  // Seed: owner + three polls with realistic votes.
  const signup = await request.post(`${apiBase}/api/auth/signup`, {
    data: { name: 'Aditi Rao', email, password: 'password123' },
  })
  const token = (await signup.json()).token
  const auth = { Authorization: `Bearer ${token}` }

  const createPoll = async (question: string, options: string[], description = '') => {
    const res = await request.post(`${apiBase}/api/polls`, {
      headers: auth,
      data: { question, description, options },
    })
    return (await res.json()).poll as { slug: string; options: { id: string }[] }
  }

  const p1 = await createPoll('Which feature should we ship next?', [
    'Dark mode',
    'Team workspaces',
    'Slack integration',
    'Public API',
  ])
  const p2 = await createPoll('Lunch spot for the offsite?', ['Ramen House', 'Taco Bar', 'Green Bowl', 'Pizza Corner'])
  await createPoll('Should we move standup to 10am?', ['Yes', 'No'], 'Quick one - voting closes Friday.')

  const votes: Array<[string, number, string]> = [
    [p1.slug, 0, 'v1'], [p1.slug, 0, 'v2'], [p1.slug, 0, 'v3'], [p1.slug, 1, 'v4'],
    [p1.slug, 1, 'v5'], [p1.slug, 2, 'v6'], [p1.slug, 3, 'v7'],
    [p2.slug, 1, 'v8'], [p2.slug, 1, 'v9'], [p2.slug, 2, 'v10'],
  ]
  for (const [slug, optIdx, voter] of votes) {
    const poll = slug === p1.slug ? p1 : p2
    await request.post(`${apiBase}/api/polls/slug/${slug}/vote`, {
      data: { optionIds: [poll.options[optIdx].id], voterId: `seed-${voter}-${unique()}` },
    })
  }

  // 1. Landing page
  const page = await browser.newPage()
  await page.goto('/')
  await snap(page, '01-landing')

  // 2. Signup page
  await page.goto('/signup')
  await snap(page, '02-signup')

  // 3. Log in as the seeded user
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Log in' }).click()
  await page.waitForURL(/dashboard/)
  await page.waitForTimeout(1200)
  await snap(page, '03-dashboard')

  // 4. Create-poll form
  await page.goto('/polls/new')
  await page.getByLabel('Question').fill('Pizza or biryani for the team dinner?')
  await page.getByPlaceholder('Option 1').fill('Wood-fired pizza')
  await page.getByPlaceholder('Option 2').fill('Hyderabadi biryani')
  await snap(page, '04-create-poll')

  // 5. Public vote page with live results (fresh poll, some votes)
  const p4 = await createPoll('Pizza or biryani for the team dinner?', [
    'Wood-fired pizza',
    'Hyderabadi biryani',
    'Both, obviously',
  ])
  for (const [idx, voter] of [
    [0, 'a'], [0, 'b'], [0, 'c'], [1, 'd'], [1, 'e'], [2, 'f'], [0, 'g'],
  ] as Array<[number, string]>) {
    await request.post(`${apiBase}/api/polls/slug/${p4.slug}/vote`, {
      data: { optionIds: [p4.options[idx].id], voterId: `seed-${voter}-${unique()}` },
    })
  }
  const voter = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const votePage = await voter.newPage()
  await votePage.goto(`/p/${p4.slug}`)
  await votePage.getByRole('button', { name: 'Wood-fired pizza' }).click()
  await votePage.getByTestId('submit-vote').click()
  await votePage.waitForTimeout(1500)
  await snap(votePage, '05-live-results')

  // 6. Share modal with QR
  await votePage.getByRole('button', { name: 'Share poll' }).click()
  await votePage.waitForTimeout(400)
  await votePage.screenshot({ path: path.join(OUT, '06-share-qr.png') })

  await page.close()
  await votePage.close()
  await voter.close()
})
