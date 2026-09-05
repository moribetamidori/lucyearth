import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the committable environment template never contains credential values', async () => {
  const template = await readFile(new URL('../../.env.example', import.meta.url), 'utf8');
  for (const line of template.split('\n')) {
    const match = line.match(/^([A-Z0-9_]*(?:SECRET|TOKEN|API_KEY|APP_KEY|ACCESS_KEY_ID|SERVICE_ROLE_KEY)[A-Z0-9_]*)=(.*)$/);
    if (match) assert.ok(['', '""', "''"].includes(match[2].trim()), `${match[1]} must remain empty in .env.example; move credentials to ignored server configuration.`);
  }
});
