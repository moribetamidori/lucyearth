import type { Metadata } from 'next';
import Plantbook from './Plantbook';

export const metadata: Metadata = {
  title: 'Plantbook — Lucy Earth',
  description: 'A field notebook for botanical combinations and their results.',
};

export default function PlantbookPage() {
  return <Plantbook />;
}
