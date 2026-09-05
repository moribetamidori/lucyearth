import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Quant Lab · Lucy Earth',
  description: 'An experimental Recursive Self-Improvement research lab. Paper trading only.',
  robots: { index: false, follow: false },
};

export default function TradeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
