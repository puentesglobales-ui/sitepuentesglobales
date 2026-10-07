# Tareas — Puentes Globales

Lista única de pendientes, al día al 2026-10-07 (main = `08e6621`).
Responsable: **Usuario** (paneles, decisiones, contenido), **Código** (este repo), **Alex IO** (pedidos al proyecto Alex IO, que es aparte), **Abogado**.
Marcar `[x]` al terminar y pasarla a "Hecho".

## Pendientes

### A. Usuario — configuración (minutos cada una)
| # | Tarea | Depende de |
|---|---|---|
| 1 | Probar en producción el simulador de punta a punta (empezar, responder, terminar y ver el puntaje) y abrir `admin-etiquetado.html` | — |
| 2 | Render: `SUPER_ADMIN_EMAILS` (tu email) y `PAYMENTS_ENC_KEY` (botón **Generate**; guardar una copia segura) | — |
| 3 | Render: `EMAIL_FROM` = `Puentes Globales <hola@puentesglobales.com>` cuando Resend diga **Verified** | — |
| 4 | SiteGround: reenvío de `hola@puentesglobales.com` a tu Gmail (para recibir respuestas de candidatos) | — |
| 5 | Render: `ETIQUETADO_AGENDA_URL` (enlace de reservas de Google Calendar o Calendly, 20 min, con Google Meet) | — |
| 6 | Superadmin: crear un combo "CV + ATS" para vender mientras el "Plan Profesional" (incluye simulador) está en Próximamente | 2 |
| 7 | Render: `ALEXIO_PRODUCTOS` = `simulador` (y después `simulador,idiomas`) para abrir la venta, cuando las pruebas den bien | 1 |
| 8 | Supabase → Authentication → URL Configuration: Site URL y Redirect URLs del sitio (hoy `sitepuentesglobales.onrender.com`; después el dominio propio) | — |
| 9a | Ejecutar en Supabase `20261009_evaluaciones.sql` (evaluador de visas) | — |
| 9 | Pedir a GitHub Support que elimine el commit `963d1fa` (tenía claves) y sus vistas en caché | — |

### B. Usuario — antes de salir con usuarios reales
| # | Tarea | Depende de |
|---|---|---|
| 10 | Pasar el sitio a `puentesglobales.com`: dominio propio en Render, DNS en SiteGround, `PUBLIC_URL`, `BASE_DOMAIN` y comodín de subdominios para marca blanca | — |
| 11 | Datos en Europa: proyecto de Supabase en `eu-central-1` (Frankfurt) y servicio de Render en Frankfurt | — |
| 12 | Medios de pago: claves de prueba de Mercado Pago, Stripe y PayPal en el superadmin y una compra de punta a punta | 2 |
| 13 | Completar los datos de la empresa en `privacidad.html` (hoy dice `[completar]`) | — |

### C. Usuario — contenido y criterios
| # | Tarea | Depende de |
|---|---|---|
| 14 | Criterios del curso de Skool para adaptar un CV a cada puesto | — |
| 15 | Contenido real para Alex IO: rondas del simulador (por puesto y país) y lecciones de idiomas (A1–C2, alemán, inglés…). Hoy hay contenido de arranque: 1 track y 3 lecciones de inglés | — |
| 16 | Validar las rúbricas de Alex IO (simulador: contenido, estructura STAR, comunicación, preguntas difíciles; idiomas: vocabulario, gramática, fluidez, comprensión) | — |
| 17 | Elegir 2 o 3 perfiles con escasez para concentrar la captación de CVs y salir a buscar las primeras empresas | 23 |
| 18 | Decidir el widget "ALEX IO" de textos fijos (`alex-widget.js`): quitarlo o conectarlo a Alex IO | — |
| 19 | Decidir la IA para adaptar CVs y subir CV/LinkedIn (¿también Alex IO?) | — |

### D. Abogado
| # | Tarea | Depende de |
|---|---|---|
| 20 | Revisar el informe legal, la política de privacidad, los términos y los textos de permisos | 13 |
| 21 | **Análisis de voz** (simulador e idiomas): confirmar que medir ritmo, pausas, muletillas y pronunciación no es "reconocimiento de emociones" (AI Act art. 5.1.f, prohibido en trabajo y educación); la voz es dato personal: permiso explícito, plazo de borrado, encargado de tratamiento | — |
| 22 | Contratos: marca blanca (empresa responsable, Puentes Globales encargado, comisión), empresas que reciben CVs, etiquetadores (autónomos o empleados, confidencialidad, pagos internacionales) | 20 |
| 23 | Reclutar personal de salud para Alemania (lista de la OMS, § 38 BeschV) | — |

