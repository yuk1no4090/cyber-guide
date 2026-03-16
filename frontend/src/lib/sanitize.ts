let purify: { sanitize: (dirty: string, cfg?: Record<string, unknown>) => string } | null = null;

function getPurify() {
  if (purify) return purify;
  if (typeof window === 'undefined') {
    purify = { sanitize: (s: string) => s };
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DOMPurify = require('dompurify') as typeof import('dompurify');
    purify = DOMPurify.default ?? DOMPurify;
  }
  return purify;
}

export function sanitizeHTML(dirty: string, config?: Record<string, unknown>): string {
  return getPurify().sanitize(dirty, config);
}
