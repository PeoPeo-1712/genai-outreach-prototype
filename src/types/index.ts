export type CandidateStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'SENT'
  | 'REPLIED_NEEDS_ATTENTION'
  | 'BLOCKED_DM_CLOSED'
  | 'RATE_LIMITED'
  | 'SKIPPED';

export type MessageSendStatus =
  | 'DRAFT'
  | 'SENT'
  | 'BLOCKED_DM_CLOSED'
  | 'RATE_LIMITED'
  | 'FAILED'
  | 'SKIPPED';

export interface DiscoveryRequest {
  mode: 'segment' | 'seeds';
  query?: string;
  seedHandles?: string[];
  maxResults?: number;
  useExa?: boolean;
}

export interface MessageDTO {
  id: string;
  candidateId: string;
  draftText: string;
  sentText?: string | null;
  xDmEventId?: string | null;
  xConversationId?: string | null;
  sendStatus: string;
  errorReason?: string | null;
  sentAt?: string | Date | null;
  latestReplyText?: string | null;
  repliedAt?: string | Date | null;
  needsAttention: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CandidateDTO {
  id: string;
  xUserId: string;
  username: string;
  name: string;
  bio: string | null;
  location: string | null;
  fitScore: number | null;
  roleCategory?: string | null;
  seaConnection?: string | null;
  whyTheyFit: string | null;
  evidenceQuote: string | null;
  evidenceUrl: string | null;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  messages?: MessageDTO[];
}

export interface XAuthStatusDTO {
  connected: boolean;
  mode: 'oauth2' | 'oauth1_env' | 'none';
  username: string | null;
  xUserId?: string | null;
  expiresAt?: string | Date | null;
}

export interface RateLimitStatusDTO {
  endpoint: string;
  limitMax: number | null;
  remaining: number | null;
  resetEpoch: number | null;
  resetDate?: string | null;
  updatedAt: string | Date;
}

export interface OutreachSendResult {
  success: boolean;
  status: 'SENT' | 'BLOCKED_DM_CLOSED' | 'RATE_LIMITED' | 'DUPLICATE_BLOCKED' | 'SANDBOX_BLOCKED' | 'FAILED';
  dmEventId?: string;
  conversationId?: string;
  error?: string;
  suggestedAction?: string;
  rateLimitResetEpoch?: number;
}

export interface CandidateStatsDTO {
  all: number;
  pending: number;
  sent: number;
  blocked: number;
  needsAttention: number;
  skipped: number;
}

export interface DiscoveryResultDTO {
  candidates: CandidateDTO[];
  processedCount: number;
  skippedCount: number;
  errors?: string[];
  rateLimits?: RateLimitStatusDTO[];
}
