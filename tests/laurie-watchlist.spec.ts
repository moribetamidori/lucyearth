import { expect, test } from '@playwright/test';

test.use({ channel: 'chrome' });

test('search by company name, save a Webull ticker, and restore it after reload', async ({ page }) => {
  await page.route('**/laurie/api/search?**', route => route.fulfill({ json: { results: [
    { symbol: 'AAPL', name: 'Apple Inc', category: 'US_STOCK' },
    { symbol: 'APLE', name: 'Apple Hospitality Reit Inc', category: 'US_STOCK' },
  ] } }));
  await page.route('**/laurie/api/watchlist', route => route.fulfill({ json: { quotes: [
    { symbol: 'SPY', price: 771.35, preClose: 768.77, asOf: '2026-09-25T20:00:00.000Z' },
    { symbol: 'QQQ', price: 603.10, preClose: 600.00, asOf: '2026-09-25T20:00:00.000Z' },
    { symbol: 'AAPL', price: 341.07, preClose: 338.00, asOf: '2026-09-25T20:00:00.000Z' },
  ] } }));
  await page.goto(`${process.env.LAURIE_TEST_URL ?? 'http://127.0.0.1:3108'}/laurie`);
  await page.waitForFunction(() => localStorage.getItem('laurie-watchlist-v1') !== null);
  const watchlist = page.getByRole('region', { name: 'Watchlist' });
  await expect(watchlist.getByRole('button', { name: 'Show SPY chart' })).toBeVisible();
  await expect(watchlist.getByRole('button', { name: 'Show QQQ chart' })).toBeVisible();
  await expect(watchlist.getByRole('button', { name: /^Show .* chart$/ })).toHaveCount(2);
  await page.getByRole('textbox', { name: 'Search stocks or ETFs' }).fill('Apple');
  await expect(page.getByRole('button', { name: /AAPL Apple Inc Add/ })).toBeVisible();
  await page.getByRole('button', { name: /AAPL Apple Inc Add/ }).click();
  await expect(watchlist.getByText('$341.07')).toBeVisible();
  await watchlist.getByRole('button', { name: 'Show AAPL chart' }).click();
  await expect(page.getByRole('img', { name: /AAPL .* candlestick chart/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select SPY to run' })).toBeDisabled();
  await expect(watchlist.getByRole('button', { name: 'Show AAPL chart' }).getByText('+0.91%')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Ticker overview' })).toHaveCount(0);
  await expect(watchlist.getByRole('button', { name: /^Show .* chart$/ })).toHaveCount(3);
  await expect(watchlist.getByText('Tickers to watch')).toHaveCount(0);
  await page.screenshot({ path: '/private/tmp/laurie-watchlist-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(watchlist.getByText('$341.07')).toBeVisible();
  await page.screenshot({ path: '/private/tmp/laurie-watchlist-mobile.png', fullPage: true });
  await page.reload();
  await expect(watchlist.getByText('Apple Inc')).toBeVisible();
  await expect(watchlist.getByText('$341.07')).toBeVisible();
  await watchlist.getByRole('button', { name: 'Show QQQ chart' }).click();
  await expect(page.getByRole('img', { name: /QQQ .* candlestick chart/ })).toBeVisible();
  await watchlist.getByRole('button', { name: 'Remove AAPL from watchlist' }).click();
  await expect(watchlist.getByRole('button', { name: /^Show .* chart$/ })).toHaveCount(2);
  await expect(watchlist.getByText('Apple Inc')).toHaveCount(0);
});
