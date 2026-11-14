import { expect, test } from '@playwright/test';

test.use({ channel: 'chrome' });

test('option estimates and optional Jev readout use separate actions', async ({ page }) => {
  await page.route(/\/laurie\/api\?/, route => route.fulfill({ json: {
    symbol: 'SPY', dataSource: 'webull_sandbox', sourceLabel: 'Webull sandbox delayed history', accessNote: null, hasMore: false,
    candles: [
      { timestamp: '2026-09-30T13:30:00.000Z', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { timestamp: '2026-09-30T13:31:00.000Z', open: 100, high: 102, low: 100, close: 101, volume: 1200 },
    ],
  } }));
  await page.route('**/laurie/api/options?**', route => route.fulfill({ json: {
    underlying: 'SPY', underlyingPrice: 101, underlyingTime: '2026-09-30T13:31:00Z', expiration: '2026-10-16',
    historyEnd: '2026-09-29T20:00:00Z', historyDays: 259, paths: 2000,
    sourceLabel: 'Webull sandbox delayed option bid/ask · before fees', contracts: [{ symbol: 'SPY261016C00100000',
      expiration: '2026-10-16', strike: 100, type: 'CALL', multiplier: 100, bid: 4.9, ask: 5,
      impliedVolatility: 0.2, openInterest: 200, quoteTime: '2026-09-30T13:31:00Z',
      expectedPnl: 50, expectedReturnPct: 10, probabilityProfitPct: 42, breakeven: 105, maxLoss: 500 }],
  } }));
  await page.route('**/laurie/api/jev', route => route.fulfill({ json: {
    choice: 'mixed', probabilities: { rising: 0.2, falling: 0.1, mixed: 0.7 },
    note: 'Experimental classification of past price action.',
  } }));
  await page.goto(`${process.env.LAURIE_TEST_URL ?? 'http://127.0.0.1:3109'}/laurie`);
  const options = page.getByRole('region', { name: 'SPY option expected returns' });
  await expect(options.getByRole('button', { name: 'Calculate' })).toBeEnabled();
  await options.getByRole('button', { name: 'Calculate' }).click();
  await expect(options.getByText('+10.0%')).toBeVisible();
  await expect(options.getByText('$50.00')).toBeVisible();
  await options.getByRole('button', { name: 'Ask Jev about recent trend' }).click();
  await expect(options.getByText(/Jev: mixed/)).toBeVisible();
  await expect(options.getByText('+10.0%')).toBeVisible();
});
