import type { Metadata, Viewport } from 'next';
import ErrorBoundary from './components/ErrorBoundary';
import './globals.css';

export const metadata: Metadata = {
  title: '小舟 · Cyber Guide',
  description: '一叶小船，水深水浅都趟过，陪你聊聊方向、选择和那些想说又不知道跟谁说的事。',
  keywords: ['CS学生', '方向选择', 'AI 陪伴', '大学规划', '职场顾问'],
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
  viewportFit: 'cover',
  themeColor: '#f0f7ff',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&family=Nunito:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans bg-gradient-mesh antialiased h-screen overflow-hidden">
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}
