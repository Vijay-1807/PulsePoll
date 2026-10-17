// The viewer's anonymous identity: a random id kept in localStorage. It is
// blended with network signals server-side for one-vote-per-person enforcement
// without requiring an account to vote.
const VOTER_KEY = 'pp_voter_id'

export function voterId(): string {
  let id = localStorage.getItem(VOTER_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(VOTER_KEY, id)
  }
  return id
}

export interface LocalVote {
  optionIds: string[]
  at: string
}

export function getMyVote(slug: string): LocalVote | null {
  try {
    const raw = localStorage.getItem(`pp_vote_${slug}`)
    return raw ? (JSON.parse(raw) as LocalVote) : null
  } catch {
    return null
  }
}

export function saveMyVote(slug: string, optionIds: string[]) {
  const vote: LocalVote = { optionIds, at: new Date().toISOString() }
  localStorage.setItem(`pp_vote_${slug}`, JSON.stringify(vote))
}
