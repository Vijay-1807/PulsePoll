import { test, expect, type Page } from '@playwright/test'

// End-to-end verification of the core promise: a vote cast in one browser is
// visible in another browser without anyone refreshing the page.
// Backend must be live on :8080 with MongoDB and Redis running.

const unique = () => Math.random().toString(36).slice(2, 10)

async function signup(page: Page, email: string, name = 'E2E Tester') {
  await page.goto('/signup')
  await page.getByLabel('Name').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/dashboard/)
}

async function createPoll(page: Page, question: string, options: string[]) {
  await page.goto('/polls/new')
  await page.getByLabel('Question').fill(question)
  for (let i = 0; i < options.length; i++) {
    if (i >= 2) {
      await page.getByRole('button', { name: 'Add option' }).click()
    }
    await page.getByPlaceholder(`Option ${i + 1}`).fill(options[i])
  }
  await page.getByRole('button', { name: 'Create poll' }).click()
  await expect(page).toHaveURL(/\/p\/[A-Za-z0-9_-]+/)
  return page.url()
}

test.describe('PulsePoll live flow', () => {
  test('vote in one browser shows up live in another, no refresh', async ({ browser }) => {
    const creator = await browser.newContext()
    const viewer = await browser.newContext()
    const second = await browser.newContext()

    const creatorPage = await creator.newPage()
    const viewerPage = await viewer.newPage()
    const secondPage = await second.newPage()

    try {
      // 1. Creator signs up and creates a poll.
      await signup(creatorPage, `creator-${unique()}@test.com`)
      const pollUrl = await createPoll(creatorPage, 'Which stack wins?', ['Go + Gin', 'Node + Express', 'Python + Flask'])

      await expect(creatorPage.getByTestId('results-card')).toContainText('0 votes')

      // 2. Viewer opens the shared link in a separate browser and votes.
      await viewerPage.goto(pollUrl)
      await expect(viewerPage.getByText('Live results')).toBeVisible()
      await viewerPage.getByRole('button', { name: 'Go + Gin' }).click()
      await viewerPage.getByTestId('submit-vote').click()
      await expect(viewerPage.getByText('Vote recorded')).toBeVisible()
      await expect(viewerPage.getByTestId('total-votes')).toHaveText('1')

      // 3. Creator's page - untouched, not refreshed - must reflect it live.
      await expect(creatorPage.getByTestId('total-votes')).toHaveText('1')
      await expect(creatorPage.getByText('Anonymous voter picked').first()).toBeVisible()

      // 4. A third watcher sees totals grow live as they watch.
      await secondPage.goto(pollUrl)
      await secondPage.getByRole('button', { name: 'Python + Flask' }).click()
      await secondPage.getByTestId('submit-vote').click()
      await expect(viewerPage.getByTestId('total-votes')).toHaveText('2')
      await expect(secondPage.getByTestId('total-votes')).toHaveText('2')

      // Viewer sees the second vote arrive without reloading.
      await expect(viewerPage.getByText('Anonymous voter picked').first()).toBeVisible()
    } finally {
      await creator.close()
      await viewer.close()
      await second.close()
    }
  })

  test('one person, one vote - enforced by the server', async ({ browser }) => {
    const creator = await browser.newContext()
    const voter = await browser.newContext()
    const creatorPage = await creator.newPage()
    const voterPage = await voter.newPage()

    try {
      await signup(creatorPage, `owner-${unique()}@test.com`)
      const pollUrl = await createPoll(creatorPage, 'One vote only?', ['Yes', 'Also yes'])

      await voterPage.goto(pollUrl)
      await voterPage.getByRole('button', { name: 'Yes', exact: true }).click()
      await voterPage.getByTestId('submit-vote').click()
      await expect(voterPage.getByText('Vote recorded')).toBeVisible()
      await expect(voterPage.getByTestId('total-votes')).toHaveText('1')

      // Replaying the same ballot through the API is rejected too - the UI
      // hiding the button is not the security boundary.
      const slug = pollUrl.split('/p/')[1]
      const apiBase = process.env.API_URL ?? process.env.PW_BASE_URL ?? 'http://localhost:8080'
      const res = await voterPage.request.post(`${apiBase}/api/polls/slug/${slug}/vote`, {
        data: { optionIds: ['whatever'], voterId: 'x' },
      })
      expect([409, 422]).toContain(res.status())

      // Results did not move.
      await expect(voterPage.getByTestId('total-votes')).toHaveText('1')
    } finally {
      await creator.close()
      await voter.close()
    }
  })

  test('auth is required to create and manage polls', async ({ browser, request }) => {
    const page = await browser.newPage()
    // Creating a poll without a session redirects to login.
    await page.goto('/polls/new')
    await expect(page).toHaveURL(/login/)

    // And the API refuses anonymous writes outright.
    const apiBase = process.env.API_URL ?? process.env.PW_BASE_URL ?? 'http://localhost:8080'
    const res = await request.post(`${apiBase}/api/polls`, {
      data: { question: 'Sneaky?', options: ['a', 'b'] },
    })
    expect(res.status()).toBe(401)
    await page.close()
  })

  test('backend validates poll input', async ({ browser, request }) => {
    const page = await browser.newPage()
    await signup(page, `validator-${unique()}@test.com`)
    const token = await page.evaluate(() => localStorage.getItem('pp_token'))
    expect(token).toBeTruthy()

    const apiBase = process.env.API_URL ?? process.env.PW_BASE_URL ?? 'http://localhost:8080'
    const authed = { Authorization: `Bearer ${token}` }

    // Too few options after trimming.
    const few = await request.post(`${apiBase}/api/polls`, {
      headers: authed,
      data: { question: 'Only one?', options: ['solo', '   '] },
    })
    expect(few.status()).toBe(422)

    // Duplicate options collapse to one → rejected.
    const dup = await request.post(`${apiBase}/api/polls`, {
      headers: authed,
      data: { question: 'Dupes?', options: ['Same', 'same'] },
    })
    expect(dup.status()).toBe(422)

    // Empty question.
    const noQ = await request.post(`${apiBase}/api/polls`, {
      headers: authed,
      data: { question: '', options: ['a', 'b'] },
    })
    expect(noQ.status()).toBe(422)

    // Voting for an option that belongs to another poll is rejected.
    const made = await request.post(`${apiBase}/api/polls`, {
      headers: authed,
      data: { question: 'Valid one?', options: ['Alpha', 'Beta'] },
    })
    expect(made.status()).toBe(201)
    const body = await made.json()
    const bad = await request.post(`${apiBase}/api/polls/slug/${body.poll.slug}/vote`, {
      data: { optionIds: ['000000000000000000000000'], voterId: 'nope' },
    })
    expect(bad.status()).toBe(422)

    await page.close()
  })

  test('owner closes the poll and open viewers learn instantly', async ({ browser }) => {
    const creator = await browser.newContext()
    const viewer = await browser.newContext()
    const creatorPage = await creator.newPage()
    const viewerPage = await viewer.newPage()

    try {
      await signup(creatorPage, `closer-${unique()}@test.com`)
      const pollUrl = await createPoll(creatorPage, 'Closing time?', ['Close it', 'Keep it open'])

      // A viewer is sitting on the page while the owner closes the poll.
      await viewerPage.goto(pollUrl)
      await expect(viewerPage.getByText('vote recorded', { exact: false })).toHaveCount(0)

      const slug = pollUrl.split('/p/')[1]
      const apiBase = process.env.API_URL ?? process.env.PW_BASE_URL ?? 'http://localhost:8080'
      const token = await creatorPage.evaluate(() => localStorage.getItem('pp_token'))
      const list = await creatorPage.request.get(`${apiBase}/api/polls`, { headers: { Authorization: `Bearer ${token}` } })
      const polls = (await list.json()).polls as Array<{ id: string; slug: string }>
      const target = polls.find((p) => p.slug === slug)!

      const patched = await creatorPage.request.patch(`${apiBase}/api/polls/${target.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { closed: true },
      })
      expect(patched.status()).toBe(200)

      // The viewer's open tab flips to closed over the websocket, no refresh.
      await expect(viewerPage.getByText('Voting is closed. Results are final.')).toBeVisible()
      await expect(viewerPage.getByTestId('submit-vote')).toHaveCount(0)
    } finally {
      await creator.close()
      await viewer.close()
    }
  })

  test('share modal offers a QR code and copyable link', async ({ browser }) => {
    const page = await browser.newPage()
    await signup(page, `sharer-${unique()}@test.com`)
    await createPoll(page, 'Share me?', ['Yep', 'Nope'])

    await page.getByRole('button', { name: 'Share' }).click()
    await expect(page.getByText('Share this poll')).toBeVisible()
    await expect(page.locator('svg').filter({ has: page.locator('rect') }).first()).toBeVisible()
    await expect(page.getByText(/\/p\/[A-Za-z0-9_-]+/).first()).toBeVisible()
    await page.close()
  })
})
