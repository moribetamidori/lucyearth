# Autonomous Quant Lab — `/trade`

RSI means **Recursive Self-Improvement**. This is experimental infrastructure, not a profitable strategy or an RSI-indicator bot.

## Current delivery

Milestone 1 is implemented and tested end-to-end with the persistent simulator and embedded PostgreSQL. The Webull sandbox adapter has official-schema contract tests, but **has not been verified against your account**. No Webull order has been placed. Applying the database migration, configuring the operator, and supplying sandbox credentials are still required.

The six views are `/trade`, `/trade/decisions`, `/trade/trades`, `/trade/strategies`, `/trade/lab`, and `/trade/logs`. All controls are under `/trade/api/*`. Existing site routes are unchanged.

Critic, Improver, backtesting, OOS/walk-forward/adversarial evaluation, promotion, and scheduling are deliberately **not enabled or implemented yet**. Their database foundations and honest UI placeholders are present. Per the milestone gate, implement them only after the real sandbox acceptance checklist below passes. There are no fabricated evaluation metrics or autonomous loops.

## Add your credentials here

Edit the existing **`.env.local` at the repository root**. Merge the following values; do not overwrite your existing website configuration. Never paste credentials into chat, screenshots, frontend code, or Git. `.env.example` contains names and safe defaults only.

```dotenv
TRADING_MODE=paper
BROKER_PROVIDER=webull_paper
WEBULL_PAPER_APP_KEY=your_sandbox_app_key
WEBULL_PAPER_APP_SECRET=your_sandbox_app_secret
WEBULL_PAPER_ACCOUNT_ID=
# Only if your sandbox application requires an access token:
WEBULL_PAPER_ACCESS_TOKEN=

TRADE_ADMIN_EMAIL=your_confirmed_supabase_user_email
TRADE_APP_ORIGIN=http://localhost:3000

LLM_PROVIDER=openai
LLM_MODEL=gpt-4.1-mini
OPENAI_API_KEY=your_server_side_key
```

An App Key alone is insufficient: Webull also requires the matching **App Secret**. Use a **sandbox-issued** application/key pair; a live brokerage key must not be used. No endpoint environment variable can redirect this adapter to production. Account discovery works before `WEBULL_PAPER_ACCOUNT_ID` is populated; copy the returned sandbox account ID into that variable and restart.

Existing Supabase variables are reused: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`. Public Supabase URL/anon key are not brokerage credentials; RLS and revoked table/RPC permissions prevent them from accessing trading data.

For Anthropic, select `LLM_PROVIDER=anthropic`, set an available structured-output-compatible `LLM_MODEL`, and supply `ANTHROPIC_API_KEY` instead. The existing site's Gemini configuration is not changed. All providers validate a strict schema; malformed output gets at most three attempts, refusals stop, and failures never invoke the broker.

For credential-free synthetic market data, use `BROKER_PROVIDER=simulated` and select **Simulation baseline** in the UI. Database and operator setup are still required. This explicitly labeled deterministic driver cannot be selected for Webull.

## Database and operator setup

1. In your existing Supabase project, apply **only** `supabase/migrations/20260904000000_trade_lab.sql` through the SQL editor or your normal reviewed migration workflow. This creates isolated `trade_*` objects without changing existing site tables. Do not blindly push unrelated pending migrations. This delivery does not apply remote migrations automatically.
2. In Supabase Authentication, create/confirm the operator's email/password user. Set `TRADE_ADMIN_EMAIL` to that exact email. There is no public trading signup or shared frontend password. Sign in on `/trade` using that user's password.
3. Add the variables above and restart `pnpm dev`. Open `http://localhost:3000/trade`.
4. For deployment, set the same secrets in the hosting provider's **server environment**, and set `TRADE_APP_ORIGIN` to the exact public HTTPS origin (no `/trade` suffix). POST controls fail closed in production without a pinned origin. Use a Node.js runtime with a request duration of at least 180 seconds; never deploy this as a static export.

