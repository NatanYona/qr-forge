# QR avanzado (contador de escaneos) — Diseño

**Fecha:** 2026-09-26
**Estado:** aprobado

## Objetivo

Poder crear QRs que cuenten cuántas veces se escanearon, sin romper la filosofía del proyecto:
gratis, sin rehenes, sin tracking invasivo, sin muros de registro.

La función es **solo para el admin** (el dueño del proyecto). El generador público no cambia.

## Principios

- **Regla de datos:** el servidor solo usa *qué link se escaneó* y *a qué hora*. Nunca lee ni guarda
  IP, User-Agent, idioma ni ninguna otra cabecera de quien escanea.
- **Sin demora perceptible:** la redirección responde antes de escribir el contador.
- **Sin rehenes:** la redirección de un link creado no depende de las estadísticas. Si hubiera que
  recortar algo, se recortan las estadísticas, nunca la redirección.
- **Transparencia:** página pública `/privacidad` que explica exactamente qué se registra.

## Limitación aceptada

Un QR con contador codifica la URL corta (`go.<dominio>/<slug>`), no el destino final. La vista
previa de la cámara muestra nuestro dominio. Se mitiga con un dominio corto y slugs legibles.

## Alcance v1

Incluido:
- Contador de escaneos por hora (de ahí salen el total, el detalle por día y la distribución por hora del día).
- Destino editable.
- Pausar y reactivar un link.
- Nombre por link (sirve para comparar campañas: dos links con el mismo destino).
- Exportar las estadísticas a CSV.
- El generador público acepta `?url=` para cargar la URL ya completada.

Fuera de alcance (a propósito):
- Visitantes únicos, país, dispositivo, idioma: violan la regla de datos.
- Página intermedia antes de redirigir: agrega demora.
- Vencimiento automático: se agrega cuando haga falta.
- Cuentas para terceros / acceso público a la función: por ahora solo el admin.

## Arquitectura

```
GitHub Pages (sin cambios salvo ?url=)      Cloudflare — go.<dominio>
┌──────────────────────┐                   ┌──────────────────────────────────────┐
│ generador público    │◄── botón ─────────│ Worker                               │
│ lee ?url= al cargar  │  "Generar QR"     │  GET /:slug      → 302 / pausado / 404│
└──────────────────────┘                   │  GET /privacidad → HTML estático      │
                                           │  /admin, /api/*  → Cloudflare Access  │
                                           │ D1 (SQLite)                           │
                                           └──────────────────────────────────────┘
```

Estructura del repo:

```
worker/
  wrangler.toml
  migrations/0001_init.sql
  src/index.ts        # router: redirect, privacidad, admin, api
  src/admin.html      # panel del admin (HTML + JS plano, estilo terminal)
  test/worker.test.ts
```

El panel del admin **no** forma parte del bundle público de GitHub Pages.

## Datos (D1)

```sql
CREATE TABLE links (
  slug        TEXT PRIMARY KEY,           -- [a-z0-9-], 1–64 caracteres
  name        TEXT NOT NULL,
  destination TEXT NOT NULL,              -- solo http:// o https://
  paused      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL               -- ISO 8601 UTC
);

CREATE TABLE scans (
  slug  TEXT NOT NULL REFERENCES links(slug) ON DELETE CASCADE,
  hour  TEXT NOT NULL,                    -- 'YYYY-MM-DDTHH' en UTC
  count INTEGER NOT NULL,
  PRIMARY KEY (slug, hour)
);
```

Un escaneo = `INSERT INTO scans VALUES (?, ?, 1) ON CONFLICT(slug, hour) DO UPDATE SET count = count + 1`.
No existe ninguna fila por escaneo individual.

## Flujo de escaneo — `GET /:slug`

1. Buscar `slug` en `links`.
2. No existe → 404 con página mínima.
3. `paused = 1` → 200 con página mínima "Este QR está pausado". No cuenta.
4. Activo → **302** a `destination` + `ctx.waitUntil(incremento del contador)`.
   - 302 y no 301: los 301 se cachean en el navegador y romperían la edición del destino y el conteo.
   - Si el incremento falla, la redirección ya salió; el error se ignora.
5. Solo `GET` cuenta el escaneo. `HEAD` devuelve la misma respuesta (302 / pausado / 404) sin contar.
   Cualquier otro método → 405.
6. El Worker no loguea cabeceras de la request; Workers Logs desactivados en `wrangler.toml`.

