import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('Laurie schema keeps its journal private and serializes runs', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;');
    await db.exec(await readFile(new URL('../supabase/migrations/20260925000000_laurie_mvp.sql', import.meta.url), 'utf8'));
    const first = '11111111-1111-4111-8111-111111111111';
    const second = '22222222-2222-4222-8222-222222222222';
    assert.equal((await db.query<{ ok: boolean }>('select laurie_acquire_run($1) as ok', [first])).rows[0].ok, true);
    assert.equal((await db.query<{ ok: boolean }>('select laurie_acquire_run($1) as ok', [second])).rows[0].ok, false);
    await db.query('select laurie_release_run($1)', [first]);
    assert.equal((await db.query<{ ok: boolean }>('select laurie_acquire_run($1) as ok', [second])).rows[0].ok, true);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from laurie_agent_runs'), /permission denied/);
      await assert.rejects(db.query('select laurie_acquire_run($1)', [first]), /permission denied/);
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});
