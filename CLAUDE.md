# Puentes Globales — Contexto del proyecto

## Qué es
Portal de empleo en Europa para profesionales de Latinoamérica. Los candidatos se preparan (tests, escáner ATS, simulador de entrevistas, curso en Skool), arman su CV y buscan ofertas. Objetivo de negocio: reunir muchos CVs completos, con permiso explícito de cada persona para usar sus datos en su búsqueda de trabajo, para que las empresas vengan a publicar ofertas propias.

Plan y tareas: `docs/TAREAS.md`.

## Proyectos separados — no mezclar
- **Alex IO / alexio.online** es otro proyecto. El Tutor IA (`/home`) era de Alex IO y se quitó de este repo. No traer código, ramas ni configuración de Alex IO acá.
- El widget de chat que carga `index.html` (`whatsapp-fullstack-ylsx.onrender.com/widget.js`) es de Alex IO: tratarlo como servicio externo.

## Stack
- **Backend**: Node 18, Express 4, ES modules (`"type": "module"`). Entrada: `server.js`. Sin base de datos propia en el servidor.
- **Frontend**: HTML estático en `public/` servido por Express. Sin framework ni build.
- **Auth y datos**: Supabase, proyecto `mceiutonddbgddrrrajv` ("puentesglobales-ui's Project", hoy en `us-west-2`; se va a mudar a la UE, ver tareas). El navegador usa `public/auth-gate.js` con la clave *publishable* (pública). La seguridad está en las políticas RLS.
- **Deploy**: Render, servicio **`sitepuentesglobales`** → https://sitepuentesglobales.onrender.com. Cada push a `main` se publica solo. (Ojo: `render.yaml` todavía dice `puentes-globales-app`.)
- **Tests**: `npm test` (node:test, sin dependencias extra). Tienen que pasar antes de cada push.

## Estructura
```
server.js                 rutas /api/v1/*, estáticos de public/, rate limit
config/apis.js            fuentes de empleo; claves y RSS desde variables de entorno
services/jobAdapters/     un adaptador por API + RssAdapter (caché 15 min) + timeout 10 s; cada uno declara cubre(destino)
services/destinos.js      países de destino: nombre/código → código Adzuna e idiomas
services/profesiones.js   diccionario propio de profesiones frecuentes, por idioma (tiene prioridad)
services/esco.js          traducción de la profesión con ESCO para lo que no está en el diccionario
public/fonts.css, fonts/  fuentes alojadas en el sitio; /vendor/supabase.js y /vendor/lucide.js salen de node_modules
services/saasCore.js      planes de candidatos
services/usage.js         sesión Supabase en el servidor y contador de usos
services/supabaseAdmin.js acceso con clave secreta (solo rutas protegidas) y auditoría
public/mis-datos.html     perfil, permisos, resultados, descarga y borrado de la cuenta
public/privacidad.html    política de privacidad y términos (BORRADOR hasta revisión legal)
services/marcaBlanca*.js  marca blanca: empresa por ?org/subdominio/dominio, config pública, precios, combos, pagos
services/cifrado.js       AES-256-GCM para claves de pago (PAYMENTS_ENC_KEY)
public/marca.js           aplica marca y colores de la empresa; PG_MARCA.config con productos, combos y pagos
services/pagos/           proveedores.js (Mercado Pago, Stripe, PayPal) y ventas.js (precio del servidor, cuenta, comisión, aprobación idempotente, accesos)
routes/pagos.js           /checkout, /venta/:id, webhooks de Stripe y Mercado Pago, retorno de PayPal
public/empresa.html       panel de cada empresa (?empresa=slug); public/superadmin.html panel del superadmin
controllers/, routes/     API: jobs, ats, psychometric, talkme, saas, admin
public/auth-gate.js       registro/login obligatorio (Supabase), guarda resultados de tests
public/test-*.html        6 tests (razonamiento, numérico, idiomas, personalidad, psicométrico, CI)
public/admin.html         panel admin (la sección "Estado de fuentes" usa ADMIN_TOKEN)
supabase/migrations/      SQL que se ejecuta A MANO en Supabase → SQL Editor
tests/                    tests de contenido de los tests, fuentes, planes y límites
docs/TAREAS.md            plan de trabajo numerado
```

