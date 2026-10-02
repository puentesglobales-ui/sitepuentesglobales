# Tareas — Puentes Globales

Plan de trabajo según los informes de búsqueda de empleo, plan de CVs y marco legal (enlaces en `CLAUDE.md`).
Responsable: **Usuario** (acciones en paneles o decisiones), **Código** (cambio en este repo), **Abogado**.
Marcar `[x]` al terminar. Una tarea de código que depende de otra lo dice en "Depende de".

## Hecho
- [x] Corregir los tests: personalidad no cargaba, flecha de la pregunta 11 de razonamiento, ítems ambiguos de idiomas, cálculo del motor psicométrico.
- [x] Test de coeficiente intelectual (`test-ci.html`).
- [x] Registro obligatorio con Supabase para tests y búsqueda.
- [x] Claves de APIs y feeds RSS fuera del código, en variables de entorno de Render.
- [x] Panel "Estado de fuentes" en el admin.
- [x] Feeds RSS conectados al buscador, con caché de 15 minutos.
- [x] Historial de GitHub reescrito sin claves.
- [x] Registro conectado al proyecto de Supabase de Puentes Globales.
- [x] Tutor IA (`/home`) quitado del sitio.
- [x] Búsqueda de empleo gratis e ilimitada en todos los planes.

## Fase 0 — Antes de juntar CVs

| # | Tarea | Responsable | Depende de |
|---|---|---|---|
| 1 | Ejecutar `supabase/migrations/20261002_pg_uso_planes.sql` en Supabase | Usuario | — |
| 2 | Publicar límites de ATS y simulador (rama `limites-ats`: cuenta gratis 1 uso, Pro sin límite) | Código | 1 |
| 3 | Vincular el grupo de variables "puentes globales" al servicio `sitepuentesglobales` en Render y verificar las 11 fuentes en "Estado de fuentes" | Usuario | — |
| 4 | Supabase → Authentication → URL Configuration: Site URL y Redirect URLs con `https://sitepuentesglobales.onrender.com` | Usuario | — |
| 5 | Pedir a GitHub Support que elimine el commit `963d1fa` y sus vistas en caché | Usuario | — |
| 6 | Quitar Remotive del buscador (sus términos prohíben mostrar ofertas a cambio de registro) | Código | — |
| 7 | Corregir el mapa de países de Adzuna ("España" cae en Reino Unido) y pasar la ubicación a Reed | Código | — |
| 8 | Inicio de sesión de administrador en `admin.html` y registro de quién ve o descarga cada CV | Código | — |
| 9 | Permisos separados en el registro, sin casillas marcadas, con tabla de historial (tipo, texto, versión, fecha) | Código | 10 |
| 10 | Redactar política de privacidad y términos (borrador en el informe legal) | Usuario + Abogado | — |
| 11 | Revisar con abogados el informe legal y los textos de permisos | Abogado | — |
| 12 | Crear proyecto de Supabase en `eu-central-1` (Frankfurt) y mover el servicio de Render a Frankfurt, antes del primer usuario real | Usuario | — |
| 13 | Apuntar el sitio al proyecto de la UE (`auth-gate.js`, `SUPABASE_URL`) y correr las migraciones allí | Código | 12 |
| 14 | Alojar en el servidor las fuentes tipográficas y scripts que hoy vienen de Google Fonts, jsDelivr y unpkg | Código | — |
| 15 | Pantalla "Mis datos": ver y cambiar permisos, descargar todo, borrar la cuenta | Código | 9 |
| 16 | Corregir el nombre del servicio en `render.yaml` (`sitepuentesglobales`) y la región | Código | 12 |
| 17 | Revisar restricciones para reclutar personal de salud para Alemania (lista de la OMS, § 38 BeschV) | Abogado | — |

## Fase 1 — Creador de CV

| # | Tarea | Responsable | Depende de |
|---|---|---|---|
| 18 | Elegir proveedor de IA para redactar, traducir y adaptar CVs (que no entrene con los datos) y cargar su clave en Render | Usuario | — |
| 19 | Modelo de datos del perfil completo: destino, profesión, experiencia, formación y reconocimiento de título, idiomas (A1–C2), licencias | Código | 13 |
| 20 | Onboarding de 7 pasos con guardado automático y barra de progreso, pensado para celular | Código | 19 |
| 21 | Selector de profesión con la clasificación europea ESCO | Código | 19 |
| 22 | Subir CV o PDF de LinkedIn y completar el perfil con IA | Código | 18, 19 |
| 23 | Generar PDF en Europass, Lebenslauf, británico y versión ATS, en el idioma del destino | Código | 19 |
| 24 | Pasar los criterios del curso de Skool para adaptar un CV a cada puesto | Usuario | — |
| 25 | CV adaptado a cada oferta según esos criterios (la IA no inventa; la persona aprueba). Gratis 1, Pro sin límite | Código | 18, 23, 24 |
| 26 | Escáner ATS con puntaje antes y después de adaptar | Código | 25 |
| 27 | Pregunta opcional en el onboarding: "¿Te interesan trabajos remotos de entrenamiento de IA?" | Código | 9 |

## Fase 2 — Ofertas que encajan

| # | Tarea | Responsable | Depende de |
|---|---|---|---|
| 28 | Base de ofertas aparte con actualización programada, respetando los límites de cada fuente y borrando ofertas vencidas | Código | 13 |
| 29 | Búsqueda con "qué" y "dónde" libres, traducción de la profesión al idioma del país (ESCO) y ruteo por país | Código | 21, 28 |
| 30 | Filtros: contrato, jornada, salario, antigüedad, remoto, patrocinio de visa, idioma requerido | Código | 28 |
| 31 | Ofertas recomendadas según el perfil y alertas por email o WhatsApp (solo con permiso) | Código | 9, 19, 28 |
| 32 | Recordatorio a quien dejó el CV a medias (solo con permiso) | Código | 20 |
| 33 | Email a los perfiles que encajan con el proyecto de etiquetado de IA; sin compartir datos hasta que acepten | Código | 27 |
| 34 | Pedir acceso y sumar fuentes: Jooble, Careerjet, Agencia Federal de Empleo de Alemania | Usuario + Código | 28 |

## Fase 3 — Empresas

| # | Tarea | Responsable | Depende de |
|---|---|---|---|
| 35 | Elegir 2 o 3 perfiles con escasez para concentrar la captación de CVs y salir a buscar las primeras empresas | Usuario | 17 |
| 36 | Portal de empresas: registro verificado y publicación de ofertas propias | Código | 28 |
| 37 | Candidatos que encajan con cada oferta, solo entre quienes aceptaron compartir su CV; registro de cada envío y aviso a la persona | Código | 9, 25, 36 |
| 38 | Contrato modelo con empresas receptoras de CVs y con el proyecto de etiquetado | Abogado | 11 |
| 39 | Planes pagos para empresas (publicar, destacar, acceder a la base) | Usuario + Código | 36 |
| 40 | Pagos online del Plan Pro de candidatos, en lugar de cargarlo a mano en `pg_planes` | Código | 2 |