### E. Alex IO — pedidos
| # | Tarea | Depende de |
|---|---|---|
| 24 | Borrado por alumno: `DELETE /api/engine/students/{student_ref}` (hoy las cuentas borradas quedan anotadas como "pendiente" en la auditoría) | — |
| 25 | **Audio en la API motor** (Alex IO ya analiza audio y habla): especificación de un turno por voz para `coach` y `tutor`: recibir el audio, devolver transcripción, respuesta en texto **y en audio**, y métricas observables (palabras por minuto, pausas, muletillas, pronunciación por palabra), **sin inferir emociones**; formatos de audio, tamaño y duración máximos; borrado del audio después de analizarlo; dónde se procesa (región) | 21 |
| 26 | Más contexto en el simulador: idioma de la entrevista, país, dificultad y resumen del CV (hoy solo `track` y `role`; la entrevista es siempre en español) | — |
| 27 | Lección de inicio en idiomas, para que el progreso siga entre sesiones (hoy cada sesión empieza en la lección 1) | — |
| 28 | Botón "Copiar" para la clave en SuperAdmin → API Motor (hoy se corta al copiarla) | — |
| 29 | Campo opcional "estilo de profesor" en el contexto (por empresa de marca blanca) | — |
| 30a | **Evaluador de visas**: implementar `POST /api/engine/evaluations` (type `visa_eligibility`) con el contrato definido en `services/alexioMotor.js`; reglas de visas actualizadas en su RAG (Chancenkarte, Blue Card, profesionales cualificados, España, etc.); no guardar las respuestas. Al tenerlo: Render `ALEXIO_EVALUADOR=1` | — |
| 30 | Datos en la UE y contrato de tratamiento de datos con sus proveedores de IA | — |

### F. Código (Puentes Globales)
| # | Tarea | Tiempo real aprox. | Depende de |
|---|---|---|---|
| 31 | Banco de preguntas del test de CI y de la prueba de etiquetado, que se mezclan por persona para que no se puedan copiar | 1–2 h | — |
| 32 | **Audio con Alex IO en idiomas y en el simulador**: grabar la respuesta en el navegador, enviarla por el servidor a Alex IO, reproducir la voz de Alex IO, mostrar las métricas (ritmo, pausas, muletillas, pronunciación por palabra) en cada turno y en el resultado final; permiso explícito de voz con historial; el audio no se guarda en Puentes Globales. El dictado y la voz del navegador (ya publicados) quedan como respaldo | 3–4 h | 21, 25 |
| 33 | Base de ofertas propia con actualización programada, filtros (contrato, jornada, salario, remoto, visa, idioma) y alertas por email (solo con permiso) | 4–6 h | — |
| 34 | Pagos: reparto automático de la comisión, liquidación mensual de empresas con medios propios y renovación automática de productos mensuales | 4–6 h | 12 |
| 35 | Portal de empresas: registro verificado, ofertas propias, candidatos que encajan (solo con permiso), registro de cada envío y aviso a la persona; planes pagos para empresas | 4–6 h | 33 |
| 36 | CV adaptado a cada oferta con IA (no inventa; la persona aprueba), versión ATS del PDF, subir CV o LinkedIn, escáner ATS antes y después | 3–4 h | 14, 19 |
| 37 | Recordatorio a quien dejó el CV a medias y ofertas recomendadas según el perfil (solo con permiso) | 1–2 h | 33 |
| 38 | Sumar fuentes de ofertas: Jooble, Careerjet, Agencia Federal de Empleo de Alemania (pedir acceso: Usuario) | 1–2 h | 33 |
| 39 | Apuntar el sitio al Supabase de la UE y corregir nombre y región en `render.yaml` | 30 min | 11 |

## Hecho
- [x] Evaluador de visas con respuestas escritas (`evaluador-visa.html`, tabla `pg_evaluaciones`): con cuenta, hasta 3 por día; se guardan siempre y, con `ALEXIO_EVALUADOR=1`, la IA de Alex IO devuelve puntaje, visas que encajan, qué falta y próximos pasos. Reemplaza al cálculo de 3 listas del inicio.
- [x] Voz con funciones del navegador en idiomas y simulador: escuchar cada respuesta, leerlas solas, dictar la respuesta y aviso cuando no se entendió claro (sin grabar ni guardar audio).
- [x] Simulador e idiomas conectados a la API motor de Alex IO (contrato real `/api/engine`), con modo prueba para administradores, uso gratis único, historial, rúbrica y puntaje, tope de 40 respuestas, "Próximamente" y sin venta hasta `ALEXIO_PRODUCTOS`. Se quitó el simulador viejo de textos fijos.
- [x] Prueba de aptitud para etiquetado de IA (`test-etiquetado.html`, corregida en el servidor, una vez, 30 minutos) y embudo en `admin-etiquetado.html` (filtros por CI y puntaje, invitar por email o a mano, aprobar o descartar). Dominio verificándose en Resend (región Irlanda).
- [x] Creador de CV: 7 pasos que empiezan por el puesto, traducción del puesto por país, revisión automática con puntaje, CV en Lebenslauf, británico, résumé de EE. UU./Canadá y Europass.
- [x] Marca blanca: empresas con marca, dominio, precios, combos y medios de pago propios (cifrados), comisión; paneles de empresa y superadmin; cobro real con Mercado Pago, Stripe y PayPal y accesos por producto.
- [x] Permisos separados con historial, "Mis datos" (descarga y borrado de cuenta), login de administradores con auditoría, borrador de privacidad y términos.
- [x] Búsqueda de empleo gratis e ilimitada, en español traducida al idioma de cada país (diccionario propio + ESCO), RSS conectados, Remotive fuera.
- [x] Test de CI con tarjeta para compartir y anotación para trabajos de IA; tests corregidos; registro obligatorio.
- [x] Claves fuera del código y del historial de GitHub; librerías y fuentes servidas desde el propio sitio; Tutor IA quitado.
- [x] Dominio `puentesglobales.com` comprado (DNS en SiteGround). Variables cargadas: `SUPABASE_SECRET_KEY`, `ADMIN_EMAILS`, `RESEND_API_KEY`, `ALEXIO_ENGINE_URL`, `ALEXIO_ENGINE_KEY`, `ALEXIO_REF_SECRET`. Migraciones hasta `20261008` ejecutadas.
