import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'JMILL // White Temple Prototype',
  description: 'A walkable memory temple rendered from wireframe into pearl.',
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#07101d',
};

export default function BirthdayTempleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
