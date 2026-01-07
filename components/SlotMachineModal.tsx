'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type SlotMachineSpin } from '@/lib/supabase';

type SlotMachineModalProps = {
  isOpen: boolean;
  onClose: () => void;
  anonId?: string;
  onLogActivity?: (action: string, details?: string) => void;
};

const slotSymbols = [
  { icon: '🍒', label: 'Cherries' },
  { icon: '🍋', label: 'Lemon' },
  { icon: '💎', label: 'Gem' },
  { icon: '🌈', label: 'Rainbow' },
  { icon: '⭐️', label: 'Star' },
  { icon: '🍀', label: 'Clover' },
  { icon: '🔥', label: 'Fire' },
  { icon: '🌙', label: 'Moon' },
];

const SPIN_MIN_DURATION = 1200;

const randomSlotSymbol = () =>
  slotSymbols[Math.floor(Math.random() * slotSymbols.length)].icon;

export default function SlotMachineModal({
  isOpen,
  onClose,
  anonId,
  onLogActivity,
}: SlotMachineModalProps) {
  const [reels, setReels] = useState<string[]>([
    slotSymbols[0].icon,
    slotSymbols[1].icon,
    slotSymbols[2].icon,
  ]);
  const [fortune, setFortune] = useState<string>('');
  const [isSpinning, setIsSpinning] = useState(false);
  const [error, setError] = useState<string>('');
  const [history, setHistory] = useState<SlotMachineSpin[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [question, setQuestion] = useState('');
  const spinIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const { data, error } = await supabase
        .from('slot_machine_spins')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) throw error;
      const rows = data ?? [];
      setHistory(rows);
      setHistoryIndex(0);
    } catch (err) {
      console.error('Failed to load slot machine history', err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setFortune('');
      void loadHistory();
    }
  }, [isOpen, loadHistory]);

  const startSpinAnimation = useCallback(() => {
    if (spinIntervalRef.current) {
      clearInterval(spinIntervalRef.current);
    }
    spinIntervalRef.current = setInterval(() => {
      setReels([randomSlotSymbol(), randomSlotSymbol(), randomSlotSymbol()]);
    }, 120);
  }, []);

  const stopSpinAnimation = useCallback((finalReels?: string[]) => {
    if (spinIntervalRef.current) {
      clearInterval(spinIntervalRef.current);
      spinIntervalRef.current = null;
    }
    if (finalReels) {
      setReels(finalReels);
    }
  }, []);

  const simulateSpin = () => [
    randomSlotSymbol(),
    randomSlotSymbol(),
    randomSlotSymbol(),
  ];

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  useEffect(() => {
    return () => stopSpinAnimation();
  }, [stopSpinAnimation]);

  const handleSpin = async () => {
    if (isSpinning) return;

    const finalReels = simulateSpin();
    setIsSpinning(true);
    setError('');
    setFortune('');
    onLogActivity?.('Spun Slot Machine', finalReels.join(' | '));

    startSpinAnimation();
    const spinStart = Date.now();

    try {
      const response = await fetch('/api/slot-machine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reels: finalReels, anonId, question: question.trim() || undefined }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to get fortune.');
      }

      setFortune(payload.fortune);
      if (payload.spin) {
        setHistory((prev) => {
          const next = [payload.spin as SlotMachineSpin, ...prev];
          return next.slice(0, 8);
        });
        setHistoryIndex(0);
      }
    } catch (err) {
      console.error('Slot machine spin failed', err);
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again!');
    } finally {
      const elapsed = Date.now() - spinStart;
      if (elapsed < SPIN_MIN_DURATION) {
        await new Promise((resolve) =>
          setTimeout(resolve, SPIN_MIN_DURATION - elapsed)
        );
      }
      stopSpinAnimation(finalReels);
      setIsSpinning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className="bg-white border-4 border-gray-900 w-full max-w-4xl max-h-[90vh] flex flex-col lg:flex-row"
        style={{ boxShadow: '8px 8px 0 0 #000' }}
      >
        <div className="lg:w-1/2 border-b-4 lg:border-b-0 lg:border-r-4 border-gray-900 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold">PIXEL SLOT</h2>
              <p className="text-sm text-gray-600">
                Win a fortune for your soul
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 border-2 border-gray-900 hover:bg-red-500 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div
              className="w-full border-4 border-gray-900 bg-gradient-to-br from-gray-100 to-gray-200 p-4 flex justify-between gap-4"
              style={{ boxShadow: '0 8px 0 0 #000' }}
            >
              {reels.map((symbol, idx) => (
                <div
                  key={`${symbol}-${idx}`}
                  className="flex-1 aspect-square bg-white border-4 border-gray-900 grid place-items-center text-5xl"
                  style={{ imageRendering: 'pixelated' }}
                >
                  {symbol}
                </div>
              ))}
            </div>

            <div className="w-full">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question... (optional)"
                disabled={isSpinning}
                className="w-full px-4 py-3 border-4 border-gray-900 text-sm mb-2 disabled:bg-gray-100"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSpinning) {
                    handleSpin();
                  }
                }}
              />
            </div>

            <button
              onClick={handleSpin}
              disabled={isSpinning}
              className={`w-full py-4 text-xl font-semibold border-4 border-gray-900 shadow-[0_6px_0_0_#000] ${isSpinning
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-yellow-300 hover:bg-yellow-400'
                } transition-colors`}
            >
              {isSpinning ? 'Spinning...' : question.trim() ? 'Spin & Get Answer' : 'Spin & Ask Lucy Earth'}
            </button>

            {error && (
              <div className="w-full border-2 border-red-500 text-red-700 text-sm px-3 py-2 text-center">
                {error}
              </div>
            )}

            {fortune && (
              <div className="w-full border-4 border-gray-900 bg-white p-4 space-y-3">
                <div className="text-xs text-gray-500 tracking-wide">
                  LUCY EARTH SAYS:
                </div>
                <p className="text-lg leading-relaxed">{fortune}</p>
                <div className="text-xs text-gray-500">
                  Combo:{' '}
                  <span className="font-mono">
                    {reels.join(' | ')}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:w-1/2 p-6 flex flex-col gap-4 overflow-y-auto">
          <div>
            <h3 className="text-xl font-semibold mb-2">Symbol Guide</h3>
            <div className="grid grid-cols-2 gap-3">
              {slotSymbols.map((item) => (
                <div
                  key={item.icon}
                  className="border-2 border-gray-900 px-3 py-2 flex items-center gap-3 bg-gray-50"
                >
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-sm">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-semibold">Recent Fortunes</h3>
              {history.length > 0 && (
                <div className="text-xs text-gray-500">
                  {historyIndex + 1} / {history.length}
                </div>
              )}
            </div>
            {history.length === 0 ? (
              <div className="border-2 border-dashed border-gray-400 p-4 text-sm text-gray-500 text-center">
                {loadingHistory
                  ? 'Loading fortunes...'
                  : 'No fortune history yet. Spin the reels!'}
              </div>
            ) : (
              <div className="border-2 border-gray-900 p-3 bg-white flex flex-col gap-3">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{formatTime(history[historyIndex].created_at)}</span>
                  <span className="font-mono">
                    {history[historyIndex].reel_one} | {history[historyIndex].reel_two} |{' '}
                    {history[historyIndex].reel_three}
                  </span>
                </div>
                <div className="text-sm leading-snug">{history[historyIndex].fortune_text}</div>
                <div className="flex gap-2 pt-2">
                  <button
                    className="flex-1 border-2 border-gray-900 py-1 text-sm disabled:opacity-30"
                    onClick={() => setHistoryIndex((prev) => Math.max(0, prev - 1))}
                    disabled={historyIndex === 0}
                  >
                    ← Prev
                  </button>
                  <button
                    className="flex-1 border-2 border-gray-900 py-1 text-sm disabled:opacity-30"
                    onClick={() =>
                      setHistoryIndex((prev) =>
                        Math.min(history.length - 1, prev + 1)
                      )
                    }
                    disabled={historyIndex >= history.length - 1}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
