export interface User {
  id: string
  name: string
  email: string
}

export interface PollOption {
  id: string
  text: string
}

export interface Poll {
  id: string
  slug: string
  question: string
  description?: string
  options: PollOption[]
  multiSelect: boolean
  closed: boolean
  expiresAt?: string | null
  createdAt: string
}

export interface PollSummary extends Poll {
  totalVotes: number
  counts: Record<string, number>
  viewers: number
}

export interface PublicPoll {
  slug: string
  question: string
  description?: string
  options: PollOption[]
  multiSelect: boolean
  closed: boolean
  expiresAt?: string | null
  totalVotes: number
  counts: Record<string, number>
  viewers: number
}

export interface VoteEventPayload {
  counts: Record<string, number>
  total: number
  optionIds: string[]
  voter: string
  at: string
}

export type SocketEvent =
  | { type: 'state'; pollId: string; payload: { counts: Record<string, number>; total: number; closed: boolean } }
  | { type: 'vote'; pollId: string; payload: VoteEventPayload }
  | { type: 'presence'; pollId: string; payload: { viewers: number } }
  | { type: 'status'; pollId: string; payload: { closed: boolean } }
  | { type: 'deleted'; pollId: string }
