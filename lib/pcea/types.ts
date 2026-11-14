export type Interest = 'high' | 'some' | 'none';

export const PROBABILITY_PRESETS = [0, 20, 50, 68, 80, 100] as const;

// Labels live in i18n.ts.
export const INTEREST_OPTIONS: { value: Interest; emoji: string }[] = [
  { value: 'high', emoji: '🔥' },
  { value: 'some', emoji: '🙂' },
  { value: 'none', emoji: '😐' },
];

export type PceaResponse = {
  userId: string;
  userName: string;
  probability: number;
  interest: Interest;
  note: string | null;
  attended: boolean | null;
  updatedAt: string;
};

export type PceaEvent = {
  id: string;
  eventDate: string; // YYYY-MM-DD in `timezone`
  startTime: string | null; // HH:MM in `timezone`
  timezone: string; // the creator's IANA timezone
  title: string;
  imageUrl: string | null;
  costAmount: number | null;
  costCurrency: string;
  note: string | null;
  location: string | null;
  createdBy: string;
  creatorName: string;
  locked: boolean;
  responses: PceaResponse[];
};

export type Calibration = {
  resolved: number;
  brier: number | null;
  meanPrediction: number | null;
  attendedRate: number | null;
  buckets: { label: string; n: number; predicted: number; actual: number }[];
};

export type PceaMe = {
  id: string;
  name: string;
  displayName: string | null;
  userNumber: number;
  timezone: string;
  recoveryCode: string;
  calibration: Calibration;
};
