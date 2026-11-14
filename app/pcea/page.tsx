import type { Metadata } from 'next';
import PCEA from './PCEA';

export const metadata: Metadata = {
  title: 'PCEA · Probability Calibration for Event Attendance',
  description: 'Say how likely you are to go — and see how calibrated you really are.',
};

export default function PceaPage() { return <PCEA />; }
