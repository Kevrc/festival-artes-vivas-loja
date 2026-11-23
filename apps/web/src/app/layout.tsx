import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import './globales.css';

export const metadata: Metadata = {
  title: { default: 'Cartelera FIAVL', template: '%s · FIAVL' },
  description: 'Programación del Festival Internacional de Artes Vivas de Loja',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#14106b' },
    { media: '(prefers-color-scheme: dark)', color: '#07052b' },
  ],
};

// Tipografía geométrica del festival, servida desde el propio sitio (sin peticiones a Google en el navegador)
const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--fuente-display', display: 'swap' });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={outfit.variable}>
      <body>{children}</body>
    </html>
  );
}
