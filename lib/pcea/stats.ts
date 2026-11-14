import type { Calibration, Interest } from './types';

type Prediction = { probability: number; interest: Interest; attended: boolean | null };

export function eventStats(responses: Prediction[]) {
  const interest = { high: 0, some: 0, none: 0 } as Record<Interest, number>;
  let expected = 0, likely = 0, sure = 0, resolved = 0, attended = 0;
  for (const r of responses) {
    expected += r.probability / 100;
    if (r.probability >= 50) likely += 1;
    if (r.probability === 100) sure += 1;
    interest[r.interest] += 1;
    if (r.attended !== null) { resolved += 1; if (r.attended) attended += 1; }
  }
  return { count: responses.length, expected, likely, sure, interest, resolved, attended };
}

const BUCKETS = [
  { label: '0–19%', min: 0, max: 19 },
  { label: '20–49%', min: 20, max: 49 },
  { label: '50–79%', min: 50, max: 79 },
  { label: '80–100%', min: 80, max: 100 },
];

/** Brier score and a coarse calibration table over predictions whose outcome is known. */
export function calibration(predictions: { probability: number; attended: boolean | null }[]): Calibration {
  const done = predictions.filter((p): p is { probability: number; attended: boolean } => p.attended !== null);
  if (done.length === 0) return { resolved: 0, brier: null, meanPrediction: null, attendedRate: null, buckets: [] };
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const outcome = (p: { attended: boolean }) => (p.attended ? 1 : 0);
  return {
    resolved: done.length,
    brier: mean(done.map(p => (p.probability / 100 - outcome(p)) ** 2)),
    meanPrediction: mean(done.map(p => p.probability / 100)),
    attendedRate: mean(done.map(outcome)),
    buckets: BUCKETS.flatMap(b => {
      const inBucket = done.filter(p => p.probability >= b.min && p.probability <= b.max);
      return inBucket.length === 0 ? [] : [{
        label: b.label,
        n: inBucket.length,
        predicted: mean(inBucket.map(p => p.probability / 100)),
        actual: mean(inBucket.map(outcome)),
      }];
    }),
  };
}