## API del admin (`/api/*`)

| Método | Ruta                    | Qué hace                                             |
|--------|-------------------------|------------------------------------------------------|
| GET    | `/api/links`            | Lista links con total de escaneos                    |
| POST   | `/api/links`            | Crea `{slug, name, destination}`                     |
| PATCH  | `/api/links/:slug`      | Actualiza `name`, `destination` y/o `paused`         |
| GET    | `/api/links/:slug/scans`| Filas `{hour, count}` de ese link                    |

Validaciones (en el Worker, siempre):
- `slug`: `^[a-z0-9-]{1,64}$`; no puede ser `admin`, `api` ni `privacidad`. Duplicado → 409.
- `destination`: `new URL()` válido con protocolo `http:` o `https:`. Otro → 400.
- `name`: no vacío, máximo 100 caracteres.

No hay borrado de links en v1: pausar cubre el caso y evita romper QRs impresos por error.

## Panel del admin (`/admin`)

HTML único servido por el Worker, JS plano, estilo terminal coherente con el sitio.
- Lista: nombre, URL corta, total y estado; al tocar una fila se abre el detalle.
- Formulario de alta: nombre, slug (sugerido a partir del nombre), destino.
- Detalle: copiar la URL corta, botón **Generar QR** (abre `https://natanyona.github.io/qr-forge/?url=<url corta>`), editar destino, pausar/reactivar, barras por día, barras por hora del día
  (convertidas a la zona horaria del navegador), exportar CSV (`hour,count`, generado en el navegador).
- Gráficos con `div`s o SVG simple; sin librería de gráficos.

## Seguridad

- **Cloudflare Access** protege `go.<dominio>/admin` y `go.<dominio>/api/*`; la política permite
  solo el email del admin (código por email).
- **Defensa en profundidad:** cada request a `/api/*` y `/admin` verifica el JWT de
  `Cf-Access-Jwt-Assertion` contra las claves del equipo de Access (`/cdn-cgi/access/certs`), y
  comprueba `aud` y el email. Sin JWT válido → 403. Configuración por secrets del Worker (no se publica el email en el repo):
  `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_EMAIL`.
- Validación de `destination` en el servidor (evita `javascript:`, `data:`, etc.).
- **CSRF en `/api/*`:** cualquier método distinto de `GET` se rechaza (403) salvo que
  `content-type` sea `application/json` y `sec-fetch-site` esté ausente o sea `same-origin`, para
  que un formulario cross-site (que no puede fijar ese `content-type`) no pueda mutar datos aunque
  el navegador mande la cookie de Access.

## Cambio en el generador público

Al montar, si la URL de la página trae `?url=`, se usa como valor inicial del campo URL.
No se valida más allá de lo que ya valida el formulario.

## Deploy

- Workflow de GitHub Actions `deploy-worker.yml`: al hacer push a `main` con cambios en `worker/**`,
  corre `wrangler deploy` con el secret `CLOUDFLARE_API_TOKEN`.
- El workflow aplica `wrangler d1 migrations apply qr-forge --remote` antes de cada deploy (idempotente).

## Pruebas

Un archivo `worker/test/worker.test.ts` (Vitest + `@cloudflare/vitest-pool-workers`, D1 local):
- slug activo → 302 al destino y el contador de esa hora sube en 1;
- slug pausado → 200 con página de pausado y no cuenta;
- slug inexistente → 404;
- `HEAD` sobre un slug → misma respuesta sin contar; otros métodos → 405;
- `/api/links` sin JWT → 403; JWT firmado con `jose` (email/aud/iss correctos e incorrectos) → 200/403;
- POST a `/api/*` con `content-type` distinto de `application/json` o `sec-fetch-site: cross-site` → 403;
- alta con `destination` `javascript:` → 400; slug reservado o duplicado → 400/409.

## Pasos manuales del admin

1. Comprar el dominio y delegar su DNS a Cloudflare.
2. Crear la base D1 (`wrangler d1 create qr-forge`) y copiar su id a `wrangler.toml`.
3. Crear la aplicación de Cloudflare Access para `/admin` y `/api/*` con política "solo mi email";
   cargar `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` y `ADMIN_EMAIL` con `wrangler secret put`.
4. Crear el token de API de Cloudflare y guardarlo como secret `CLOUDFLARE_API_TOKEN` en GitHub.

## Decisiones pendientes

- Nombre del dominio (se fija en `wrangler.toml` cuando esté comprado; el código no depende de él).
