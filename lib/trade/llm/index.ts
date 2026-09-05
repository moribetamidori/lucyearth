import 'server-only';
import { z } from 'zod';
import { required, tradingConfig } from '../config';
import { proposalJsonSchema, proposalSchema, type Snapshot } from '../types';
import { traderContext, traderInstructions, type LlmProvider } from './provider';

type Json = Record<string, unknown>;
export class StructuredProvider implements LlmProvider {
  constructor(readonly name: 'openai' | 'anthropic', readonly model: string, private readonly transport: typeof fetch = fetch) {}
  async generateStructured(snapshot: Snapshot) {
    const schema = z.toJSONSchema(proposalJsonSchema);
    const context = traderContext(snapshot);
    const key = required(this.name === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY');
    for (let attempt = 0; attempt < 3; attempt++) {
      const instructions = traderInstructions + (attempt ? '\nThe prior response failed schema validation. Return a complete valid JSON object; do not force a trade.' : '');
      const openai = this.name === 'openai';
      const response = await this.transport(openai ? 'https://api.openai.com/v1/responses' : 'https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: AbortSignal.timeout(20000), redirect: 'error',
        headers: openai ? { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } : { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify(openai ? {
          model: this.model, store: false, max_output_tokens: 1600, instructions, input: context,
          text: { format: { type: 'json_schema', name: 'trade_proposal', strict: true, schema } },
        } : {
          model: this.model, max_tokens: 1600, system: instructions,
          messages: [{ role: 'user', content: context }], output_config: { format: { type: 'json_schema', schema } },
        }),
      });
      if (!response.ok) throw new Error(`LLM provider returned HTTP ${response.status}. No trading action was taken.`);
      const result = await response.json() as Json;
      let text = '';
      if (openai) {
        if (result.status !== 'completed') continue;
        for (const message of (result.output ?? []) as Json[]) {
          for (const content of (message.content ?? []) as Json[]) {
            if (content.type === 'refusal') throw new Error('The model declined the evaluation. No order was created.');
            if (content.type === 'output_text' && typeof content.text === 'string') text += content.text;
          }
        }
      } else {
        if (result.stop_reason !== 'end_turn') continue;
        for (const content of (result.content ?? []) as Json[]) if (content.type === 'text' && typeof content.text === 'string') text += content.text;
      }
      if (text.length > 16000) continue;
      try { const raw: unknown = JSON.parse(text); return { proposal: proposalSchema.parse(raw), raw }; } catch { /* Retry parsing only; never retry a broker operation. */ }
    }
    throw new Error('The model did not produce a valid proposal after three attempts. No order was created.');
  }
}
export function llmProvider(): LlmProvider {
  const config = tradingConfig();
  if (config.llmProvider !== 'openai' && config.llmProvider !== 'anthropic') throw new Error('Unsupported LLM provider.');
  return new StructuredProvider(config.llmProvider, config.model);
}
