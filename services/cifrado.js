/**
 * Cifrado de las claves de los medios de pago de cada empresa (Mercado Pago, Stripe, PayPal).
 * AES-256-GCM con la variable PAYMENTS_ENC_KEY (32 bytes en base64 o 64 caracteres hex).
 * Generar una con:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Si se pierde esa clave, hay que volver a cargar las credenciales de todas las empresas.
 */
import crypto from 'node:crypto';

function clave() {
  const raw = (process.env.PAYMENTS_ENC_KEY || '').trim();
  if (!raw) throw new Error('Falta configurar PAYMENTS_ENC_KEY en el servidor.');
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('PAYMENTS_ENC_KEY debe tener 32 bytes.');
  return buf;
}

export function cifradoDisponible() {
  try { clave(); return true; } catch { return false; }
}

// Devuelve "v1:<iv>:<tag>:<datos>" en base64.
export function cifrar(objeto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const datos = Buffer.concat([c.update(JSON.stringify(objeto), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), datos.toString('base64')].join(':');
}

export function descifrar(texto) {
  const [v, iv, tag, datos] = String(texto || '').split(':');
  if (v !== 'v1') throw new Error('Formato de credenciales desconocido');
  const d = crypto.createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8'));
}
