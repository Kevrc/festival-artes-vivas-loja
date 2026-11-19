import type { Metadata, Viewport } from 'next';
import './globales.css';

export const metadata: Metadata = {
  title: { default: 'Cartelera FIAVL', template: '%s · FIAVL' },
  description: 'Programación del Festival Internacional de Artes Vivas de Loja',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
