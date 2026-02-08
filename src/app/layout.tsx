import type { Metadata, Viewport } from 'next';
import './globals.css';

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
  maximumScale: 1,
  userScalable: false,
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
      <body className="bg-gradient-mesh antialiased">
        {children}
      </body>
    </html>
  );
}
