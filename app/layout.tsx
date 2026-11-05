import type { Metadata, Viewport } from 'next';
import { Archivo, Fraunces, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const display = Fraunces({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz', 'WONK'],
  variable: '--font-fraunces',
  display: 'swap',
});

// Loaded with its width axis so ledger column heads can run condensed without a second family.
const ui = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
});

const figures = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title:
    'ChartTruth — Zero-Secret Ephemeral Sandbox, k×3 Shadow-CSV Probe & Independent Accounting Oracle for AI Data Charts',
  description:
    'A forensic audit desk for AI-generated charts: every script runs in a zero-secret, network-less container, is replayed on a ×3 shadow CSV, and is re-added by an independent accounting oracle (P1 && P2 && P3) on Vultr Serverless Inference — nemotron-3.5-content-safety, glm-5.3-flash and clef.',
};

export const viewport: Viewport = {
  themeColor: '#f2ede2',
  colorScheme: 'light',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): ReactNode {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable} ${figures.variable}`}>
      <body>{children}</body>
    </html>
  );
}
