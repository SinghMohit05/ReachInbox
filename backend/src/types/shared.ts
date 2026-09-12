/**
 * Email lifecycle status enum
 */
export enum EmailStatus {
  SCHEDULED = 'scheduled',
  PROCESSING = 'processing',
  SENT = 'sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Common health check response structure
 */
export interface HealthResponse {
  status: 'ok' | 'error';
  service: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

/**
 * Service component health probe response
 */
export interface ComponentHealthResponse {
  status: 'ok' | 'error';
  component: 'db' | 'redis' | 'elasticsearch';
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Basic user definition
 */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

/**
 * Basic sender definition
 */
export interface SenderProfile {
  id: string;
  email: string;
  displayName: string;
  enabled: boolean;
}

/**
 * Email data transfer object
 */
export interface EmailItem {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  jobId?: string | null;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}
