import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Cell Notebook · 细胞培养记录',
  description: '记录细胞计数、培养处理和实验前后变化。',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

