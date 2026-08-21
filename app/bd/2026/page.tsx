import birthdayData from '@/data/bd/2026/temple-archive.json';
import templeLayout from '@/data/bd/2026/temple-layout.json';
import type { TempleDataset } from '@/lib/birthday/temple-types';
import TempleExperience from './TempleExperience';

export default function BirthdayTemplePage() {
  const dataset = {
    ...birthdayData,
    temple: templeLayout,
  } as TempleDataset;

  return <TempleExperience dataset={dataset} />;
}