New account namespaces start with entries **paused**. Simulation and Webull data are separated by provider/account keys. Use a dedicated, otherwise idle sandbox account; do not trade concurrently from another client during this experiment.

## Real Webull acceptance checklist

1. Sign in, choose **Discover accounts**, pin the returned sandbox ID, and restart.
2. **Refresh market data** for SPY. Verify the sandbox balance, positions, quote timestamp/delay, and closed 15-minute bars. Sandbox data may be delayed 15 minutes; the UI labels it. Missing entitlement, inadequate warmup, stale data, unsupported positions, or unknown schemas block trading.
3. Explicitly enable manual entries, select **LLM trader**, and **Run market evaluation**. Inspect the immutable decision context and risk result. `NO_TRADE`/`HOLD` is a successful decision, not an error; do not force a trade to pass this step.
4. For an allowed proposal during the regular US session, open its decision and request a **paper order preview**. Verify exact symbol, side, amount/quantity, fees, and warnings. Preview does not place an order.
5. Only if you personally want this paper order, click **Approve Webull PAPER order** within 60 seconds. This is the only submission path. Account state, risk, fees, and strategy are rechecked; approval is one-use and bound to canonical persisted terms.
6. Open **Orders & trades**. Confirm Webull's readback status and client/broker IDs. Use **Reconcile orders** until fills/cancellation are confirmed. A placement acknowledgment is not a fill. Missing fee settlement is labeled provisional and can be reconciled later.
7. Confirm the decision, approval, order, fills, attributed lots, and events persist after restarting. Check a replayed approval is refused and an unfilled order can be cancelled. Record the acceptance results before starting milestone 2.

### Important Webull caveat

V1 uses small cash-notional MARKET buys (baseline $25) because a whole SPY/QQQ share exceeds the default $100 ceiling. Fractional LIMIT orders are disabled. The official place-order schema documents `entrust_type=AMOUNT` with `total_cash_amount`; the preview schema lists AMOUNT but omits the cash-amount field. The adapter sends **the same exact terms** to both endpoints and requires a matching consideration estimate. If sandbox preview does not support those terms, it blocks submission. Verify this with your credentials; do not silently substitute a quantity preview or raise risk limits to work around it.

Stops and targets are recorded research annotations, **not broker-held protection**. There are no automatic exits or emergency liquidations in milestone 1. You must monitor paper positions manually. Sales cannot short and can only close quantities attributable to this lab's recorded entry lots. Preexisting holdings are observed but not automatically imported into the trade ledger.

## Architecture and safety boundary

```text
/trade UI → verified operator API → TradingService
  → immutable market snapshot → structured Trader proposal
  → deterministic risk policy → broker preview
  → exact, expiring human approval → durable submission intent
  → Webull sandbox / persistent simulator → readback → atomic fills & FIFO lots
```

- `lib/trade/broker/interface.ts`: normalized account, quotes, bars, positions, open/history/detail orders, preview, place, cancel.
- `lib/trade/broker/webull_paper.ts`: server-only signed REST adapter; hardcoded `https://api.sandbox.webull.com`, redirect rejection, timeouts, shared request quotas, no automatic submission retry. No live adapter exists.
- `lib/trade/risk/policy.ts`: isolated deterministic, frozen policy. Only a human deployment/configuration change can alter it. The model has no tools, filesystem, credentials, deployment access, or risk-edit API.
- `lib/trade/llm/`: OpenAI/Anthropic abstraction and structured response validation. No generated code is executed.
- `lib/trade/strategies/v1.json`: versioned declarative SPY/QQQ baseline using EMA20/EMA50/ATR14/volume ratio/recent returns. Not optimized for profitability.
- `lib/trade/server/service.ts`: manual `runTrader`, snapshot, preview, approve, cancel, reconciliation. Durable account leases and PostgreSQL atomic approval consumption serialize app actions. Unknown submissions remain reserved and block replacement orders.
- Database: strategies, immutable agent decisions, orders, append-only approvals/fills/events/account snapshots, FIFO trade lots, reviews, experiments, manual job runs, simulator ledger, and shared quotas. All trading tables and privileged RPCs are denied to browser roles. Decision snapshots contain only closed bars available at that time. MAE/MFE remain null until a valid excursion measurement pipeline exists.

