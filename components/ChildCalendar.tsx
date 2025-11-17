'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, type ChildCalendarEntry } from '@/lib/supabase';

type ChildCalendarProps = {
  isOpen: boolean;
  onClose: () => void;
  isEditMode: boolean;
  onLogActivity: (action: string, details?: string) => void;
};

type ChildStatus = 'none' | 'yes' | 'maybe' | 'no';

const statusOrder: ChildStatus[] = ['none', 'yes', 'maybe', 'no'];

const statusStyles: Record<
  ChildStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  none: {
    label: 'NO ENTRY',
    bg: 'bg-white',
    text: 'text-gray-900',
    border: 'border-gray-300',
  },
  yes: {
    label: 'YES',
    bg: 'bg-green-200',
    text: 'text-green-900',
    border: 'border-green-500',
  },
  maybe: {
    label: 'MAYBE',
    bg: 'bg-yellow-200',
    text: 'text-yellow-900',
    border: 'border-yellow-500',
  },
  no: {
    label: 'NO',
    bg: 'bg-red-200',
    text: 'text-red-900',
    border: 'border-red-500',
  },
};

const nextStatus = (current: ChildStatus): ChildStatus => {
  const currentIndex = statusOrder.indexOf(current);
  const nextIndex = (currentIndex + 1) % statusOrder.length;
  return statusOrder[nextIndex];
};

const formatDate = (date: Date, day: number) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const getDaysInMonth = (date: Date) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  return { daysInMonth, startingDayOfWeek };
};

export default function ChildCalendar({
  isOpen,
  onClose,
  isEditMode,
  onLogActivity,
}: ChildCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date(2025, 9, 1));
  const [entries, setEntries] = useState<ChildCalendarEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchEntries = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('child_calendar_entries')
      .select('*')
      .order('date', { ascending: true });

    if (error) {
      console.error('Failed to load child calendar entries', error);
    }

    if (data) setEntries(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchEntries();
    }
  }, [isOpen, fetchEntries]);

  const entryMap = useMemo(() => {
    const map = new Map<string, ChildCalendarEntry>();
    entries.forEach(entry => map.set(entry.date, entry));
    return map;
  }, [entries]);

  const handleDateClick = async (day: number) => {
    if (!isEditMode) return;

    const dateStr = formatDate(currentMonth, day);
    const existingEntry = entryMap.get(dateStr);
    const updatedStatus = nextStatus(existingEntry?.status || 'none');

    try {
      let error;
      if (existingEntry && updatedStatus === 'none') {
        ({ error } = await supabase
          .from('child_calendar_entries')
          .delete()
          .eq('id', existingEntry.id));
      } else if (existingEntry) {
        ({ error } = await supabase
          .from('child_calendar_entries')
          .update({
            status: updatedStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingEntry.id));
      } else {
        ({ error } = await supabase
          .from('child_calendar_entries')
          .insert({
            date: dateStr,
            status: updatedStatus,
            updated_at: new Date().toISOString(),
          }));
      }

      if (error) {
        console.error('Failed to update child calendar entry', error);
        alert(`Failed to update entry: ${error.message}`);
        return;
      }

      if (updatedStatus === 'none') {
        await onLogActivity('Updated Child Calendar', `Cleared entry for ${dateStr}`);
      } else {
        await onLogActivity('Updated Child Calendar', `Set ${dateStr} to ${statusStyles[updatedStatus].label}`);
      }

      await fetchEntries();
    } catch (err) {
      console.error('Unexpected error updating child calendar entry', err);
    }
  };

  if (!isOpen) return null;

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentMonth);
  const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-gray-900 max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl">CHILD.CAL</h2>
          <button
            onClick={onClose}
            className="text-2xl hover:text-red-500 cursor-pointer"
          >
            x
          </button>
        </div>

        {/* Month Controls */}
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
            className="px-4 py-2 border-2 border-gray-900 hover:bg-gray-100 text-xs cursor-pointer"
          >
            PREV
          </button>
          <div className="text-lg font-semibold">{monthName.toUpperCase()}</div>
          <button
            onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
            className="px-4 py-2 border-2 border-gray-900 hover:bg-gray-100 text-xs cursor-pointer"
          >
            NEXT
          </button>
        </div>

        {/* Legend */}
        <div className="mb-4">
          <div className="flex flex-wrap gap-3 text-[10px] font-semibold tracking-widest">
            {(['yes', 'maybe', 'no'] as ChildStatus[]).map(key => (
              <div key={key} className="flex items-center gap-2 uppercase">
                <div className={`w-4 h-4 border ${statusStyles[key].bg} ${statusStyles[key].border}`} />
                <span>{statusStyles[key].label}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 uppercase">
              <div className={`w-4 h-4 border ${statusStyles.none.bg} ${statusStyles.none.border}`} />
              <span>{statusStyles.none.label}</span>
            </div>
          </div>
          {!isEditMode && (
            <p className="text-[10px] text-gray-500 mt-2 uppercase">View only. Log in to toggle days.</p>
          )}
          {isEditMode && (
            <p className="text-[10px] text-gray-500 mt-2 uppercase">Tap a day to cycle through the states.</p>
          )}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2 mb-6">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
            <div key={day} className="text-center text-[10px] text-gray-500 py-2">
              {day}
            </div>
          ))}

          {[...Array(startingDayOfWeek)].map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}

          {[...Array(daysInMonth)].map((_, i) => {
            const day = i + 1;
            const dateStr = formatDate(currentMonth, day);
            const status = entryMap.get(dateStr)?.status || 'none';
            const styles = statusStyles[status];

            return (
              <div
                key={dateStr}
                onClick={() => handleDateClick(day)}
                className={`aspect-square border-2 border-gray-900 flex flex-col items-center justify-center transition-colors p-1 ${
                  styles.bg
                } ${styles.text} ${isEditMode ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}
                style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)' }}
              >
                <div className="text-xs font-semibold">{day}</div>
                {status !== 'none' && (
                  <div className="text-[10px] uppercase mt-1">{styles.label}</div>
                )}
              </div>
            );
          })}
        </div>

        {isLoading && (
          <div className="text-xs text-gray-500 uppercase">Refreshing...</div>
        )}
      </div>
    </div>
  );
}
