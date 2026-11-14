import type { Metadata } from 'next';
import { demoSnapshot } from '@/lib/laurie/demo';
import Laurie from './Laurie';

export const metadata: Metadata = { title: 'Laurie · Paper trading experiment', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default function LauriePage() { return <Laurie initial={demoSnapshot(null, process.env.LAURIE_SYMBOL?.toUpperCase() === 'QQQ' ? 'QQQ' : 'SPY')} />; }
