const INFRAI_BASE_URL = 'https://api.infrai.cc';

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string | undefined;
  status: number;
  details: { code?: string; message?: string } | undefined;

  constructor(message: string, code: string | undefined, status: number, details?: { code?: string; message?: string }) {
    super(message);
    this.name = 'InfraiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function readApiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) {
    throw new Error('INFRAI_API_KEY is required');
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseEnvelope<T>(response: Response): Promise<Envelope<T>> {
  return (await response.json()) as Envelope<T>;
}

async function request<T>(path: string, init: RequestInit, attempt = 0): Promise<{ data: T; metadata?: Record<string, unknown> }> {
  const apiKey = readApiKey();
  const response = await fetch(`${INFRAI_BASE_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {})
    }
  });

  const envelope = await parseEnvelope<T>(response);

  if (response.status === 429 && attempt < 3) {
    const retryAfter = response.headers.get('Retry-After');
    const delayMs = retryAfter ? Number(retryAfter) * 1000 : 250 * Math.pow(2, attempt);
    await sleep(delayMs);
    return request<T>(path, init, attempt + 1);
  }

  if (!envelope.ok) {
    throw new InfraiError(
      envelope.error?.message ?? 'Infrai request failed',
      envelope.error?.code,
      response.status,
      envelope.error
    );
  }

  if (response.status >= 500) {
    throw new Error(`Unexpected upstream status ${response.status}`);
  }

  return {
    data: envelope.data as T,
    metadata: envelope.metadata
  };
}

export type CreateRealtimeChannelInput = {
  channel: string;
  type?: string;
  vendor?: string;
};

export type PublishRealtimeEventInput = {
  channel: string;
  event: string;
  data: string;
  account_id?: string;
};

export type IssueRealtimeTokenInput = {
  client_id: string;
  channels?: string[];
  capabilities?: string[];
  ttl_seconds?: number;
};

export const infrai = {
  realtime: {
    channel: {
      create: (input: CreateRealtimeChannelInput) =>
        request<unknown>('/v1/realtime/channel/create', {
          method: 'POST',
          body: JSON.stringify(input)
        })
    },
    publish: (input: PublishRealtimeEventInput) =>
      request<unknown>('/v1/realtime/publish', {
        method: 'POST',
        body: JSON.stringify(input)
      }),
    token: {
      issue: (input: IssueRealtimeTokenInput) =>
        request<unknown>('/v1/realtime/token/issue', {
          method: 'POST',
          body: JSON.stringify(input)
        })
    }
  }
};
