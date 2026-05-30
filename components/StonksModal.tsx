'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase, type StonksEntry } from '@/lib/supabase';

type StonksModalProps = {
  isOpen: boolean;
  onClose: () => void;
  anonId?: string;
  isEditMode: boolean;
  onLogActivity?: (action: string, details?: string) => void;
};

type MonthEntry = {
  key: string;
  label: string;
  kMade: number;
  active: boolean;
  recorded: boolean;
};

type RunStatus = 'active' | 'archived' | 'planned';

const LEVEL_SIZE_K = 20;
const K_STEP = 0.1;
const FIRST_RUN_YEAR = 2026;
const STONKS_TABLE = 'stonks_monthly_entries';
const SHARED_STONKS_ID = 'shared';
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

const LEVEL_TONES = [
  {
    name: 'Green',
    fill: '#4ade80',
    bgClass: 'bg-emerald-50',
    badgeClass: 'bg-emerald-100',
  },
  {
    name: 'Blue',
    fill: '#67e8f9',
    bgClass: 'bg-cyan-50',
    badgeClass: 'bg-cyan-100',
  },
  {
    name: 'Violet',
    fill: '#c4b5fd',
    bgClass: 'bg-violet-50',
    badgeClass: 'bg-violet-100',
  },
  {
    name: 'Gold',
    fill: '#fde047',
    bgClass: 'bg-yellow-50',
    badgeClass: 'bg-yellow-100',
  },
];

const makeDefaultMonths = () =>
  MONTHS.map((label, index) => ({
    key: `${index}`,
    label,
    kMade: 0,
    active: true,
    recorded: false,
  }));

const clampK = (value: number | string) => {
  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(999, Math.max(0, Math.round(numericValue * 10) / 10));
};

const roundToTenth = (value: number) => Math.round(value * 10) / 10;

const formatK = (value: number) => {
  const normalized = roundToTenth(value);
  return Number.isInteger(normalized) ? normalized.toFixed(0) : normalized.toFixed(1);
};

const formatGainDollars = (value: number) => {
  const dollars = Math.round(roundToTenth(value) * 1000);
  return `${dollars > 0 ? '+ ' : ''}${new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(dollars)}`;
};

const getCurrentYear = () => new Date().getFullYear();
const getCurrentMonthIndex = () => new Date().getMonth();

const getRunStatus = (year: number, currentYear: number): RunStatus => {
  if (year < currentYear) return 'archived';
  if (year > currentYear) return 'planned';
  return 'active';
};

