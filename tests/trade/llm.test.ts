import assert from 'node:assert/strict';
import test from 'node:test';
import { StructuredProvider } from '../../lib/trade/llm';
import { simulatedBaseline } from '../../lib/trade/agents/trader';
import { snapshot } from './fixtures';

test('structured provider retries malformed output without tools and validates the eventual proposal', async () => {
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'test-fixture-not-a-secret';
  try {
    let calls = 0;
    const provider = new StructuredProvider('openai', 'fixture-model', async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.tools, undefined); assert.equal(body.store, false); assert.equal(body.text.format.strict, true);
      assert.equal(String(init?.body).includes('test-fixture-not-a-secret'), false);
      assert.equal(body.text.format.schema.additionalProperties, false);
      const output = calls++ === 0 ? '{broken' : JSON.stringify(simulatedBaseline(snapshot()));
      return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: output }] }] });
    });
    assert.equal((await provider.generateStructured(snapshot())).proposal.action, 'BUY');
    assert.equal(calls, 2);
  } finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});
test('model refusal stops immediately and invalid responses exhaust a bounded retry budget', async () => {
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'test-fixture';
  try {
    let calls = 0;
    const refusal = new StructuredProvider('openai', 'fixture-model', async () => { calls++; return Response.json({ status: 'completed', output: [{ content: [{ type: 'refusal' }] }] }); });
    await assert.rejects(refusal.generateStructured(snapshot()), /declined/); assert.equal(calls, 1);
    const invalid = new StructuredProvider('openai', 'fixture-model', async () => { calls++; return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: '{"action":"BUY","override_risk":true}' }] }] }); });
    await assert.rejects(invalid.generateStructured(snapshot()), /three attempts/); assert.equal(calls, 4);
  } finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});
