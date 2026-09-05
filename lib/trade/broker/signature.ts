import { createHash, createHmac } from 'node:crypto';

// Pure signer; only the transport decides the host. Matches Webull's published vector.
export function signature(input: { path: string; query: Record<string, string>; body: string; appKey: string; appSecret: string; host: string; timestamp: string; nonce: string }) {
  const params: Record<string, string> = {
    ...input.query, host: input.host, 'x-app-key': input.appKey, 'x-timestamp': input.timestamp,
    'x-signature-algorithm': 'HMAC-SHA1', 'x-signature-version': '1.0', 'x-signature-nonce': input.nonce,
  };
  const canonical = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  const digest = input.body ? `&${createHash('md5').update(input.body).digest('hex').toUpperCase()}` : '';
  const encoded = encodeURIComponent(`${input.path}&${canonical}${digest}`).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return createHmac('sha1', `${input.appSecret}&`).update(encoded).digest('base64');
}
