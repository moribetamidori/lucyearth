import { notFound } from 'next/navigation';
import TradeLab from '../TradeLab';

export const dynamic = 'force-dynamic';

export default async function TradePage({ params }: { params: Promise<{ view?: string[] }> }) {
  const { view = [] } = await params;
  const section = view[0] ?? 'dashboard';
  if (view.length > 1 || !['dashboard', 'decisions', 'trades', 'strategies', 'lab', 'logs'].includes(section)) notFound();
  return <TradeLab section={section} />;
}
