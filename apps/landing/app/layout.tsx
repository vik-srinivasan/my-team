import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: 'my-team — Multi-agent orchestration for Claude Code',
  description:
    'Spin up a team of AI specialists that plan, code, test, review, and ship a PR — all from one command.',
  metadataBase: new URL('https://my-team.dev'),
  openGraph: {
    title: 'my-team — Multi-agent orchestration for Claude Code',
    description:
      'Spin up a team of AI specialists that plan, code, test, review, and ship a PR — all from one command.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'my-team — Multi-agent orchestration for Claude Code',
    description:
      'Spin up a team of AI specialists that plan, code, test, review, and ship a PR — all from one command.',
  },
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
