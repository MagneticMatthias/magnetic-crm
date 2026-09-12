import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vertriebssuite – CRM',
  description: 'CRM für Vertriebsteams nach dem Setter-Closer-Prinzip',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
