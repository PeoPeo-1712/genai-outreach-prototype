import type { Metadata } from 'next';
import './globals.css';
import { HeaderNav } from '@/components/HeaderNav';

export const metadata: Metadata = {
  title: 'GenAI Fund — AI & Robotics Talent Outreach',
  description: 'Evidence-grounded scout and outreach platform for GenAI Fund in Southeast Asia.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
        <HeaderNav />
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
