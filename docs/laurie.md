# Laurie MVP (`/laurie`)

The main chart sits beside a browser-saved watchlist. SPY and QQQ are pinned at the top; search by company name or ticker to add up to 18 more US stocks or ETFs. Clicking a row changes the chart and ticker header, but never changes the agent's configured paper-order ticker. Suggestions come from Webull's public website search endpoint; watchlist prices, previous closes, and timestamps come from signed Webull sandbox snapshot requests. The daily percentage is `(last price / previous trading close - 1) × 100`. Quotes refresh once per minute while the page is open, subject to Webull market-data permissions, and are always labeled delayed rather than live. Search and quotes show an unavailable state when Webull cannot be reached; no substitute quote prices are generated. The watchlist is local to this browser and does not modify a Webull account watchlist. The Run Agent button is disabled while the selected chart ticker differs from the configured paper ticker.

Laurie is a single-configured-ticker paper trading experiment with a multi-ticker read-only chart. Open `/laurie` after `pnpm dev`. The chart has independent time-range buttons (`1D`, `1W`, `1M`, `3M`, `YTD`, `1Y`, `5Y`, `MAX`) and a candle-interval dropdown (1m, 5m, 15m, 30m, 1h, 4h, 1D, 1W, 1M). Every interval remains selectable at every range. The first page loads up to 800 real Webull bars; scrolling left requests older pages until the range boundary or the provider's available history. This avoids sending a year of minute bars to the browser at once. TradingView Lightweight Charts renders the visible bars and updates when new bars arrive. Browser IndexedDB saves up to 20,000 bars per viewed ticker/range/interval, so revisits can draw immediately while the server checks for newer candles once per minute. The server also keeps a 60-second in-process cache and, after the chart-cache migration, stores fetched pages in Supabase. A first request for an uncached ticker still waits for Webull. The displayed span may be shorter than the selected range until older pages are loaded; unavailable provider history cannot be reconstructed from coarser candles.

With Webull sandbox app credentials, the chart loads actual delayed historical candles for the selected watchlist stock or ETF even while agent execution is in Demo Mode. Without market-data permission or credentials, the chart uses a clearly labeled recorded sample. A Demo Mode Run Agent click produces a deterministic HOLD using recent one-minute Webull bars for the configured agent ticker when available. The journal is saved in this browser's local storage, and also in Supabase when its migration is applied and the configured operator is signed in. No keys or database migration are needed for the browser-only sample flow.

The Options panel fetches standard 100-share US equity/ETF contracts, the underlying quote, option bid/ask, and 260 daily bars from Webull sandbox on demand. For each long call/put, it samples historical daily log returns into 2,000 deterministic expiration paths and reports expected P/L, return on the ask premium, probability of profit, break-even and maximum premium loss. These are historical scenarios, not calibrated forecasts. Fees, dividends, early exercise and future IV changes are excluded; stale or unusable quotes show no estimate. Recorded sample candles are never used. The optional **Ask Jev** button classifies observed recent stock price action through a free OpenJEV key. Jev does not alter option expected returns or place orders. Without `OPENJEV_API_KEY`, this button reports that setup is needed; all chart and option calculations still work.

## Connect Supabase and Webull sandbox

Apply [`20260925000000_laurie_mvp.sql`](../supabase/migrations/20260925000000_laurie_mvp.sql) for the journal, [`20260929000000_laurie_chart_cache.sql`](../supabase/migrations/20260929000000_laurie_chart_cache.sql) for reusable server-side chart pages, and [`20260930000000_laurie_chart_cache_limit.sql`](../supabase/migrations/20260930000000_laurie_chart_cache_limit.sql) to cap that cache at 200,000 bars across all tickers. They use RLS and grant no browser-role access. The chart also works before its cache migration is applied, using browser and in-process caching. Do not run a bulk migration push unless you have reviewed other pending migrations.

Supply these exact values in `.env.local` or the deployment's server environment:

| Value | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing Supabase authentication client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only journal access |
| `TRADE_ADMIN_EMAIL` | Confirmed Supabase Auth operator email |
| `WEBULL_PAPER_APP_KEY` | Webull sandbox app key |
| `WEBULL_PAPER_APP_SECRET` | Matching Webull sandbox app secret |
| `WEBULL_PAPER_ACCOUNT_ID` | Account ID returned by sandbox account discovery in `/trade` |
| `WEBULL_PAPER_ACCESS_TOKEN` | Only if Webull requires a verified access token for this app |
| `OPENAI_API_KEY` | Server-only OpenAI key |
| `OPENJEV_API_KEY` | Optional free third-party Jev readout; no effect on option math |
| `LAURIE_MODE=webull_sandbox` | Explicit sandbox activation |

For the historical chart alone, only `WEBULL_PAPER_APP_KEY` and `WEBULL_PAPER_APP_SECRET` are needed, along with Webull's market-data permission. `WEBULL_PAPER_ACCOUNT_ID` and, when required by Webull, `WEBULL_PAPER_ACCESS_TOKEN` are for account/position/order access; they are not required to display historical bars. `LAURIE_MARKET_DATA=sample` forces the recorded sample, which is useful for offline work and deterministic UI tests. The chart has no production market-data or order path. Webull's minute bars are unadjusted while daily-and-longer bars are forward-adjusted, so price levels can differ slightly at interval boundaries around corporate actions.

`LAURIE_SYMBOL=SPY` is the single-ticker default; `QQQ` is also supported. The MVP risk policy allows only these two values, one at a time. `TRADING_MODE=paper` must remain set. Sign in as the operator at `/trade` in the same browser before using sandbox mode on `/laurie`. If credentials, account access, or the one-minute market-data permission are unavailable, Laurie shows Demo Mode. The banner explains why. The browser never receives Webull or OpenAI credentials.

The sandbox path fetches 1-minute bars, a quote, the account and position, then sends a compact numeric summary to `gpt-4.1-mini` using one Structured Outputs call capped at 180 output tokens. The server applies its own ticker, `$25` maximum order, `$100` maximum position value, funds, data-age, regular-session and existing-order checks. HOLD and blocked trades create no order. Every candidate order is previewed and given a stable client order ID; an uncertain submission stays marked unknown and must be reconciled through Webull before another order attempt. No production endpoint is present.

The model's cost fields use the published standard input/output token rates and reported token usage; the actual invoice may differ. The sandbox may supply 15-minute delayed market data. Laurie labels that data as delayed and rejects order data older than 17 minutes. The broker's `CORE` session validation is an additional gate for holidays and early closes.

## Verification

Run `pnpm typecheck`, `pnpm build`, and the Laurie browser test. Sandbox verification also requires a pinned sandbox account ID, an OpenAI key, operator access and Webull permissions. Never test sandbox submission by blindly retrying an uncertain response.