const getLevelTone = (level: number) =>
  LEVEL_TONES[Math.min(Math.max(level, 0), LEVEL_TONES.length - 1)];

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
  isEditMode,
  onLogActivity,
}: StonksModalProps) {
  const currentYear = getCurrentYear();
  const currentMonthIndex = getCurrentMonthIndex();
  const [selectedYear, setSelectedYear] = useState(() => currentYear);
  const [months, setMonths] = useState<MonthEntry[]>(makeDefaultMonths);
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonthIndex);
  const [loading, setLoading] = useState(false);
  const [savingMonth, setSavingMonth] = useState<number | null>(null);
  const [error, setError] = useState('');

  const runStatus = getRunStatus(selectedYear, currentYear);
  const canEditRun = isEditMode && runStatus === 'active';
  const runArchived = runStatus === 'archived';
  const runPlanned = runStatus === 'planned';

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    const startYear = Math.max(FIRST_RUN_YEAR, Math.min(currentYear, selectedYear) - 5);
    const endYear = Math.max(currentYear, selectedYear) + 5;
    for (let year = startYear; year <= endYear; year += 1) {
      years.add(year);
    }
    years.add(FIRST_RUN_YEAR);
    years.add(currentYear);
    years.add(selectedYear);
    return Array.from(years).sort((a, b) => a - b);
  }, [currentYear, selectedYear]);

  const selectRunYear = (year: number) => {
    const nextYear = Math.max(FIRST_RUN_YEAR, year);
    setSelectedYear(nextYear);
    setSelectedMonth(nextYear === currentYear ? currentMonthIndex : 0);
    setError('');
  };

  useEffect(() => {
    const fetchProgress = async () => {
      if (!isOpen) return;
      setLoading(true);
      setError('');

      try {
        const { data, error: fetchError } = await supabase
          .from(STONKS_TABLE)
          .select('*')
          .eq('anon_id', SHARED_STONKS_ID)
          .eq('entry_year', selectedYear)
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
                  recorded: true,
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
      onLogActivity?.('Opened Stonks', `Viewed ${selectedYear} trading level progress`);
      void fetchProgress();
    }
  }, [isOpen, onLogActivity, selectedYear]);

  const monthMeta = useMemo(
    () =>
      months.map((month, index) => {
        const isFutureMonth =
          selectedYear > currentYear ||
          (selectedYear === currentYear && index > currentMonthIndex);
        const isEditable = canEditRun && !isFutureMonth;

        return {
          ...month,
          index,
          isFutureMonth,
          isEditable,
        };
      }),
    [canEditRun, currentMonthIndex, currentYear, months, selectedYear]
  );

  const stats = useMemo(() => {
    const recordedActiveMonths = monthMeta.filter(
      (month) => month.recorded && month.active && !month.isFutureMonth
    );
    const totalK = roundToTenth(
      recordedActiveMonths.reduce((sum, month) => sum + month.kMade, 0)
    );
    const level = Math.floor(totalK / LEVEL_SIZE_K);
    const nextLevelTarget = (level + 1) * LEVEL_SIZE_K;
    const currentLevelStart = level * LEVEL_SIZE_K;
    const progressK = totalK - currentLevelStart;
    const progressPercent = Math.min(100, (progressK / LEVEL_SIZE_K) * 100);
    const bestMonth = recordedActiveMonths.reduce(
      (best, month) => (month.kMade > best.kMade ? month : best),
      { ...months[0], index: 0, isFutureMonth: false, isEditable: false, kMade: 0 }
    );
    const greenMonths = recordedActiveMonths.filter(
      (month) => month.kMade > 0
    ).length;
    const streak = recordedActiveMonths.reduce((run, month) => {
      if (!month.active) return run;
      return month.kMade > 0 ? run + 1 : 0;
    }, 0);

    return {
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
        recordedActiveMonths.length > 0
          ? roundToTenth(totalK / recordedActiveMonths.length)
          : 0,
      recordedActiveMonths: recordedActiveMonths.length,
    };
  }, [monthMeta, months]);

  const saveMonth = async (index: number, nextMonth: MonthEntry) => {
    const month = monthMeta[index];
    if (!month?.isEditable) {
      setError('Future months are locked until they arrive.');
      return;
    }

    setSavingMonth(index);
    setError('');

    try {
      const { error: upsertError } = await supabase
        .from(STONKS_TABLE)
        .upsert(
          {
            anon_id: SHARED_STONKS_ID,
            entry_year: selectedYear,
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
    const currentMonth = months[index];
    const month = monthMeta[index];
    if (!currentMonth || !month?.isEditable) {
      setError('Future months are locked until they arrive.');
      return;
    }

    const changedMonth = { ...currentMonth, ...changes, recorded: true };

    setMonths((current) =>
      current.map((item, monthIndex) => {
        if (monthIndex !== index) return item;
        return changedMonth;
      })
    );

    void saveMonth(index, changedMonth);
  };

  const resetRun = async () => {
    if (!canEditRun) return;
    if (!confirm(`Reset ${selectedYear} stonks progress?`)) return;

    const resetMonths = makeDefaultMonths();
    setMonths(resetMonths);
    setError('');

    setLoading(true);

    try {
      const { error: deleteError } = await supabase
        .from(STONKS_TABLE)
        .delete()
        .eq('anon_id', SHARED_STONKS_ID)
        .eq('entry_year', selectedYear);

      if (deleteError) throw deleteError;
      onLogActivity?.('Reset Stonks', `Cleared ${selectedYear} trading progress`);
    } catch (resetError) {
      console.warn('Failed to reset stonks progress', resetError);
      setError(
        `Could not reset stonks progress in ${STONKS_TABLE}: ${getErrorMessage(resetError)}`
      );
    } finally {
      setLoading(false);
    }
  };

  const selected = monthMeta[selectedMonth] || monthMeta[0];
  const levelTone = getLevelTone(stats.level);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="bg-white border-4 border-gray-900 w-full max-w-6xl max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '8px 8px 0 0 #000' }}
      >
        <div className="sticky top-0 bg-white border-b-4 border-gray-900 z-10 p-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold">STONKS</h2>
            {(runArchived || runPlanned) && (
              <p className="text-sm text-gray-600">
                {runArchived && (
                  <span className="block text-xs text-gray-500">
                    Archived after Dec 31, {selectedYear}.
                  </span>
                )}
                {runPlanned && (
                  <span className="block text-xs text-gray-500">
                    Opens Jan 1, {selectedYear}. Future runs are read-only until then.
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="flex items-start gap-3">
            <button
              onClick={onClose}
              className="w-10 h-10 border-2 border-gray-900 hover:bg-red-500 hover:text-white text-2xl leading-none shrink-0"
            >
              x
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-0">
          <div className="p-5 border-b-4 lg:border-b-0 lg:border-r-4 border-gray-900">
            {(loading || error) && (
              <div
                className={`border-2 border-gray-900 px-3 py-2 mb-4 text-sm ${
                  error ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-gray-700'
                }`}
              >
                {error || `Loading ${selectedYear} stonks progress...`}
              </div>
            )}

            <div className="border-4 border-gray-900 bg-white p-4 mb-5">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
                <div>
                  <h3 className="text-lg font-bold">PROGRESS DIAGRAM</h3>
                  <p className="text-xs text-gray-500">
                    Monthly gains for the {selectedYear} run
                  </p>
                </div>
                <div className="text-xs text-gray-500">
                  Future months stay locked out of stats
                </div>
              </div>
              <StonksProgressDiagram months={monthMeta} year={selectedYear} />
            </div>

            <div className="mb-3 flex justify-start gap-2">
              <button
                type="button"
                onClick={() => selectRunYear(selectedYear - 1)}
                className="w-10 border-2 border-gray-900 bg-white text-lg font-bold hover:bg-gray-100"
                aria-label="Previous stonks run year"
              >
                {'<'}
              </button>
              <select
                value={selectedYear}
                onChange={(event) => selectRunYear(Number(event.target.value))}
                className="border-2 border-gray-900 bg-white px-3 py-2 text-sm font-bold"
                aria-label="Select stonks run year"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year} {getRunStatus(year, currentYear) === 'active' ? 'active' : getRunStatus(year, currentYear)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => selectRunYear(selectedYear + 1)}
                className="w-10 border-2 border-gray-900 bg-white text-lg font-bold hover:bg-gray-100"
                aria-label="Next stonks run year"
              >
                {'>'}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {monthMeta.map((month) => {
                return (
                  <div
                    key={month.key}
                    className={`border-4 bg-white p-3 min-h-[124px] transition-transform ${
                      selectedMonth === month.index ? 'shadow-[4px_4px_0_0_#000]' : ''
                    } ${
                      month.isFutureMonth
                        ? 'border-gray-400 text-gray-400 bg-gray-50'
                        : 'border-gray-900 hover:-translate-y-0.5'
                    } ${month.active ? '' : 'opacity-45'}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMonth(month.index);
                        if (month.isFutureMonth) {
                          setError(`${month.label} ${selectedYear} is locked until that month begins.`);
                        } else {
                          setError('');
                        }
                      }}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-lg font-bold">{month.label}</div>
                        {month.isFutureMonth && (
                          <div className="text-lg leading-none" aria-label="Locked future month">
                            🔒
                          </div>
                        )}
                      </div>
                      <div className="mt-4 text-center text-2xl font-bold text-green-600">
                        {formatGainDollars(month.kMade)}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-5 flex flex-col gap-4">
            <div className={`border-4 border-gray-900 ${levelTone.bgClass} p-4`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="text-xs text-gray-600">CURRENT LEVEL</div>
                  <div className="text-4xl font-bold leading-none">LVL {stats.level}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-600">TOTAL</div>
                  <div className="text-4xl font-bold leading-none">{formatK(stats.totalK)}k</div>
                </div>
              </div>

              <div className="h-7 border-4 border-gray-900 bg-white overflow-hidden">
                <div
                  className="h-full border-r-4 border-gray-900 transition-all"
                  style={{ width: `${stats.progressPercent}%`, backgroundColor: levelTone.fill }}
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-700">
                <span>{formatK(stats.progressK)}k / 20k</span>
                <span className="text-right">{formatK(stats.remainingK)}k to LVL {stats.level + 1}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="border-4 border-gray-900 p-3 bg-yellow-100 min-w-0">
                <div className="text-[10px] font-bold text-gray-700">AVG MONTH</div>
                <div className="text-3xl font-bold leading-none mt-1">
                  {formatK(stats.averageK)}k
                </div>
              </div>
              <div className="border-4 border-gray-900 p-3 bg-pink-100 min-w-0">
                <div className="flex items-center justify-between gap-2 text-[10px] text-gray-500">
                  <span>👑 BEST MONTH</span>
                  <span className="font-bold text-gray-900">
                    {stats.recordedActiveMonths > 0
                      ? `${formatK(stats.bestMonth.kMade)}k`
                      : '--'}
                  </span>
                </div>
                <div className="text-2xl font-bold leading-tight truncate">
                  {stats.recordedActiveMonths > 0
                    ? `${stats.bestMonth.label}, ${selectedYear}`
                    : 'None'}
                </div>
              </div>
            </div>

            <div className="border-4 border-gray-900 p-4 bg-yellow-50">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-xl font-bold">{selected.label}</h3>
                  <p className="text-xs text-gray-600">
                    {selected.isFutureMonth
                      ? 'Locked future month'
                      : !selected.recorded
                        ? 'Not recorded'
                        : selected.active
                          ? 'Recorded month'
                          : 'Skipped month'}
                  </p>
                </div>
                {canEditRun && (
                  <button
                    onClick={() =>
                      updateMonth(selectedMonth, { active: !selected.active })
                    }
                    disabled={savingMonth === selectedMonth || !selected.isEditable}
                    className={`px-3 py-2 border-2 border-gray-900 text-xs disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 ${
                      selected.active
                        ? 'bg-gray-100 hover:bg-gray-200'
                        : 'bg-green-200 hover:bg-green-300'
                    }`}
                  >
                    {selected.isFutureMonth ? 'LOCKED' : selected.active ? 'SKIP' : 'UNSKIP'}
                  </button>
                )}
              </div>

              <div className="text-center border-4 border-gray-900 bg-white py-5 mb-4">
                <div className="text-4xl font-bold text-gray-950">
                  {formatGainDollars(selected.kMade)}
                </div>
              </div>

              {canEditRun ? (
                <>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step={K_STEP}
                    value={selected.kMade}
                    disabled={savingMonth === selectedMonth || !selected.isEditable}
                    onChange={(event) =>
                      updateMonth(selectedMonth, {
                        kMade: clampK(Number(event.target.value)),
                      })
                    }
                    className="w-full accent-gray-950 disabled:opacity-40"
                  />

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <button
                      onClick={() =>
                        updateMonth(selectedMonth, {
                          kMade: clampK(selected.kMade - K_STEP),
                        })
                      }
                      disabled={savingMonth === selectedMonth || !selected.isEditable}
                      className="border-2 border-gray-900 py-2 hover:bg-gray-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      -0.1k
                    </button>
                    <input
                      type="number"
                      min="0"
                      step={K_STEP}
                      value={selected.kMade}
                      disabled={savingMonth === selectedMonth || !selected.isEditable}
                      onChange={(event) =>
                        updateMonth(selectedMonth, {
                          kMade: clampK(Number(event.target.value)),
                        })
                      }
                      className="border-2 border-gray-900 text-center px-2 disabled:bg-gray-100 disabled:text-gray-400"
                    />
                    <button
                      onClick={() =>
                        updateMonth(selectedMonth, {
                          kMade: clampK(selected.kMade + K_STEP),
                        })
                      }
                      disabled={savingMonth === selectedMonth || !selected.isEditable}
                      className="border-2 border-gray-900 py-2 hover:bg-gray-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                    >
                      +0.1k
                    </button>
                  </div>
                </>
              ) : (
                <div className="border-2 border-gray-900 bg-gray-50 p-3 text-xs text-gray-500">
                  {runArchived
                    ? `${selectedYear} is archived.`
                    : runPlanned
                      ? `${selectedYear} opens on Jan 1, ${selectedYear}.`
                      : 'Turn on edit mode to record this month.'}
                </div>
              )}
            </div>

            <div className="border-4 border-gray-900 p-4 bg-white">
              <h3 className="text-xl font-bold mb-3">QUESTS</h3>
              <div className="space-y-2 text-sm">
                <QuestRow
                  done={stats.totalK >= 20}
                  archived={runArchived}
                  planned={runPlanned}
                  emoji="💸"
                  label={`${selectedYear} IRA On Gains`}
                  detail={`Reach 20k total active ${selectedYear} gains to officially run the IRA account on gains`}
                />
                <QuestRow
                  done={stats.totalK >= 40}
                  archived={runArchived}
                  planned={runPlanned}
                  emoji="🏦"
                  label="Entire Account On Gains"
                  detail={`Reach 40k total active ${selectedYear} gains to officially run the entire account on gains`}
                />
                <QuestRow
                  done={stats.greenMonths >= 3}
                  archived={runArchived}
                  planned={runPlanned}
                  emoji="🟢"
                  label="Quarter Green"
                  detail="Log gains in 3 eligible active months"
                />
                <QuestRow
                  done={stats.bestMonth.kMade >= 20}
                  archived={runArchived}
                  planned={runPlanned}
                  emoji="👑"
                  label="Boss Month"
                  detail="Hit 20k inside one month"
                />
                <QuestRow
                  done={stats.streak >= 4}
                  archived={runArchived}
                  planned={runPlanned}
                  emoji="🔥"
                  label="Streak Mode"
                  detail="Keep the recorded active run green for 4 months"
                />
              </div>
            </div>

            {canEditRun && (
              <button
                onClick={resetRun}
                disabled={loading}
                className="border-4 border-gray-900 py-3 hover:bg-red-500 hover:text-white"
              >
                RESET RUN
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StonksProgressDiagram({
  months,
  year,
}: {
  months: Array<MonthEntry & { index: number; isFutureMonth: boolean; isEditable: boolean }>;
  year: number;
}) {
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const plottedMonths = months.filter((month) => month.recorded && month.active && !month.isFutureMonth);
  const maxMonthK = Math.max(...plottedMonths.map((month) => month.kMade), LEVEL_SIZE_K);
  const chartMax = Math.max(LEVEL_SIZE_K, Math.ceil(maxMonthK / 10) * 10);
  const width = 640;
  const height = 250;
  const paddingX = 44;
  const paddingTop = 28;
  const paddingBottom = 54;
  const axisY = height - paddingBottom;
  const plotWidth = width - paddingX * 2;
  const plotHeight = axisY - paddingTop;
  const xForIndex = (index: number) =>
    months.length === 1 ? width / 2 : paddingX + (index / (months.length - 1)) * plotWidth;
  const yForK = (value: number) =>
    paddingTop + plotHeight - (Math.min(value, chartMax) / chartMax) * plotHeight;
  const points = plottedMonths.map((month) => ({
    month,
    x: xForIndex(month.index),
    y: yForK(month.kMade),
  }));

  if (plottedMonths.length === 0) {
    return (
      <div className="h-56 border-2 border-gray-900 bg-gray-50 flex items-center justify-center text-sm text-gray-500">
        Record an eligible month to draw progress.
      </div>
    );
  }

  return (
    <div className="border-2 border-gray-900 bg-gray-50 overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-64 block" role="img">
        <title>{year} stonks monthly progress over time</title>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = paddingTop + plotHeight - ratio * plotHeight;
          return (
            <g key={ratio}>
              <line x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="#d1d5db" strokeWidth="1" />
              <text x={8} y={y + 4} fontSize="10" fill="#6b7280">
                {formatK(chartMax * ratio)}k
              </text>
            </g>
          );
        })}

        <line x1={paddingX} x2={width - paddingX} y1={axisY} y2={axisY} stroke="#111827" strokeWidth="2" />
        {months.map((month) => {
          const x = xForIndex(month.index);
          return (
            <g key={month.key}>
              <line
                x1={x}
                x2={x}
                y1={axisY}
                y2={axisY + 7}
                stroke={month.isFutureMonth ? '#9ca3af' : '#111827'}
                strokeWidth="2"
              />
              <text
                x={x}
                y={axisY + 22}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill={month.isFutureMonth ? '#9ca3af' : '#111827'}
              >
                {month.label}
              </text>
            </g>
          );
        })}

        {points.length > 1 && (
          <polyline
            fill="none"
            stroke="#4ade80"
            strokeWidth="5"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          />
        )}

        {points.map((point, pointIndex) => {
          const isHovered = hoveredMonth === point.month.index;
          const cumulativeTotal = plottedMonths
            .slice(0, pointIndex + 1)
            .reduce((sum, month) => sum + month.kMade, 0);
          const tooltipLabel = `${point.month.label}: ${formatK(point.month.kMade)}k, total ${formatK(cumulativeTotal)}k`;
          const tooltipWidth = Math.max(116, Math.min(200, tooltipLabel.length * 6.4 + 18));
          const tooltipX = Math.min(Math.max(point.x - tooltipWidth / 2, 6), width - tooltipWidth - 6);
          const tooltipY = Math.max(point.y - 48, 6);

          return (
            <g
              key={point.month.key}
              onMouseEnter={() => setHoveredMonth(point.month.index)}
              onMouseLeave={() => setHoveredMonth(null)}
              onFocus={() => setHoveredMonth(point.month.index)}
              onBlur={() => setHoveredMonth(null)}
              tabIndex={0}
              role="img"
              aria-label={tooltipLabel}
              className="outline-none"
            >
              <circle
                cx={point.x}
                cy={point.y}
                r={isHovered ? '10' : '8'}
                fill="#bef264"
                stroke="#111827"
                strokeWidth="3"
              />
              <title>{tooltipLabel}</title>
              <text x={point.x} y={point.y - 14} textAnchor="middle" fontSize="12" fontWeight="700" fill="#111827">
                {formatK(point.month.kMade)}
              </text>
              {isHovered && (
                <g pointerEvents="none">
                  <rect
                    x={tooltipX}
                    y={tooltipY}
                    width={tooltipWidth}
                    height="28"
                    rx="0"
                    fill="#ffffff"
                    stroke="#111827"
                    strokeWidth="2"
                  />
                  <text
                    x={tooltipX + tooltipWidth / 2}
                    y={tooltipY + 18}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill="#111827"
                  >
                    {tooltipLabel}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-3 border-t-2 border-gray-900 bg-white px-3 py-2 text-[11px] text-gray-600">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-5 h-1 bg-green-400 border border-gray-900" />
          Monthly gains
        </span>
      </div>
    </div>
  );
}

function QuestRow({
  done,
  archived = false,
  planned = false,
  emoji,
  label,
  detail,
}: {
  done: boolean;
  archived?: boolean;
  planned?: boolean;
  emoji: string;
  label: string;
  detail: string;
}) {
  const status = done ? 'DONE' : archived ? 'ARCHIVED' : planned ? 'PLANNED' : 'LOCKED';

  return (
    <div
      className={`border-2 p-3 ${
        done
          ? 'border-gray-900 bg-green-200'
          : archived || planned
            ? 'border-gray-400 bg-gray-100 text-gray-400'
            : 'border-gray-900 bg-gray-50 text-gray-500'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">{emoji} {label}</span>
        <span>{status}</span>
      </div>
      <div className="text-xs mt-1">{detail}</div>
    </div>
  );
}