## Variables de entorno (Render → grupo "puentes globales")
`ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `REED_API_KEY`, `FINDWORK_TOKEN`, `ADMIN_TOKEN`, `RSS_FEEDS`.
- `RSS_FEEDS` = `"Nombre|https://url;Otro|https://url"`.
- `ADMIN_EMAILS` = emails del equipo separados por coma (acceso al panel admin, con email confirmado).
- `SUPABASE_SECRET_KEY` = clave secreta de Supabase (sb_secret_…): solo servidor; lista de candidatos del admin y borrado de cuentas.
- `SUPER_ADMIN_EMAILS` = emails del superadmin de Puentes Globales (empresas, comisiones, catálogo).
- `PAYMENTS_ENC_KEY` = 32 bytes en base64 para cifrar las claves de pago de cada empresa. Si se pierde, hay que recargar todas.
- `BASE_DOMAIN` = dominio propio (p. ej. puentesglobales.com) para reconocer empresas por subdominio. Sin él, se usa ?org=slug.
- `PUBLIC_URL` = dirección pública del sitio (p. ej. https://puentesglobales.com) para las vueltas de los medios de pago. Sin ella se usa la del pedido.
- `RESEND_API_KEY` y `EMAIL_FROM` ("Puentes Globales <hola@dominio>") = envío de invitaciones de etiquetado con Resend. Exige dominio propio verificado; sin ellas el panel da el texto para enviarlo a mano.
- `ETIQUETADO_AGENDA_URL` = enlace para que los candidatos elijan horario de la videollamada (Calendly o similar). Sin él, el email pide responder con horarios.
- Opcionales: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (si no, usa el proyecto actual), `GEMINI_API_KEY` u `OPENAI_API_KEY` (simulador de entrevistas; sin clave responde con textos fijos).
- Una fuente sin su variable queda desactivada; no rompe el sitio.
- Para probar local: archivo `.env` (está en `.gitignore`).

## Reglas que no se rompen
1. **Ninguna clave en el repo.** El historial de GitHub se limpió de claves expuestas; un test (`tests/admin-fuentes.test.js`) falla si vuelve a aparecer una en `config/apis.js` o una URL de RSS escrita en el código.
2. **No se cobra al candidato por conseguir trabajo.** Buscar ofertas, ser visible para empresas, postularse y recibir alertas: gratis e ilimitado. Se cobra solo la preparación: curso en Skool, ATS, simulador, CV premium/adaptado. Cuenta gratis: 1 uso de ATS y 1 entrevista simulada (rama `limites-ats`, tarea 2 de `docs/TAREAS.md`).
3. **Datos personales**: permisos separados, casillas desmarcadas, con historial (texto, versión, fecha). Los tests y el CI nunca deciden solos sobre una persona: revisión humana. Los CVs no se usan como datos para entrenar IA.
4. **Términos de las fuentes**: mostrar la fuente y enlazar a la oferta original. Remotive se quitó: prohíbe mostrar sus ofertas a cambio de registro.
5. **La IA no inventa** en los CVs: solo reordena y reformula lo que la persona cargó.
6. **Sin recursos de terceros en las páginas**: nada de Google Fonts ni CDNs (envían la IP del visitante). `tests/recursos-externos.test.js` lo controla. La única excepción es el widget de Alex IO.
7. **Marca blanca**: lo que una empresa no define (precios, combos, medios de pago) se toma de la plataforma. Las empresas no pueden cambiar su comisión ni su dominio; las claves de pago nunca vuelven por la API.
8. **Pagos**: el precio sale siempre del servidor; una venta se aprueba solo con lo que confirma el proveedor (webhook firmado o consulta a su API) y si el monto coincide. Los productos mensuales dan 30 días por pago, sin renovación automática.
9. **La base de etiquetadores no se vende**: Puentes Globales vende horas de trabajo de su propio equipo, nunca la lista de personas.

## Convenciones
- Textos del sitio en español rioplatense (vos: "tenés", "podés").
- Escribir con `textContent` cualquier dato que venga del usuario o de una API (evitar XSS).
- Los archivos tienen fin de línea CRLF; editar sin cambiar el formato del resto del archivo.
- Commits en español, describiendo el porqué.
- Un cambio que necesita tablas nuevas en Supabase no se publica hasta que el SQL esté ejecutado (si no, la función da 503 a todos).

## Documentos de referencia
- Informe de búsqueda de empleo: https://claude.ai/artifact/M2Rv54Y6eYFp7ETzroFby1
- Plan de CVs: https://claude.ai/artifact/LnjpwSdH8hmW6AWDjgK9eU
- Marco legal (borrador para abogados): https://claude.ai/artifact/KSuR5cURcmSN4enaeJtP3p
