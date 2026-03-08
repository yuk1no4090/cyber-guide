import type { Metadata, Viewport } from 'next';
import { Nunito, Lexend } from 'next/font/google';
import ErrorBoundary from './components/ErrorBoundary';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-nunito',
});

const lexend = Lexend({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-lexend',
});

export const metadata: Metadata = {
  title: '小舟 · Cyber Guide',
  description: '一叶小船，水深水浅都趟过，陪你聊聊方向、选择和那些想说又不知道跟谁说的事。',
  keywords: ['CS学生', '方向选择', 'AI 陪伴', '大学规划', '职场顾问'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Cyber Guide',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f0f7ff',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className={`${nunito.variable} ${lexend.variable}`}>
      <body className="bg-gradient-mesh antialiased">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
