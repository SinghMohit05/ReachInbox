export interface EmailItem {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  status: 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled';
  scheduledAt: string;
  sentAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
  previewUrl?: string | null;
  jobId?: string | null;
  createdAt: string;
  sender?: {
    id: string;
    email: string;
    displayName: string;
  };
}

export interface SenderItem {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  enabled: boolean;
}

export interface StatsResponse {
  scheduledCount: number;
  sentCount: number;
  failedCount: number;
  totalSenders: number;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('reachinbox_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchScheduledEmails(): Promise<EmailItem[]> {
  const res = await fetch(`${API_BASE}/api/emails/scheduled`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch scheduled emails');
  const data = await res.json();
  return data.emails || [];
}

export async function fetchSentEmails(): Promise<EmailItem[]> {
  const res = await fetch(`${API_BASE}/api/emails/sent`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch sent emails');
  const data = await res.json();
  return data.emails || [];
}

export async function fetchEmailById(id: string): Promise<EmailItem> {
  const res = await fetch(`${API_BASE}/api/emails/${id}`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch email details');
  const data = await res.json();
  return data.email;
}

export async function scheduleEmailBatch(payload: {
  senderId: string;
  recipients: string[];
  subject: string;
  body: string;
  scheduledAt?: string;
  delaySeconds?: number;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/api/emails/schedule`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Failed to schedule emails');
  }
  return res.json();
}

export async function cancelScheduledEmail(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/api/emails/${id}/cancel`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to cancel email schedule');
  return res.json();
}

export async function searchEmails(query: string, status?: string): Promise<EmailItem[]> {
  const params = new URLSearchParams({ q: query });
  if (status) params.set('status', status);
  const res = await fetch(`${API_BASE}/api/emails/search?${params.toString()}`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to search emails');
  const data = await res.json();
  return data.emails || [];
}

export async function fetchSenders(): Promise<SenderItem[]> {
  const res = await fetch(`${API_BASE}/api/senders`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch senders');
  const data = await res.json();
  return data.senders || [];
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch(`${API_BASE}/api/stats`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch stats');
  const data = await res.json();
  return data.stats || { scheduledCount: 0, sentCount: 0, failedCount: 0, totalSenders: 0 };
}

export async function getSlackStatus(): Promise<{ connected: boolean; connection?: any }> {
  const res = await fetch(`${API_BASE}/auth/slack/status`, {
    headers: { ...getAuthHeader() },
    credentials: 'include',
  });
  if (!res.ok) return { connected: false };
  return res.json();
}

export async function disconnectSlack(): Promise<any> {
  const res = await fetch(`${API_BASE}/auth/slack/disconnect`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
    credentials: 'include',
  });
  return res.json();
}
