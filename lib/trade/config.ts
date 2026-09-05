import 'server-only';

export function assertPaperMode(env: Record<string, string | undefined> = process.env) {
  // An absent setting is paper-only too: no environment variable can enable live.
  if ((env.TRADING_MODE ?? 'paper') !== 'paper') {
    throw new Error('Trading startup refused: TRADING_MODE must be paper.');
  }
}

export function tradingConfig() {
  assertPaperMode();
  const broker = process.env.BROKER_PROVIDER ?? 'simulated';
  if (broker !== 'simulated' && broker !== 'webull_paper') throw new Error('Unsupported paper broker.');
  return {
    broker,
    accountId: broker === 'simulated' ? 'quant-lab' : process.env.WEBULL_PAPER_ACCOUNT_ID ?? '',
    adminEmail: process.env.TRADE_ADMIN_EMAIL?.trim().toLowerCase() ?? '',
    llmProvider: process.env.LLM_PROVIDER ?? 'openai',
    model: process.env.LLM_MODEL ?? 'gpt-4.1-mini',
  } as const;
}

export function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
