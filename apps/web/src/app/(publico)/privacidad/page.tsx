import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Política de privacidad · FIAVL' };

/**
 * Política de privacidad, versión 1 (US7-AS5, Constitución VI, LOPDP). Texto de referencia del
 * proyecto académico: la organización del festival debe revisarlo con su asesoría legal.
 */
export default function PrivacidadPage() {
  return (
    <article>
      <h1>Política de privacidad</h1>
      <p>
        <strong>Versión 1</strong> · vigente desde el 1 de enero de 2026
      </p>

      <h2>Qué datos recogemos</h2>
      <p>Tu nombre, tu correo electrónico y tu contraseña (guardada de forma irreversible, nunca en claro). Si compras o reservas, los datos de tus entradas. Si postulas, los datos de tu postulación.</p>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Identificarte y proteger tu cuenta.</li>
        <li>Enviarte tus entradas y los avisos de servicio: cambios o cancelaciones de funciones, devoluciones y el estado de tus postulaciones.</li>
        <li>Enviarte novedades del festival solo si lo aceptas; puedes retirar ese permiso cuando quieras.</li>
      </ul>

      <h2>Tus derechos (Ley Orgánica de Protección de Datos Personales)</h2>
      <p>Puedes consultar, corregir y descargar tus datos y pedir que se eliminen desde «Mi cuenta». Al eliminar la cuenta, tus datos personales se anonimizan; los registros contables se conservan sin datos que te identifiquen, por obligación legal.</p>

      <h2>Con quién los compartimos</h2>
      <p>Con nadie para fines comerciales. Solo con los proveedores que hacen posible el servicio (por ejemplo, el envío de correos y el cobro de entradas), con las mismas obligaciones de confidencialidad.</p>

      <h2>Cambios</h2>
      <p>Si esta política cambia, te pediremos aceptar la nueva versión al ingresar y guardaremos qué versión aceptaste y cuándo.</p>
    </article>
  );
}
