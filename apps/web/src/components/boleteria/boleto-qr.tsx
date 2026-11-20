'use client';

import { useEffect, useState } from 'react';
import { formatoCodigoCorto } from './formato-boleteria';

export function BoletoQr({
  tokenQr,
  codigoCorto,
  estado,
}: {
  tokenQr: string;
  codigoCorto: string;
  estado: 'valida' | 'usada' | 'anulada' | 'liberada';
}) {
  const [svgHtml, setSvgHtml] = useState<string>('');

  useEffect(() => {
    let activo = true;
    void import('qrcode').then((QRCode) =>
      QRCode.toString(tokenQr, { type: 'svg', margin: 1, width: 168 }, (err, svg) => {
        if (activo && !err && svg) setSvgHtml(svg);
      }),
    );
    return () => {
      activo = false;
    };
  }, [tokenQr]);

  const textoEstado: Record<typeof estado, string> = {
    valida: 'Válida',
    usada: 'Usada',
    anulada: 'Anulada',
    liberada: 'Liberada',
  };

  return (
    <div className="boleto-qr">
      {svgHtml ? (
        <div
          className="qr-svg"
          role="img"
          aria-label={`Código QR de entrada ${formatoCodigoCorto(codigoCorto)}`}
          dangerouslySetInnerHTML={{ __html: svgHtml }}
        />
      ) : (
        <div className="qr-cargando">Generando QR…</div>
      )}
      <p className="codigo-corto">
        <strong>Código:</strong> <code>{formatoCodigoCorto(codigoCorto)}</code>
      </p>
      <p className={`estado estado-${estado}`}>Estado: {textoEstado[estado]}</p>
    </div>
  );
}
