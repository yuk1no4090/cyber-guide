export type AnalyticsEventName =
  | 'recap_generate_clicked'
  | 'recap_generated'
  | 'recap_action_copied';

export interface AnalyticsPayload {
  success?: boolean;
  latency_ms?: number;
  error_type?: string;
  [key: string]: unknown;
}

interface AnalyticsEnvelope {
  event: AnalyticsEventName;
  payload: Required<Pick<AnalyticsPayload, 'success' | 'latency_ms' | 'error_type'>> & AnalyticsPayload;
  timestamp: string;
}

function normalizePayload(payload: AnalyticsPayload = {}): AnalyticsEnvelope['payload'] {
  const success = typeof payload.success === 'boolean' ? payload.success : true;
  const latencyMsRaw = typeof payload.latency_ms === 'number' ? payload.latency_ms : 0;
  const latency_ms = Number.isFinite(latencyMsRaw) ? Math.max(0, Math.round(latencyMsRaw)) : 0;
  const error_type = typeof payload.error_type === 'string' && payload.error_type.trim()
    ? payload.error_type
    : 'none';

  return {
    ...payload,
    success,
    latency_ms,
    error_type,
  };
}

export function track(event: AnalyticsEventName, payload: AnalyticsPayload = {}): void {
  const envelope: AnalyticsEnvelope = {
    event,
    payload: normalizePayload(payload),
    timestamp: new Date().toISOString(),
  };

  console.info('[analytics]', envelope);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('cyber-guide:analytics', {
        detail: envelope,
      })
    );
  }
}

export const analytics = {
  track,
  trackRecapGenerateClicked(payload: AnalyticsPayload = {}) {
    track('recap_generate_clicked', payload);
  },
  trackRecapGenerated(payload: AnalyticsPayload = {}) {
    track('recap_generated', payload);
  },
  trackRecapActionCopied(payload: AnalyticsPayload = {}) {
    track('recap_action_copied', payload);
  },
};