Default limits: SPY/QQQ only, $100/order, 1% equity/position, 2% total exposure, $25 daily loss, two positions, four submitted orders per NY day. Pending exposure is reserved. Explicit reductions and cancellations remain possible while new entries are paused or daily entry limits are hit. The simulator may operate outside market hours; Webull uses both a NY regular-hours guard and `CORE` session orders. Holidays/early closes are ultimately enforced by the broker.

Account metrics are snapshot values, not streaming prices. Realized P&L is aggregated over all recorded closed lots; tables display recent bounded histories (100 decisions, 200 orders/lots, 150 events). Full evidence remains in PostgreSQL. External deposits/withdrawals and external trades are not a supported performance-accounting workflow.

If a request times out, **do not submit a replacement**. Reconcile using its existing client order ID. A persistent not-found, corrected fill price, unsupported order, or unmatched external fill requires inspecting the sandbox and audited operator intervention; there is intentionally no unsafe “clear unknown” button.

## Next milestones (not enabled)

After sandbox acceptance: implement separate structured Critic and small declarative Improver mutations; deterministic replay with next-bar order timing, transaction costs/spread/slippage and stops/targets; chronological train/validation/held-out OOS splits with a frozen dataset manifest; walk-forward and adverse-fill/regime/parameter stress tests. Promotion must require minimum sample size, meaningful improvement across periods, controlled drawdown and no catastrophic regime failure—not a tiny Sharpe increase. A manual approval may authorize paper testing; only separately reviewed paper-test evidence may replace the current strategy. Schedule jobs only after that entire manual workflow is reliable.

## Verification

```bash
pnpm test:trade       # Unit, broker contract and embedded PostgreSQL end-to-end tests
pnpm test:bd          # Existing site's regression tests
pnpm typecheck
pnpm exec eslint app/trade lib/trade tests/trade instrumentation.ts
pnpm build
pnpm test:trade:ui    # Local desktop/mobile UI and real unauthenticated API checks
```

When another dev server is running, use `TRADE_BUILD_ISOLATED=1 pnpm build` to avoid sharing its build output. To test that production build, use `TRADE_UI_PRODUCTION=1 pnpm test:trade:ui`. Trading UI tests always use `.next-trade`; normal deployment still uses `.next`.

UI tests use Playwright Chromium (install with `pnpm exec playwright install chromium` if absent), force operator access off, and intercept authenticated UI data. They cannot place a brokerage order. The integration tests use an in-memory PostgreSQL instance and synthetic fills, not your Supabase data.

## Official documentation checked

The official REST schemas were inspected rather than guessed from older SDK paths. `scripts/trade/inspect-webull-docs.mjs` reads the reference site's compressed schema assets without executing them; it makes no brokerage calls and uses no credentials.

- [Webull API documentation](https://developer.webull.com/apis/docs/)
- [Account balance](https://developer.webull.com/apis/docs/reference/account-balance/)
- [Instrument profile and fractional permissions](https://developer.webull.com/apis/docs/reference/instrument-list/)
- [Order history](https://developer.webull.com/apis/docs/reference/order-history/)
- [Order preview](https://developer.webull.com/apis/docs/reference/common-order-preview/)
- [OpenAI structured outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

Sandbox endpoints used: `/trading/accounts/list`, `/trading/assets/balances/get`, `/trading/assets/positions/list`, `/market-data/stocks/snapshots/list`, `/market-data/stocks/bars/list`, `/trading/instruments/stocks/profiles/list`, `/trading/orders/open-orders/list`, `/trading/orders/historical-orders/list`, `/trading/orders/get`, `/trading/orders/preview`, `/trading/orders/place`, `/trading/orders/cancel`.
