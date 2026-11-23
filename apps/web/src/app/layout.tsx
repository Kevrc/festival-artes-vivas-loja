import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Inter } from 'next/font/google';
import './globales.css';

export const metadata: Metadata = {
  title: { default: 'Cartelera FIAVL', template: '%s · FIAVL' },
  description: 'Programación del Festival Internacional de Artes Vivas de Loja',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

// Grotesca condensada para titulares (como las webs de festivales grandes) + Inter para datos; servidas desde el propio sitio
const barlow = Barlow_Condensed({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--fuente-titular', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--fuente-sans', display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${barlow.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
