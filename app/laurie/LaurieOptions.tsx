'use client';

import { useEffect, useRef, useState } from 'react';
import type { OptionAnalysis } from '@/lib/laurie/options';

const usd = (value: number) => `$${value.toFixed(2)}`;
const percent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

export default function LaurieOptions({ symbol, category, sample }: { symbol: string; category: 'US_STOCK' | 'US_ETF'; sample: boolean }) {
  const [expiration, setExpiration] = useState('');
  const [analysis, setAnalysis] = useState<OptionAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jev, setJev] = useState<{ choice: string; probabilities: Record<string, number>; note: string } | null>(null);
  const [jevLoading, setJevLoading] = useState(false);
  const [jevError, setJevError] = useState<string | null>(null);
  const currentTicker = useRef('');
  const requestId = useRef(0);
  const jevRequestId = useRef(0);
  currentTicker.current = `${category}:${symbol}`;
  useEffect(() => {
    requestId.current++; jevRequestId.current++;
    setAnalysis(null); setExpiration(''); setError(null); setJev(null); setJevError(null);
    setLoading(false); setJevLoading(false);
  }, [symbol, category]);
  async function load() {
    const id = ++requestId.current;
    const ticker = currentTicker.current;
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ symbol, category, ...(expiration ? { expiration } : {}) });
      const response = await fetch(`/laurie/api/options?${query}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Option data unavailable.');
      if (id === requestId.current && ticker === currentTicker.current) {
        setAnalysis(data as OptionAnalysis); setExpiration(data.expiration);
      }
    } catch (cause) {
      if (id === requestId.current && ticker === currentTicker.current) {
        setAnalysis(null); setError(cause instanceof Error ? cause.message : 'Option data unavailable.');
      }
    } finally { if (id === requestId.current && ticker === currentTicker.current) setLoading(false); }
  }
  async function askJev() {
    const id = ++jevRequestId.current;
    const ticker = currentTicker.current;
    setJevLoading(true); setJevError(null);
    try {
      const response = await fetch('/laurie/api/jev', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, category }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Jev is unavailable.');
      if (id === jevRequestId.current && ticker === currentTicker.current) setJev(data);
    } catch (cause) {
      if (id === jevRequestId.current && ticker === currentTicker.current) setJevError(cause instanceof Error ? cause.message : 'Jev is unavailable.');
    } finally { if (id === jevRequestId.current && ticker === currentTicker.current) setJevLoading(false); }
  }
  return <section className="rounded-2xl border border-[#e6e9e2] bg-[#fffefd] p-6 shadow-[0_17px_45px_#374b3908] max-sm:p-[18px]" aria-label={`${symbol} option expected returns`}>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><span className="text-[9px] font-bold tracking-[.16em] text-[#789481]">OPTIONS / EXPIRATION</span>
        <h3 className="mt-2 font-serif text-[21px] tracking-tight text-[#26342e]">{symbol} expected return</h3>
        <p className="mt-1 text-[10px] leading-4 text-[#839184]">Long calls and puts held to expiration · one contract · historical return scenarios</p></div>
      <div className="flex items-end gap-2"><label className="text-[10px] font-semibold text-[#839184]">Expiration
        <input type="date" value={expiration} onChange={event => setExpiration(event.target.value)} min={new Date().toISOString().slice(0, 10)}
          className="mt-1 block rounded-lg border border-[#e1e8df] bg-white px-2.5 py-1.5 text-[11px] text-[#355b47]" /></label>
        <button type="button" onClick={load} disabled={loading || sample} className="rounded-lg bg-[#355b47] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50">{loading ? 'Loading…' : 'Calculate'}</button></div>
    </div>
    {sample && <p className="mt-5 rounded-lg bg-[#f7f4eb] p-3 text-[11px] text-[#8f7856]">Real Webull stock and option quotes are required. Recorded sample prices are excluded from this calculation.</p>}
    {error && <p className="mt-5 rounded-lg bg-[#fbf0ed] p-3 text-[11px] text-[#a55f53]" role="alert">{error}</p>}
    {analysis && !sample && <>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-[#718276]"><span>Stock {usd(analysis.underlyingPrice)}</span><span>Expiry {analysis.expiration}</span><span>{analysis.historyDays} daily observations</span><span>{analysis.paths.toLocaleString()} paths</span></div>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-[10px] tabular-nums">
        <thead className="border-b border-[#e8eee6] text-[#8d9b8f]"><tr><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Strike</th><th className="py-2 pr-3">Bid / Ask</th><th className="py-2 pr-3">Est. return</th><th className="py-2 pr-3">Est. P/L</th><th className="py-2 pr-3">P(profit)</th><th className="py-2 pr-3">Break even</th><th className="py-2">Max loss</th></tr></thead>
        <tbody>{analysis.contracts.map(contract => <tr key={contract.symbol} className="border-b border-[#f0f2ec] text-[#53665a]"><td className="py-2 pr-3 font-semibold">{contract.type}</td><td className="py-2 pr-3">{usd(contract.strike)}</td>
          <td className="py-2 pr-3">{contract.bid === null ? '—' : usd(contract.bid)} / {contract.ask === null ? '—' : usd(contract.ask)}</td>
          <td className={`py-2 pr-3 font-semibold ${contract.expectedReturnPct === null ? '' : contract.expectedReturnPct >= 0 ? 'text-[#4e8565]' : 'text-[#b8796d]'}`}>{contract.expectedReturnPct === null ? '—' : percent(contract.expectedReturnPct)}</td>
          <td className="py-2 pr-3">{contract.expectedPnl === null ? '—' : usd(contract.expectedPnl)}</td><td className="py-2 pr-3">{contract.probabilityProfitPct === null ? '—' : `${contract.probabilityProfitPct.toFixed(1)}%`}</td>
          <td className="py-2 pr-3">{contract.breakeven === null ? '—' : usd(contract.breakeven)}</td><td className="py-2">{contract.maxLoss === null ? '—' : usd(contract.maxLoss)}</td></tr>)}</tbody>
      </table></div>
      <p className="mt-4 text-[10px] leading-5 text-[#879389]">{analysis.sourceLabel}. The estimate resamples past daily returns; it is a scenario calculation, not a forecast or a Jev prediction. It excludes fees, early exercise, dividends, and changes in implied volatility. “—” means a usable synchronized bid/ask was unavailable.</p>
      <div className="mt-4 border-t border-[#edf0e9] pt-4"><button type="button" onClick={askJev} disabled={jevLoading} className="rounded-lg border border-[#bcd0be] px-3 py-2 text-[10px] font-semibold text-[#426b50] disabled:opacity-50">{jevLoading ? 'Asking Jev…' : 'Ask Jev about recent trend'}</button>
        {jev && <p className="mt-2 text-[10px] text-[#6c7c70]">Jev: {jev.choice} · {Object.entries(jev.probabilities).map(([name, probability]) => `${name} ${(probability * 100).toFixed(0)}%`).join(' / ')}. {jev.note}</p>}
        {jevError && <p className="mt-2 text-[10px] text-[#a55f53]" role="status">{jevError}</p>}
      </div>
    </>}
    {!analysis && !error && !sample && <p className="mt-5 text-[11px] text-[#9ca89e]">Choose an expiration or calculate the nearest listed expiration.</p>}
  </section>;
}
