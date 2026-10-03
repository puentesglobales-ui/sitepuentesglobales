/**
 * Envío de emails con Resend (https://resend.com), por HTTP y sin SDK.
 * Variables: RESEND_API_KEY y EMAIL_FROM ("Puentes Globales <hola@tudominio.com>").
 * Resend exige verificar el dominio del remitente: hasta tener dominio propio no se
 * puede enviar, y el panel ofrece copiar los emails para mandarlos a mano.
 */
export function emailDisponible() {
  return Boolean((process.env.RESEND_API_KEY || '').trim() && (process.env.EMAIL_FROM || '').trim());
}

export async function enviarEmail({ para, asunto, texto, html }) {
  if (!emailDisponible()) throw new Error('Falta configurar RESEND_API_KEY y EMAIL_FROM.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM.trim(), to: [para], subject: asunto, text: texto, html }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export function escaparHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
