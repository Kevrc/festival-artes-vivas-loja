import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globales.css';

export const metadata: Metadata = {
  title: { default: 'Cartelera FIAVL', template: '%s · FIAVL' },
  description: 'Programación del Festival Internacional de Artes Vivas de Loja',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0e0c0b',
};

// Serif de programa de mano para titulares + sans legible para datos; servidas desde el propio sitio
const fraunces = Fraunces({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--fuente-serif', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--fuente-sans', display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${fraunces.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
