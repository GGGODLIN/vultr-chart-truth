import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'ChartTruth — AI Chart Accounting & Containment Studio',
  description:
    'Vultr Serverless Inference (nemotron-3.5-content-safety, glm-5.3-flash, clef) + Zero-Secret Ephemeral Sandbox + Independent Accounting Oracle (P1 && P2 && P3).',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
