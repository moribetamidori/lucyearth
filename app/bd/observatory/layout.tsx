import type { Metadata, Viewport } from 'next';

const deploymentHost =
  [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ].find((value) => value?.trim()) ?? 'http://localhost:3000';
const deploymentUrl = deploymentHost.startsWith('http')
  ? deploymentHost
  : `https://${deploymentHost}`;

export const metadata: Metadata = {
  metadataBase: new URL(deploymentUrl),
  title: 'JMILL // Memory Palace 2026',
  description: 'A navigable archive of signals, projects, and strange futures.',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: 'JMILL // Memory Palace 2026',
    description: 'A navigable archive of signals, projects, and strange futures.',
    type: 'website',
    url: '/bd/observatory',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JMILL // Memory Palace 2026',
    description: 'A navigable archive of signals, projects, and strange futures.',
  },
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#05070a',
};

export default function ObservatoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
