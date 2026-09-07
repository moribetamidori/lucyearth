import type { Metadata } from 'next';
import Plantbook2 from './Plantbook2';

export const metadata: Metadata = {
  title: 'Plantbook II — Lucy Earth',
  description: 'A tiered botanical crafting book for plants, elements, and characters.',
};

export default function Plantbook2Page() {
  return <Plantbook2 />;
}
