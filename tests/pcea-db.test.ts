import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrations = ['20261113000000_pcea.sql', '20261113010000_pcea_location.sql']
  .map(name => new URL(`../supabase/migrations/${name}`, import.meta.url));

async function setup() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');
  for (const migration of migrations) await db.exec(await readFile(migration, 'utf8'));
  const user = (await db.query<{ id: string; user_number: number }>(
    "insert into pcea_users(token_hash) values ('h1') returning id, user_number")).rows[0];
  return { db, user };
}

test('PCEA tables are private to the server', async () => {
  const { db } = await setup();
  try {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      for (const table of ['pcea_users', 'pcea_events', 'pcea_responses']) {
        await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
      }
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});

test('upcoming events accept predictions but not attendance', async () => {
  const { db, user } = await setup();
  try {
    assert.equal(user.user_number, 1);
    const ev = (await db.query<{ id: string }>(
      "insert into pcea_events(event_date, timezone, title, created_by) values (current_date + 3, 'America/New_York', 'Picnic', $1) returning id",
      [user.id])).rows[0];
    await db.query("insert into pcea_responses(event_id, user_id, probability, interest) values ($1, $2, 68, 'high')", [ev.id, user.id]);
    await db.query('update pcea_responses set probability = 80 where event_id = $1', [ev.id]);
    await assert.rejects(db.query('update pcea_responses set attended = true where event_id = $1', [ev.id]), /pcea_not_finished/);
    await assert.rejects(db.query("insert into pcea_responses(event_id, user_id, probability, interest) values ($1, $2, 101, 'high')", [ev.id, user.id]), /check/);
    await assert.rejects(db.query("insert into pcea_events(event_date, timezone, title, created_by) values (current_date + 1, 'Not/AZone', 'x', $1)", [user.id]), /time zone/);
    await assert.rejects(db.query("insert into pcea_events(event_date, timezone, title, created_by) values (current_date - 3, 'UTC', 'old', $1)", [user.id]), /pcea_event_in_past/);
  } finally { await db.close(); }
});

test('finished events lock the prediction and accept attendance', async () => {
  const { db, user } = await setup();
  try {
    const ev = (await db.query<{ id: string }>(
      "insert into pcea_events(event_date, timezone, title, created_by) values (current_date + 3, 'UTC', 'Concert', $1) returning id",
      [user.id])).rows[0];
    await db.query("insert into pcea_responses(event_id, user_id, probability, interest, note) values ($1, $2, 50, 'some', 'maybe')", [ev.id, user.id]);
    // Move the event into the past, bypassing the guard as time passing would.
    await db.exec("set session_replication_role = replica");
    await db.query('update pcea_events set event_date = current_date - 2 where id = $1', [ev.id]);
    await db.exec("set session_replication_role = origin");

    await assert.rejects(db.query('update pcea_responses set probability = 100 where event_id = $1', [ev.id]), /pcea_locked/);
    await assert.rejects(db.query("update pcea_responses set interest = 'high' where event_id = $1", [ev.id]), /pcea_locked/);
    await db.query("update pcea_responses set attended = true, note = 'went after all' where event_id = $1", [ev.id]);
    const other = (await db.query<{ id: string }>("insert into pcea_users(token_hash) values ('h2') returning id")).rows[0];
    await assert.rejects(db.query("insert into pcea_responses(event_id, user_id, probability, interest) values ($1, $2, 20, 'none')", [ev.id, other.id]), /pcea_locked/);
    await assert.rejects(db.query('update pcea_events set event_date = current_date + 5 where id = $1', [ev.id]), /pcea_locked/);
    await db.query("update pcea_events set title = 'Concert (renamed)' where id = $1", [ev.id]);
    await assert.rejects(db.query('delete from pcea_responses where event_id = $1', [ev.id]), /pcea_locked/);
    // Deleting the whole event (or user) still cascades.
    await db.query('delete from pcea_events where id = $1', [ev.id]);
    assert.equal((await db.query('select * from pcea_responses')).rows.length, 0);
  } finally { await db.close(); }
});

test('event locations are optional and bounded', async () => {
  const { db, user } = await setup();
  try {
    const insert = (location: string | null) => db.query(
      "insert into pcea_events(event_date, timezone, title, created_by, location) values (current_date + 3, 'UTC', 'Drive', $1, $2)", [user.id, location]);
    await insert(null);
    await insert('1600 Amphitheatre Pkwy, Mountain View, CA');
    await assert.rejects(insert('   '), /check/);
    await assert.rejects(insert('x'.repeat(301)), /check/);
  } finally { await db.close(); }
});
