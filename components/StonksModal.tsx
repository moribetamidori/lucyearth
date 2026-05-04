'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, type StonksEntry } from '@/lib/supabase';

type StonksModalProps = {
  isOpen: boolean;
  onClose: () => void;
  anonId?: string;
  onLogActivity?: (action: string, details?: string) => void;
};

type MonthEntry = {
  key: string;
  label: string;
  kMade: number;
  active: boolean;
};

const LEVEL_SIZE_K = 20;
const CURRENT_YEAR = new Date().getFullYear();
const STONKS_TABLE = 'stonks_entries';
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const makeDefaultMonths = () =>
  MONTHS.map((label, index) => ({
    key: `${index}`,
    label,
    kMade: 0,
    active: true,
  }));

const clampK = (value: number) => Math.min(999, Math.max(0, Math.round(value)));

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const parts = [record.message, record.code, record.details, record.hint]
      .filter((part): part is string => typeof part === 'string' && part.length > 0);

    if (parts.length > 0) return parts.join(' | ');
  }

  return 'Unknown Supabase error';
};

export default function StonksModal({
  isOpen,
  onClose,
  anonId,
  onLogActivity,
}: StonksModalProps) {
  const [months, setMonths] = useState<MonthEntry[]>(makeDefaultMonths);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().getMonth());
  const [loading, setLoading] = useState(false);
  const [savingMonth, setSavingMonth] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProgress = async () => {
      if (!isOpen || !anonId) return;
      setLoading(true);
      setError('');

      try {
        const { data, error: fetchError } = await supabase
          .from(STONKS_TABLE)
          .select('*')
          .eq('anon_id', anonId)
          .eq('entry_year', CURRENT_YEAR)
          .order('month_index', { ascending: true });

        if (fetchError) throw fetchError;

        const rowsByMonth = new Map(
          ((data ?? []) as StonksEntry[]).map((row) => [
            row.month_index,
            row,
          ])
        );

        setMonths(
          makeDefaultMonths().map((month, index) => {
            const row = rowsByMonth.get(index);
            return row
              ? {
                  ...month,
                  kMade: clampK(row.k_made),
                  active: row.active,
                }
              : month;
          })
        );
      } catch (fetchError) {
        console.warn('Failed to load stonks progress', fetchError);
        setError(
          `Could not load stonks progress from ${STONKS_TABLE}: ${getErrorMessage(fetchError)}`
        );
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      onLogActivity?.('Opened Stonks', 'Viewed trading level progress');
      void fetchProgress();
    }
  }, [anonId, isOpen, onLogActivity]);

  const stats = useMemo(() => {
    const activeMonths = months.filter((month) => month.active);
    const totalK = activeMonths.reduce((sum, month) => sum + month.kMade, 0);
    const level = Math.floor(totalK / LEVEL_SIZE_K);
    const nextLevelTarget = (level + 1) * LEVEL_SIZE_K;
    const currentLevelStart = level * LEVEL_SIZE_K;
    const progressK = totalK - currentLevelStart;
    const progressPercent = Math.min(100, (progressK / LEVEL_SIZE_K) * 100);
    const bestMonth = months.reduce(
      (best, month) => (month.kMade > best.kMade ? month : best),
      months[0]
    );
    const greenMonths = months.filter((month) => month.active && month.kMade > 0).length;
    const streak = months.reduce((run, month) => {
      if (!month.active) return run;
      return month.kMade > 0 ? run + 1 : 0;
    }, 0);

    return {
      activeMonths: activeMonths.length,
      totalK,
      level,
      nextLevelTarget,
      progressK,
      progressPercent,
      remainingK: nextLevelTarget - totalK,
      bestMonth,
      greenMonths,
      streak,
      averageK:
        activeMonths.length > 0 ? Math.round(totalK / activeMonths.length) : 0,
    };
  }, [months]);

  const saveMonth = async (index: number, nextMonth: MonthEntry) => {
    if (!anonId) {
      setError('Waiting for user id before saving.');
      return;
    }

    setSavingMonth(index);
    setError('');

    try {
      const { error: upsertError } = await supabase
        .from(STONKS_TABLE)
        .upsert(
          {
            anon_id: anonId,
            entry_year: CURRENT_YEAR,
            month_index: index,
            k_made: nextMonth.kMade,
            active: nextMonth.active,
          },
          { onConflict: 'anon_id,entry_year,month_index' }
        );

      if (upsertError) throw upsertError;
    } catch (saveError) {
      console.warn('Failed to save stonks progress', saveError);
      setError(
        `Could not save this stonks entry to ${STONKS_TABLE}: ${getErrorMessage(saveError)}`
      );
    } finally {
      setSavingMonth(null);
    }
  };

  const updateMonth = (index: number, changes: Partial<MonthEntry>) => {
    let changedMonth: MonthEntry | null = null;

    setMonths((current) =>
      current.map((month, monthIndex) => {
        if (monthIndex !== index) return month;
        changedMonth = { ...month, ...changes };
        return changedMonth;
      })
    );

    if (changedMonth) {
      void saveMonth(index, changedMonth);
    }
  };

  const resetRun = async () => {
    if (!confirm('Reset all stonks progress?')) return;

    const resetMonths = makeDefaultMonths();
    setMonths(resetMonths);
    setError('');

    if (!anonId) {
      setError('Waiting for user id before saving.');
      return;
    }

    setLoading(true);

    try {
      const { error: upsertError } = await supabase
        .from(STONKS_TABLE)
        .upsert(
          resetMonths.map((month, index) => ({
            anon_id: anonId,
            entry_year: CURRENT_YEAR,
            month_index: index,
            k_made: month.kMade,
            active: month.active,
          })),
          { onConflict: 'anon_id,entry_year,month_index' }
        );

      if (upsertError) throw upsertError;
      onLogActivity?.('Reset Stonks', 'Cleared trading progress');
    } catch (resetError) {
      console.warn('Failed to reset stonks progress', resetError);
      setError(
        `Could not reset stonks progress in ${STONKS_TABLE}: ${getErrorMessage(resetError)}`
      );
    } finally {
      setLoading(false);
    }
  };

  const selected = months[selectedMonth];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="bg-white border-4 border-gray-900 w-full max-w-5xl max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '8px 8px 0 0 #000' }}
      >
        <div className="sticky top-0 bg-white border-b-4 border-gray-900 z-10 p-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">STONKS</h2>
            <p className="text-sm text-gray-600">
              {CURRENT_YEAR} run. Level up every 20k in active monthly gains.
              <span className="block text-xs text-gray-500">Table: {STONKS_TABLE}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 border-2 border-gray-900 hover:bg-red-500 hover:text-white text-2xl leading-none shrink-0"
          >
            x
          </button>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-0">
          <div className="p-5 border-b-4 lg:border-b-0 lg:border-r-4 border-gray-900">
            {(loading || error) && (
              <div
                className={`border-2 border-gray-900 px-3 py-2 mb-4 text-sm ${
                  error ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-gray-700'
                }`}
              >
                {error || 'Loading stonks progress...'}
              </div>
            )}

            <div className="border-4 border-gray-900 bg-emerald-50 p-4 mb-5">
              <div className="flex items-end justify-between gap-3 mb-3">
                <div>
                  <div className="text-sm text-gray-600">CURRENT LEVEL</div>
                  <div className="text-5xl font-bold leading-none">LVL {stats.level}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">TOTAL</div>
                  <div className="text-3xl font-bold">{stats.totalK}k</div>
                </div>
              </div>

              <div className="h-8 border-4 border-gray-900 bg-white overflow-hidden">
                <div
                  className="h-full bg-green-400 border-r-4 border-gray-900 transition-all"
                  style={{ width: `${stats.progressPercent}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-gray-700">
                <span>{stats.progressK}k / 20k to next level</span>
                <span>{stats.remainingK}k until LVL {stats.level + 1}</span>
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3 mb-5">
              <div className="border-2 border-gray-900 p-3 bg-white">
                <div className="text-xs text-gray-500">AVG ACTIVE MONTH</div>
                <div className="text-2xl font-bold">{stats.averageK}k</div>
              </div>
              <div className="border-2 border-gray-900 p-3 bg-white">
                <div className="text-xs text-gray-500">GREEN MONTHS</div>
                <div className="text-2xl font-bold">{stats.greenMonths}</div>
              </div>
              <div className="border-2 border-gray-900 p-3 bg-white">
                <div className="text-xs text-gray-500">BEST MONTH</div>
                <div className="text-2xl font-bold">
                  {stats.bestMonth.label} {stats.bestMonth.kMade}k
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {months.map((month, index) => {
                const height = Math.min(100, (month.kMade / LEVEL_SIZE_K) * 100);
                return (
                  <button
                    key={month.key}
                    onClick={() => setSelectedMonth(index)}
                    className={`text-left border-4 border-gray-900 bg-white p-3 min-h-[142px] transition-transform hover:-translate-y-0.5 ${
                      selectedMonth === index ? 'shadow-[4px_4px_0_0_#000]' : ''
                    } ${month.active ? '' : 'opacity-45'}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="text-lg font-bold">{month.label}</div>
                        <div className="text-xs text-gray-500">
                          {savingMonth === index
                            ? 'SAVING'
                            : month.active
                              ? 'ACTIVE'
                              : 'OFF'}
                        </div>
                      </div>
                      <div className="text-2xl font-bold">{month.kMade}k</div>
                    </div>
                    <div className="h-14 border-2 border-gray-900 bg-gray-100 flex items-end">
                      <div
                        className="w-full bg-lime-300 border-t-2 border-gray-900"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-5 flex flex-col gap-4">
            <div className="border-4 border-gray-900 p-4 bg-yellow-50">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-xl font-bold">{selected.label} INPUT</h3>
                  <p className="text-xs text-gray-600">1k increments</p>
                </div>
                <button
                  onClick={() =>
                    updateMonth(selectedMonth, { active: !selected.active })
                  }
                  disabled={savingMonth === selectedMonth}
                  className={`px-3 py-2 border-2 border-gray-900 text-xs ${
                    selected.active
                      ? 'bg-green-300 hover:bg-green-400'
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                >
                  {selected.active ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="text-center border-4 border-gray-900 bg-white py-5 mb-4">
                <div className="text-5xl font-bold">{selected.kMade}k</div>
              </div>

              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={selected.kMade}
                disabled={savingMonth === selectedMonth}
                onChange={(event) =>
                  updateMonth(selectedMonth, {
                    kMade: clampK(Number(event.target.value)),
                  })
                }
                className="w-full accent-green-500"
              />

              <div className="grid grid-cols-3 gap-2 mt-4">
                <button
                  onClick={() =>
                    updateMonth(selectedMonth, {
                      kMade: clampK(selected.kMade - 1),
                    })
                  }
                  disabled={savingMonth === selectedMonth}
                  className="border-2 border-gray-900 py-2 hover:bg-gray-100"
                >
                  -1k
                </button>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={selected.kMade}
                  disabled={savingMonth === selectedMonth}
                  onChange={(event) =>
                    updateMonth(selectedMonth, {
                      kMade: clampK(Number(event.target.value)),
                    })
                  }
                  className="border-2 border-gray-900 text-center px-2"
                />
                <button
                  onClick={() =>
                    updateMonth(selectedMonth, {
                      kMade: clampK(selected.kMade + 1),
                    })
                  }
                  disabled={savingMonth === selectedMonth}
                  className="border-2 border-gray-900 py-2 hover:bg-gray-100"
                >
                  +1k
                </button>
              </div>
            </div>

            <div className="border-4 border-gray-900 p-4 bg-white">
              <h3 className="text-xl font-bold mb-3">QUESTS</h3>
              <div className="space-y-2 text-sm">
                <QuestRow
                  done={stats.level >= 1}
                  label="First Level"
                  detail="Reach 20k total active gains"
                />
                <QuestRow
                  done={stats.greenMonths >= 3}
                  label="Quarter Green"
                  detail="Log gains in 3 active months"
                />
                <QuestRow
                  done={stats.bestMonth.kMade >= 20}
                  label="Boss Month"
                  detail="Hit 20k inside one month"
                />
                <QuestRow
                  done={stats.streak >= 4}
                  label="Streak Mode"
                  detail="Keep the last active run green"
                />
              </div>
            </div>

            <button
              onClick={resetRun}
              disabled={loading}
              className="border-4 border-gray-900 py-3 hover:bg-red-500 hover:text-white"
            >
              RESET RUN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuestRow({
  done,
  label,
  detail,
}: {
  done: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div
      className={`border-2 border-gray-900 p-3 ${
        done ? 'bg-green-200' : 'bg-gray-50 text-gray-500'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">{label}</span>
        <span>{done ? 'DONE' : 'LOCKED'}</span>
      </div>
      <div className="text-xs mt-1">{detail}</div>
    </div>
  );
}
