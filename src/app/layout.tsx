import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cyber Guide - 心理支持伙伴',
  description: '温暖、专业的 AI 心理支持伙伴，为你提供情感支持和倾听。',
  keywords: ['心理支持', '情感倾诉', 'AI 陪伴', '压力管理'],
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1e222a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-gradient-mesh antialiased">
        {children}
      </body>
    </html>
  );
}
