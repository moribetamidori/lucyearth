import birthdayData from '@/data/bd/2026/memories.json';
import type { BirthdayDataset } from '@/lib/birthday/types';
import BirthdayExperience from './BirthdayExperience';

export default function ObservatoryPage() {
  return <BirthdayExperience dataset={birthdayData as BirthdayDataset} />;
}
