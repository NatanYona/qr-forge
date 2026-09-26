# QR avanzado (contador de escaneos) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un Cloudflare Worker en dominio propio que redirige QRs cortos contando escaneos por hora, con un panel de admin protegido por Cloudflare Access, sin tocar datos de quien escanea.

**Architecture:** Workspace Yarn nuevo en `worker/` (Worker + D1). `GET /:slug` responde 302 y suma el contador en `waitUntil`. `/admin` (HTML plano importado como texto) y `/api/*` exigen un JWT válido de Cloudflare Access. El generador público en GitHub Pages solo aprende a leer `?url=`.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), wrangler 4, `jose` (verificación de JWT), Vitest 4 + `@cloudflare/vitest-pool-workers` 0.22, Yarn 4 workspaces (Corepack).

**Spec:** `docs/superpowers/specs/2026-09-26-qr-avanzado-design.md`

## Global Constraints

- **Regla de datos:** el Worker solo usa el slug y la hora. Nunca lee ni guarda IP, User-Agent, idioma, `request.cf` ni otras cabeceras de quien escanea. Nada de `console.log(request…)`.
- Redirección **302** (nunca 301).
- `hour` = `'YYYY-MM-DDTHH'` en UTC (`new Date().toISOString().slice(0, 13)`).
- Slug: `^[a-z0-9-]{1,64}$`; reservados: `admin`, `api`, `privacidad`.
- Destino: solo `http:` / `https:` (`new URL()`).
- Nombre: string no vacío tras `trim()`, máximo 100 caracteres.
- Sin borrado de links en v1.
- El panel del admin no entra al bundle de GitHub Pages.
- Comandos de Yarn siempre como `corepack yarn …` (en esta máquina `corepack enable` falla).
- Commits sin trailer `Co-Authored-By` (preferencia del usuario).
- Ajustes respecto del spec (decididos al planificar): el esquema vive en `worker/migrations/0001_init.sql` (migraciones de D1) en lugar de `schema.sql`, y el workflow aplica las migraciones en cada deploy (son idempotentes). `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` y `ADMIN_EMAIL` se cargan como **secrets** del Worker (no `[vars]`), para no publicar el email en el repo. Se agrega `ADMIN_DEV_BYPASS` solo para `wrangler dev` en `localhost`.

## Estructura de archivos

```
package.json                      # modificar: "workspaces": ["worker"]
eslint.config.js                  # modificar: ignorar worker/
src/App.tsx                       # modificar: leer ?url= al iniciar
.github/workflows/deploy-worker.yml  # crear
worker/
  package.json                    # workspace qr-forge-worker
  wrangler.toml                   # Worker + D1 + regla de .html como texto
  tsconfig.json
  vitest.config.ts
  .gitignore                      # .wrangler/, .dev.vars
  .dev.vars.example
  README.md                       # pasos manuales (dominio, D1, Access, secrets)
  worker-configuration.d.ts       # generado por `wrangler types`, commiteado
  migrations/0001_init.sql
  src/index.ts                    # router + redirección + countScan
  src/pages.ts                    # páginas HTML mínimas (404, pausado, privacidad) + helper html()
  src/api.ts                      # API del admin + validaciones
  src/auth.ts                     # verificación del JWT de Access
  src/env.d.ts                    # tipos de secrets + módulo *.html
  src/admin.html                  # panel del admin
  test/env.d.ts                   # tipo de TEST_MIGRATIONS
  test/apply-migrations.ts        # setup: aplica migraciones a la D1 local
  test/worker.test.ts             # el único archivo de tests
```

---

### Task 1: Workspace del Worker + redirección con contador

**Files:**
- Modify: `package.json`, `eslint.config.js`
- Create: `worker/package.json`, `worker/wrangler.toml`, `worker/tsconfig.json`, `worker/vitest.config.ts`, `worker/.gitignore`, `worker/migrations/0001_init.sql`, `worker/src/index.ts`, `worker/src/pages.ts`, `worker/test/env.d.ts`, `worker/test/apply-migrations.ts`, `worker/test/worker.test.ts`, `worker/worker-configuration.d.ts` (generado)

**Interfaces:**
- Produces:
  - `worker/src/pages.ts`: `html(body: string, status?: number): Response`, `notFoundPage: string`, `pausedPage: string`, `privacyPage: string`
  - `worker/src/index.ts`: `default` (`ExportedHandler<Env>`), `countScan(db: D1Database, slug: string, now?: Date): Promise<D1Result>`
  - D1 binding `env.DB`; tablas `links(slug, name, destination, paused, created_at)` y `scans(slug, hour, count)`

- [ ] **Step 1: Declarar el workspace en la raíz**

En `package.json` (raíz), agregar debajo de `"type": "module",`:

```json
  "workspaces": ["worker"],
```

En `eslint.config.js`, cambiar `globalIgnores(['dist'])` por:

```js
  globalIgnores(['dist', 'worker']),
```

(El Worker se chequea con su propio `tsc`; el config de ESLint de la raíz es para React en el navegador.)

- [ ] **Step 2: Crear `worker/package.json`**

```json
{
  "name": "qr-forge-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "types": "wrangler types"
  }
}
```

- [ ] **Step 3: Instalar dependencias**

```bash
corepack yarn workspace qr-forge-worker add -D wrangler@^4 vitest@^4.1.0 @cloudflare/vitest-pool-workers@^0.22.0 typescript@~6.0.2
```

Expected: instala sin errores de peer dependencies (`vitest` debe quedar en 4.x: `@cloudflare/vitest-pool-workers@0.22` pide `vitest ^4.1.0`).

- [ ] **Step 4: Crear `worker/wrangler.toml`**

```toml
name = "qr-forge-go"
main = "src/index.ts"
compatibility_date = "2026-09-01"

# Regla de datos: sin logs de requests.
[observability]
enabled = false

[[d1_databases]]
binding = "DB"
database_name = "qr-forge"
# Reemplazar por el id que imprime `wrangler d1 create qr-forge` (ver worker/README.md).
# Los tests usan una D1 local y no dependen de este valor.
database_id = "00000000-0000-0000-0000-000000000000"
migrations_dir = "migrations"

# Permite `import adminPage from './admin.html'` como string.
[[rules]]
type = "Text"
globs = ["**/*.html"]
fallthrough = true
```

Si `wrangler` avisa que `compatibility_date` es posterior al runtime instalado, usar la fecha que sugiere el mensaje.

- [ ] **Step 5: Crear `worker/.gitignore`**

```
.wrangler/
.dev.vars
```

- [ ] **Step 6: Crear `worker/migrations/0001_init.sql`**

```sql
CREATE TABLE links (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  destination TEXT NOT NULL,
  paused      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE scans (
  slug  TEXT NOT NULL REFERENCES links(slug) ON DELETE CASCADE,
  hour  TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (slug, hour)
);
```

- [ ] **Step 7: Generar los tipos del runtime y crear `worker/tsconfig.json`**

```bash
corepack yarn workspace qr-forge-worker types
```

Expected: crea `worker/worker-configuration.d.ts` con `DB: D1Database` dentro de `Cloudflare.Env`.

`worker/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["ES2023"],
    "types": ["@cloudflare/vitest-pool-workers/types"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["worker-configuration.d.ts", "src", "test"]
}
```

- [ ] **Step 8: Configurar Vitest**

`worker/vitest.config.ts`:

```ts
import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'))
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: { setupFiles: ['./test/apply-migrations.ts'] },
  }
})
```

`worker/test/env.d.ts`:

```ts
import type { D1Migration } from '@cloudflare/vitest-pool-workers'

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
```

`worker/test/apply-migrations.ts`:

```ts
import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
```

- [ ] **Step 9: Escribir los tests de redirección (fallan)**

`worker/test/worker.test.ts`:

```ts
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import worker, { countScan } from '../src/index'

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>

async function get(path: string, init: RequestInit = {}, testEnv: Env = env) {
  const ctx = createExecutionContext()
  const res = await worker.fetch(new IncomingRequest(`https://go.test${path}`, init), testEnv, ctx)
  await waitOnExecutionContext(ctx)
  return res
}

async function scanTotal(slug: string) {
  const row = await env.DB.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM scans WHERE slug = ?')
    .bind(slug)
    .first<{ n: number }>()
  return row?.n ?? 0
}

beforeEach(async () => {
  const insert = 'INSERT INTO links (slug, name, destination, paused, created_at) VALUES (?, ?, ?, ?, ?)'
  await env.DB.batch([
    env.DB.prepare('DELETE FROM scans'),
    env.DB.prepare('DELETE FROM links'),
    env.DB.prepare(insert).bind('cafe', 'Café', 'https://maps.google.com/?q=cafe', 0, '2026-09-26T00:00:00Z'),
    env.DB.prepare(insert).bind('off', 'Apagado', 'https://example.com/', 1, '2026-09-26T00:00:00Z'),
  ])
})

describe('redirección', () => {
  it('slug activo: 302 al destino y cuenta el escaneo', async () => {
    const res = await get('/cafe')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://maps.google.com/?q=cafe')
    expect(await scanTotal('cafe')).toBe(1)
  })

  it('dos escaneos en la misma hora suman en la misma fila', async () => {
    await get('/cafe')
    await get('/cafe')
    const rows = await env.DB.prepare('SELECT count FROM scans WHERE slug = ?').bind('cafe').all()
    expect(rows.results).toEqual([{ count: 2 }])
  })

  it('slug pausado: página de pausado y no cuenta', async () => {
    const res = await get('/off')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('pausado')
    expect(await scanTotal('off')).toBe(0)
  })

  it('slug inexistente: 404', async () => {
    expect((await get('/nada')).status).toBe(404)
  })

  it('countScan agrupa por hora UTC', async () => {
    await countScan(env.DB, 'cafe', new Date('2026-09-26T13:45:10Z'))
    const row = await env.DB.prepare('SELECT hour FROM scans WHERE slug = ?').bind('cafe').first()
    expect(row).toEqual({ hour: '2026-09-26T13' })
  })
})
```

- [ ] **Step 10: Correr los tests y ver que fallan**

Run: `corepack yarn workspace qr-forge-worker test`
Expected: FAIL — no se puede resolver `../src/index`.

- [ ] **Step 11: Implementar `worker/src/pages.ts`**

```ts
const page = (title: string, body: string) => `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;
    background:#07090a;color:#c9d1cc;font:15px/1.6 ui-monospace,"JetBrains Mono",monospace}
  main{max-width:36rem}
  h1{color:#36f5a0;font-size:1.1rem}
  a{color:#36f5a0}
</style>
<main><h1>${title}</h1>${body}</main>
</html>`

export const notFoundPage = page('404 · QR no encontrado', '<p>Este código no existe.</p>')

export const pausedPage = page(
  'Este QR está pausado',
  '<p>Su dueño lo desactivó por ahora. Probá más tarde.</p>',
)

export const privacyPage = page(
  'Privacidad',
  `<p>Cuando escaneás un QR de este dominio registramos únicamente <strong>qué código se escaneó</strong>
  y <strong>la hora</strong> (redondeada a la hora).</p>
  <p>No guardamos tu IP, tu dispositivo, tu ubicación ni ningún identificador, y no usamos cookies.
  No hay forma de saber quién escaneó: solo existe un contador por hora.</p>
  <p>El código es abierto: <a href="https://github.com/NatanYona/qr-forge">github.com/NatanYona/qr-forge</a>.</p>`,
)

export function html(body: string, status = 200) {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}
```

- [ ] **Step 12: Implementar `worker/src/index.ts`**

```ts
import { html, notFoundPage, pausedPage } from './pages'

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url)
    return redirect(decodeURIComponent(pathname.slice(1)), env, ctx)
  },
} satisfies ExportedHandler<Env>

async function redirect(slug: string, env: Env, ctx: ExecutionContext) {
  const link = await env.DB.prepare('SELECT destination, paused FROM links WHERE slug = ?')
    .bind(slug)
    .first<{ destination: string; paused: number }>()
  if (!link) return html(notFoundPage, 404)
  if (link.paused) return html(pausedPage)
  // Responder primero; el contador se escribe después y un fallo no afecta la redirección.
  ctx.waitUntil(countScan(env.DB, slug).catch(() => {}))
  return Response.redirect(link.destination, 302)
}

export function countScan(db: D1Database, slug: string, now = new Date()) {
  const hour = now.toISOString().slice(0, 13) // 'YYYY-MM-DDTHH' en UTC
  return db
    .prepare(
      'INSERT INTO scans (slug, hour, count) VALUES (?, ?, 1) ON CONFLICT(slug, hour) DO UPDATE SET count = count + 1',
    )
    .bind(slug, hour)
    .run()
}
```

- [ ] **Step 13: Correr tests y typecheck**

Run: `corepack yarn workspace qr-forge-worker test`
Expected: 5 passed.

Run: `corepack yarn workspace qr-forge-worker typecheck`
Expected: sin errores.

Run: `corepack yarn build` (raíz)
Expected: el build del generador público sigue funcionando.

- [ ] **Step 14: Commit**

```bash
git add package.json yarn.lock eslint.config.js worker
git commit -m "feat(worker): redirección con contador de escaneos por hora"
```

---

### Task 2: API del admin + validaciones

**Files:**
- Create: `worker/src/api.ts`
- Modify: `worker/test/worker.test.ts`

**Interfaces:**
- Consumes: `env.DB`, tablas de Task 1, `countScan` (solo en tests)
- Produces:
  - `handleApi(request: Request, env: Env): Promise<Response>` — asume que la request ya fue autorizada
  - `validDestination(value: unknown): value is string`
  - JSON: `GET /api/links` → `{ links: LinkSummary[] }`; `POST /api/links` → `201 { slug }`; `PATCH /api/links/:slug` → `{ slug }`; `GET /api/links/:slug/scans` → `{ scans: { hour: string; count: number }[] }`; errores → `{ error: string }` con 400/404/409
  - `LinkSummary = { slug: string; name: string; destination: string; paused: boolean; created_at: string; total: number }`

- [ ] **Step 1: Agregar los tests de la API (fallan)**

Al principio de `worker/test/worker.test.ts`, agregar el import:

```ts
import { handleApi } from '../src/api'
```

Al final del archivo:

```ts
function api(method: string, path: string, body?: unknown) {
  return handleApi(
    new Request(`https://go.test${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  )
}

describe('api', () => {
  it('crea un link y lo lista con total 0', async () => {
    const res = await api('POST', '/api/links', { slug: 'menu', name: ' Menú ', destination: 'https://example.com/menu' })
    expect(res.status).toBe(201)
    const { links } = await (await api('GET', '/api/links')).json<{ links: { slug: string; name: string; total: number; paused: boolean }[] }>()
    expect(links.find((l) => l.slug === 'menu')).toMatchObject({ name: 'Menú', total: 0, paused: false })
  })

  it('rechaza destinos que no son http/https', async () => {
    for (const destination of ['javascript:alert(1)', 'data:text/html,hola', 'no es url', 42]) {
      const res = await api('POST', '/api/links', { slug: 'x', name: 'x', destination })
      expect(res.status).toBe(400)
    }
  })

  it('rechaza slugs inválidos o reservados', async () => {
    for (const slug of ['admin', 'api', 'privacidad', 'Café', 'con espacio', '', 'a'.repeat(65)]) {
      const res = await api('POST', '/api/links', { slug, name: 'x', destination: 'https://example.com' })
      expect(res.status).toBe(400)
    }
  })

  it('rechaza nombres vacíos o de más de 100 caracteres', async () => {
    for (const name of ['   ', 'n'.repeat(101), undefined]) {
      const res = await api('POST', '/api/links', { slug: 'x', name, destination: 'https://example.com' })
      expect(res.status).toBe(400)
    }
  })

  it('slug duplicado: 409', async () => {
    const res = await api('POST', '/api/links', { slug: 'cafe', name: 'otro', destination: 'https://example.com' })
    expect(res.status).toBe(409)
  })

  it('edita destino y pausa; la redirección lo respeta', async () => {
    const res = await api('PATCH', '/api/links/cafe', { destination: 'https://example.com/nuevo', paused: true })
    expect(res.status).toBe(200)
    expect(await (await get('/cafe')).text()).toContain('pausado')
    await api('PATCH', '/api/links/cafe', { paused: false })
    expect((await get('/cafe')).headers.get('location')).toBe('https://example.com/nuevo')
  })

  it('PATCH inválido: 400; slug inexistente: 404', async () => {
    expect((await api('PATCH', '/api/links/cafe', { destination: 'javascript:x' })).status).toBe(400)
    expect((await api('PATCH', '/api/links/cafe', { paused: 'si' })).status).toBe(400)
    expect((await api('PATCH', '/api/links/cafe', {})).status).toBe(400)
    expect((await api('PATCH', '/api/links/nada', { paused: true })).status).toBe(404)
  })

  it('devuelve los escaneos por hora y el total en la lista', async () => {
    await countScan(env.DB, 'cafe', new Date('2026-09-26T13:00:00Z'))
    await countScan(env.DB, 'cafe', new Date('2026-09-26T13:30:00Z'))
    await countScan(env.DB, 'cafe', new Date('2026-09-26T14:00:00Z'))
    const { scans } = await (await api('GET', '/api/links/cafe/scans')).json<{ scans: unknown[] }>()
    expect(scans).toEqual([
      { hour: '2026-09-26T13', count: 2 },
      { hour: '2026-09-26T14', count: 1 },
    ])
    const { links } = await (await api('GET', '/api/links')).json<{ links: { slug: string; total: number }[] }>()
    expect(links.find((l) => l.slug === 'cafe')?.total).toBe(3)
  })

  it('ruta desconocida: 404', async () => {
    expect((await api('GET', '/api/otra')).status).toBe(404)
    expect((await api('DELETE', '/api/links/cafe')).status).toBe(404)
  })
})
```

- [ ] **Step 2: Correr los tests y ver que fallan**

Run: `corepack yarn workspace qr-forge-worker test`
Expected: FAIL — no se puede resolver `../src/api`.

- [ ] **Step 3: Implementar `worker/src/api.ts`**

```ts
const SLUG_RE = /^[a-z0-9-]{1,64}$/
const RESERVED = new Set(['admin', 'api', 'privacidad'])

type Body = Record<string, unknown>

const json = (data: unknown, status = 200) => Response.json(data, { status })
const bad = (error: string) => json({ error }, 400)

export function validDestination(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 100
}

async function readBody(request: Request): Promise<Body | null> {
  const body = await request.json().catch(() => null)
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Body) : null
}

/** Rutas de /api/*. La autorización se verifica antes de llamar a esta función. */
export async function handleApi(request: Request, env: Env): Promise<Response> {
  const [, resource, slug, sub] = new URL(request.url).pathname.split('/').filter(Boolean)
  const { method } = request
  if (resource === 'links') {
    if (!slug && method === 'GET') return listLinks(env.DB)
    if (!slug && method === 'POST') return createLink(env.DB, await readBody(request))
    if (slug && !sub && method === 'PATCH') return updateLink(env.DB, slug, await readBody(request))
    if (slug && sub === 'scans' && method === 'GET') return listScans(env.DB, slug)
  }
  return json({ error: 'not found' }, 404)
}

async function listLinks(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT l.slug, l.name, l.destination, l.paused, l.created_at, COALESCE(SUM(s.count), 0) AS total
       FROM links l LEFT JOIN scans s ON s.slug = l.slug
       GROUP BY l.slug ORDER BY l.created_at DESC`,
    )
    .all<{ slug: string; name: string; destination: string; paused: number; created_at: string; total: number }>()
  return json({ links: results.map((l) => ({ ...l, paused: l.paused === 1 })) })
}

async function createLink(db: D1Database, body: Body | null) {
  if (!body) return bad('invalid body')
  const { slug, name, destination } = body
  if (typeof slug !== 'string' || !SLUG_RE.test(slug) || RESERVED.has(slug)) return bad('invalid slug')
  if (!validName(name)) return bad('invalid name')
  if (!validDestination(destination)) return bad('invalid destination')
  const res = await db
    .prepare('INSERT INTO links (slug, name, destination, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO NOTHING')
    .bind(slug, name.trim(), destination, new Date().toISOString())
    .run()
  if (!res.meta.changes) return json({ error: 'slug taken' }, 409)
  return json({ slug }, 201)
}

async function updateLink(db: D1Database, slug: string, body: Body | null) {
  if (!body) return bad('invalid body')
  const sets: string[] = []
  const values: (string | number)[] = []
  if ('name' in body) {
    if (!validName(body.name)) return bad('invalid name')
    sets.push('name = ?')
    values.push(body.name.trim())
  }
  if ('destination' in body) {
    if (!validDestination(body.destination)) return bad('invalid destination')
    sets.push('destination = ?')
    values.push(body.destination)
  }
  if ('paused' in body) {
    if (typeof body.paused !== 'boolean') return bad('invalid paused')
    sets.push('paused = ?')
    values.push(body.paused ? 1 : 0)
  }
  if (!sets.length) return bad('nothing to update')
  const res = await db
    .prepare(`UPDATE links SET ${sets.join(', ')} WHERE slug = ?`)
    .bind(...values, slug)
    .run()
  if (!res.meta.changes) return json({ error: 'not found' }, 404)
  return json({ slug })
}

async function listScans(db: D1Database, slug: string) {
  const { results } = await db
    .prepare('SELECT hour, count FROM scans WHERE slug = ? ORDER BY hour')
    .bind(slug)
    .all<{ hour: string; count: number }>()
  return json({ scans: results })
}
```

Nota: el `SET` dinámico solo concatena nombres de columna fijos; los valores van siempre por `bind`.

- [ ] **Step 4: Correr tests y typecheck**

Run: `corepack yarn workspace qr-forge-worker test`
Expected: 14 passed.

Run: `corepack yarn workspace qr-forge-worker typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add worker/src/api.ts worker/test/worker.test.ts
git commit -m "feat(worker): API del admin para crear, editar y pausar links"
```

---

### Task 3: Autenticación con Cloudflare Access + router completo + página de privacidad

**Files:**
- Create: `worker/src/auth.ts`, `worker/src/env.d.ts`, `worker/src/admin.html` (mínimo; se completa en Task 4), `worker/.dev.vars.example`
- Modify: `worker/src/index.ts`, `worker/test/worker.test.ts`, `worker/package.json` (dependencia `jose`)

**Interfaces:**
- Consumes: `handleApi` (Task 2), `html`, `privacyPage` (Task 1)
- Produces:
  - `isAdmin(request: Request, env: Env): Promise<boolean>`
  - `Env` opcionales: `ACCESS_TEAM_DOMAIN` (`https://<equipo>.cloudflareaccess.com`), `ACCESS_AUD`, `ADMIN_EMAIL`, `ADMIN_DEV_BYPASS`
  - Rutas: `/privacidad` (público), `/admin` y `/api/*` (403 sin admin), resto → redirección

- [ ] **Step 1: Instalar `jose`**

```bash
corepack yarn workspace qr-forge-worker add jose@^6
```

- [ ] **Step 2: Agregar los tests de acceso (fallan)**

Al final de `worker/test/worker.test.ts`:

```ts
describe('acceso', () => {
  it('/privacidad es pública', async () => {
    const res = await get('/privacidad')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('No guardamos tu IP')
  })

  it('/admin y /api/* sin JWT de Access: 403', async () => {
    expect((await get('/admin')).status).toBe(403)
    expect((await get('/api/links')).status).toBe(403)
  })

  it('JWT inválido: 403', async () => {
    const testEnv = {
      ...env,
      ACCESS_TEAM_DOMAIN: 'https://equipo.cloudflareaccess.com',
      ACCESS_AUD: 'aud',
      ADMIN_EMAIL: 'admin@example.com',
    }
    const res = await get('/api/links', { headers: { 'Cf-Access-Jwt-Assertion': 'no.es.jwt' } }, testEnv)
    expect(res.status).toBe(403)
  })

  it('ADMIN_DEV_BYPASS se ignora fuera de localhost', async () => {
    const res = await get('/api/links', {}, { ...env, ADMIN_DEV_BYPASS: '1' })
    expect(res.status).toBe(403)
  })

  it('las rutas reservadas no se tratan como slugs', async () => {
    await env.DB.prepare("INSERT INTO links (slug, name, destination, created_at) VALUES ('admin', 'x', 'https://evil.example', '')").run()
    expect((await get('/admin')).status).toBe(403)
  })
})
```

- [ ] **Step 3: Correr los tests y ver que fallan**

Run: `corepack yarn workspace qr-forge-worker test`
Expected: FAIL — `/privacidad` devuelve 404 y `/admin` intenta redirigir.

- [ ] **Step 4: Crear `worker/src/env.d.ts`**

```ts
declare global {
  namespace Cloudflare {
    interface Env {
      /** `https://<equipo>.cloudflareaccess.com` (secret). */
      ACCESS_TEAM_DOMAIN?: string
      /** Application Audience (AUD) tag de la app de Access (secret). */
      ACCESS_AUD?: string
      /** Único email autorizado (secret). */
      ADMIN_EMAIL?: string
      /** Solo `.dev.vars` para `wrangler dev`; se ignora fuera de localhost. */
      ADMIN_DEV_BYPASS?: string
    }
  }
}

declare module '*.html' {
  const content: string
  export default content
}

export {}
```

- [ ] **Step 5: Crear `worker/src/auth.ts`**

```ts
import { createRemoteJWKSet, jwtVerify } from 'jose'

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined

/**
 * Defensa en profundidad: además de la regla de Cloudflare Access en el borde,
 * verifica el JWT que Access agrega a cada request autorizada.
 */
export async function isAdmin(request: Request, env: Env): Promise<boolean> {
  const { hostname } = new URL(request.url)
  if (env.ADMIN_DEV_BYPASS === '1' && hostname === 'localhost') return true

  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  const { ACCESS_TEAM_DOMAIN, ACCESS_AUD, ADMIN_EMAIL } = env
  if (!token || !ACCESS_TEAM_DOMAIN || !ACCESS_AUD || !ADMIN_EMAIL) return false

  jwks ??= createRemoteJWKSet(new URL(`${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`))
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: ACCESS_TEAM_DOMAIN, audience: ACCESS_AUD })
    return typeof payload.email === 'string' && payload.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  } catch {
    return false
  }
}
```

- [ ] **Step 6: Crear `worker/src/admin.html` mínimo**

(Task 4 lo reemplaza por el panel completo; acá solo hace falta que el import exista.)

```html
<!doctype html>
<html lang="es"><meta charset="utf-8"><title>qr-forge · admin</title><p>admin</p></html>
```

- [ ] **Step 7: Conectar el router en `worker/src/index.ts`**

Reemplazar el bloque de imports y el `export default` por:

```ts
import adminPage from './admin.html'
import { handleApi } from './api'
import { isAdmin } from './auth'
import { html, notFoundPage, pausedPage, privacyPage } from './pages'

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/privacidad') return html(privacyPage)
    if (pathname === '/admin' || pathname.startsWith('/api/')) {
      if (!(await isAdmin(request, env))) return new Response('Forbidden', { status: 403 })
      return pathname === '/admin' ? html(adminPage) : handleApi(request, env)
    }
    return redirect(decodeURIComponent(pathname.slice(1)), env, ctx)
  },
} satisfies ExportedHandler<Env>
```

(`redirect` y `countScan` quedan igual.)

- [ ] **Step 8: Crear `worker/.dev.vars.example`**

```
# Copiar a .dev.vars para `corepack yarn workspace qr-forge-worker dev`.
# Permite abrir http://localhost:8787/admin sin Access. Nunca cargarlo como secret en producción.
ADMIN_DEV_BYPASS=1
```

- [ ] **Step 9: Correr tests y typecheck**

Run: `corepack yarn workspace qr-forge-worker test`
Expected: 19 passed.

Run: `corepack yarn workspace qr-forge-worker typecheck`
Expected: sin errores.

- [ ] **Step 10: Commit**

```bash
git add worker
git commit -m "feat(worker): proteger admin y API con Cloudflare Access; página de privacidad"
```

---

### Task 4: Panel del admin

**Files:**
- Modify: `worker/src/admin.html` (reemplazo completo)

**Interfaces:**
- Consumes: API de Task 2 (mismo origen, `/api/...`), generador público `https://natanyona.github.io/qr-forge/?url=` (Task 5)

- [ ] **Step 1: Escribir `worker/src/admin.html`**

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>qr-forge · admin</title>
<style>
  :root{--bg:#07090a;--panel:#0d1112;--line:#1c2426;--fg:#c9d1cc;--dim:#6b7a74;--acc:#36f5a0;--warn:#f5c036}
  *{box-sizing:border-box}
  body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:14px/1.5 ui-monospace,"JetBrains Mono",monospace}
  main{max-width:960px;margin:0 auto;display:grid;gap:16px}
  h1{margin:0;font-size:1.1rem;color:var(--acc)}
  h2{margin:0 0 8px;font-size:.95rem;color:var(--acc)}
  section{background:var(--panel);border:1px solid var(--line);padding:16px;min-width:0}
  input,button{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);padding:6px 10px}
  button{cursor:pointer}
  button:hover,button:focus-visible{border-color:var(--acc);color:var(--acc)}
  #create{display:grid;gap:8px;grid-template-columns:1fr 1fr 2fr auto}
  @media (max-width:640px){#create{grid-template-columns:1fr}}
  .scroll{overflow-x:auto}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}
  tbody tr{cursor:pointer}
  tbody tr:hover td{background:#10181a}
  .dim{color:var(--dim)}
  .paused{color:var(--warn)}
  .row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .bars{display:flex;align-items:flex-end;gap:2px;height:120px;border-bottom:1px solid var(--line)}
  .bars div{flex:1;min-height:1px;background:var(--acc)}
  #msg{min-height:1.5em;margin:0;color:var(--warn)}
</style>
</head>
<body>
<main>
  <h1>&gt; qr-forge admin_</h1>
  <p id="msg" role="status"></p>
  <section>
    <h2>nuevo link</h2>
    <form id="create">
      <input id="f-name" placeholder="nombre" aria-label="nombre" required maxlength="100">
      <input id="f-slug" placeholder="slug" aria-label="slug" required pattern="[a-z0-9\-]{1,64}">
      <input id="f-dest" type="url" placeholder="https://destino" aria-label="destino" required>
      <button>crear</button>
    </form>
  </section>
  <section class="scroll">
    <h2>links</h2>
    <table>
      <thead><tr><th>nombre</th><th>url corta</th><th>escaneos</th><th>estado</th></tr></thead>
      <tbody id="links"></tbody>
    </table>
  </section>
  <section id="detail" hidden></section>
</main>
<script>
const GENERATOR = 'https://natanyona.github.io/qr-forge/'
const $ = (sel) => document.querySelector(sel)
const shortUrl = (slug) => `${location.origin}/${slug}`

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value)
    else el[key] = value
  }
  el.append(...children) // textContent/append: nunca innerHTML con datos
  return el
}

const say = (text) => { $('#msg').textContent = text }

async function run(fn) {
  try { say(''); await fn() } catch (err) { say(`error: ${err.message}`) }
}

async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status} (¿sesión vencida? recargá)`)
  return data
}

let selected = null

async function loadLinks() {
  const { links } = await api('GET', '/links')
  $('#links').replaceChildren(...links.map((link) => h('tr', { onclick: () => run(() => showDetail(link)) },
    h('td', {}, link.name),
    h('td', { className: 'dim' }, shortUrl(link.slug)),
    h('td', {}, String(link.total)),
    h('td', { className: link.paused ? 'paused' : '' }, link.paused ? 'pausado' : 'activo'),
  )))
  const fresh = selected && links.find((l) => l.slug === selected.slug)
  if (fresh) await showDetail(fresh)
}

async function showDetail(link) {
  selected = link
  const { scans } = await api('GET', `/links/${link.slug}/scans`)
  const url = shortUrl(link.slug)
  const dest = h('input', { type: 'url', value: link.destination, ariaLabel: 'destino', style: 'flex:1;min-width:14rem' })
  const detail = $('#detail')
  detail.hidden = false
  detail.replaceChildren(
    h('h2', {}, `${link.name} · ${link.total} escaneos`),
    h('div', { className: 'row' },
      h('a', { href: url, target: '_blank', rel: 'noopener', className: 'dim' }, url),
      h('button', { onclick: () => run(async () => { await navigator.clipboard.writeText(url); say('copiado') }) }, 'copiar'),
      h('button', { onclick: () => window.open(`${GENERATOR}?url=${encodeURIComponent(url)}`, '_blank', 'noopener') }, 'generar QR'),
      h('button', { onclick: () => run(async () => {
        await api('PATCH', `/links/${link.slug}`, { paused: !link.paused })
        await loadLinks()
      }) }, link.paused ? 'reactivar' : 'pausar'),
      h('button', { onclick: () => downloadCsv(link.slug, scans) }, 'exportar CSV'),
    ),
    h('div', { className: 'row', style: 'margin-top:8px' },
      dest,
      h('button', { onclick: () => run(async () => {
        await api('PATCH', `/links/${link.slug}`, { destination: dest.value })
        await loadLinks()
        say('destino actualizado')
      }) }, 'guardar destino'),
    ),
    h('h2', { style: 'margin-top:16px' }, 'por día · últimos 30'),
    bars(byDay(scans)),
    h('h2', { style: 'margin-top:16px' }, 'por hora del día · tu zona horaria'),
    bars(byHourOfDay(scans)),
  )
}

// `hour` viene en UTC ('YYYY-MM-DDTHH'); el agrupado se hace en la zona horaria del navegador.
const toDate = (hour) => new Date(`${hour}:00:00Z`)
const pad = (n) => String(n).padStart(2, '0')
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function byDay(scans) {
  const totals = new Map()
  for (const s of scans) {
    const key = localDay(toDate(s.hour))
    totals.set(key, (totals.get(key) || 0) + s.count)
  }
  const days = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push([localDay(d), totals.get(localDay(d)) || 0])
  }
  return days
}

function byHourOfDay(scans) {
  const counts = Array(24).fill(0)
  for (const s of scans) counts[toDate(s.hour).getHours()] += s.count
  return counts.map((count, hour) => [`${pad(hour)}h`, count])
}

function bars(pairs) {
  const max = Math.max(1, ...pairs.map(([, count]) => count))
  return h('div', { className: 'bars' },
    ...pairs.map(([label, count]) => h('div', { title: `${label}: ${count}`, style: `height:${(count / max) * 100}%` })))
}

function downloadCsv(slug, scans) {
  const csv = ['hour,count', ...scans.map((s) => `${s.hour},${s.count}`)].join('\n')
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `${slug}-escaneos.csv` })
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 0)
}

const slugify = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64)

let slugTouched = false
$('#f-slug').addEventListener('input', () => { slugTouched = true })
$('#f-name').addEventListener('input', () => { if (!slugTouched) $('#f-slug').value = slugify($('#f-name').value) })

$('#create').addEventListener('submit', (event) => {
  event.preventDefault()
  run(async () => {
    await api('POST', '/links', { name: $('#f-name').value, slug: $('#f-slug').value, destination: $('#f-dest').value })
    $('#create').reset()
    slugTouched = false
    await loadLinks()
    say('link creado')
  })
})

run(loadLinks)
</script>
</body>
</html>
```

- [ ] **Step 2: Probar el panel localmente**

```bash
cp worker/.dev.vars.example worker/.dev.vars
corepack yarn workspace qr-forge-worker wrangler d1 migrations apply qr-forge --local
corepack yarn workspace qr-forge-worker dev
```

Abrir `http://localhost:8787/admin` en el navegador del panel (browser pane) y verificar:
1. Crear el link "Café Centro" → el slug se sugiere como `cafe-centro`; aparece en la tabla con 0 escaneos.
2. Abrir `http://localhost:8787/cafe-centro` → redirige al destino; al recargar el admin, el total es 1.
3. En el detalle: la barra de hoy y la de la hora actual tienen altura; "pausar" → `/cafe-centro` muestra la página de pausado; "reactivar" vuelve a redirigir.
4. "guardar destino" con `javascript:alert(1)` → el navegador no lo deja enviar o la API responde `error: invalid destination`.
5. "exportar CSV" descarga `cafe-centro-escaneos.csv` con cabecera `hour,count`.
6. Con ancho de 375px, el formulario queda en una columna y no hay scroll horizontal en la página.
7. Consola sin errores.

- [ ] **Step 3: Correr los tests (no deberían cambiar)**

Run: `corepack yarn workspace qr-forge-worker test`
Expected: 19 passed.

- [ ] **Step 4: Commit**

```bash
git add worker/src/admin.html
git commit -m "feat(worker): panel del admin con estadísticas por día y por hora"
```

---

### Task 5: El generador público acepta `?url=`

**Files:**
- Modify: `src/App.tsx:57`

**Interfaces:**
- Produces: `https://natanyona.github.io/qr-forge/?url=<url>` abre el generador con `contentType: 'url'` y `text: <url>`

- [ ] **Step 1: Inicializar el estado desde la query string**

En `src/App.tsx`, reemplazar:

```tsx
  const [settings, setSettings] = useState<QrSettings>(DEFAULT_SETTINGS)
```

por:

```tsx
  // ?url=… precarga el contenido (lo usa el botón "generar QR" del panel de admin).
  const [settings, setSettings] = useState<QrSettings>(() => {
    const url = new URLSearchParams(location.search).get('url')
    return url ? { ...DEFAULT_SETTINGS, contentType: 'url', text: url } : DEFAULT_SETTINGS
  })
```

- [ ] **Step 2: Verificar**

Run: `corepack yarn build` y `corepack yarn lint`
Expected: sin errores.

Levantar el dev server con `preview_start` y abrir `/?url=https%3A%2F%2Fgo.example%2Fcafe`: el campo URL muestra `https://go.example/cafe` y el QR lo codifica (usar "validar escaneo" del propio generador). Sin `?url=`, el valor por defecto sigue siendo `https://github.com`.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: precargar la URL del generador desde ?url="
```

---

### Task 6: Deploy automático + guía de configuración

**Files:**
- Create: `.github/workflows/deploy-worker.yml`, `worker/README.md`

- [ ] **Step 1: Crear `.github/workflows/deploy-worker.yml`**

```yaml
name: Deploy worker

on:
  push:
    branches: [main]
    paths: ['worker/**']
  workflow_dispatch:

concurrency:
  group: worker
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      - uses: actions/checkout@v4
      - run: corepack enable
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: yarn
      - run: yarn install --immutable
      - run: yarn workspace qr-forge-worker typecheck
      - run: yarn workspace qr-forge-worker test
      - run: yarn workspace qr-forge-worker wrangler d1 migrations apply qr-forge --remote
      - run: yarn workspace qr-forge-worker deploy
```

- [ ] **Step 2: Crear `worker/README.md`**

````markdown
# qr-forge-worker

Redirecciones cortas con contador de escaneos (solo slug + hora) y panel de admin.
Diseño: `docs/superpowers/specs/2026-09-26-qr-avanzado-design.md`.

## Configuración inicial (una vez)

1. **Dominio:** comprarlo y agregarlo a Cloudflare (cambiar los nameservers a los que indique Cloudflare).
2. **Login de wrangler:** `corepack yarn workspace qr-forge-worker wrangler login`
3. **Base D1:** `corepack yarn workspace qr-forge-worker wrangler d1 create qr-forge`
   y copiar el `database_id` que imprime a `worker/wrangler.toml`.
4. **Dominio del Worker:** agregar a `worker/wrangler.toml`
   ```toml
   routes = [{ pattern = "go.<dominio>", custom_domain = true }]
   ```
5. **Cloudflare Access** (Zero Trust → Access → Applications → Add → Self-hosted):
   - Dominio `go.<dominio>`, rutas `admin` y `api/*` (dos entradas en la misma app).
   - Política: *Allow*, *Include → Emails →* tu email.
   - Copiar el **Application Audience (AUD) tag**.
6. **Secrets del Worker:**
   ```bash
   corepack yarn workspace qr-forge-worker wrangler secret put ACCESS_TEAM_DOMAIN   # https://<equipo>.cloudflareaccess.com
   corepack yarn workspace qr-forge-worker wrangler secret put ACCESS_AUD
   corepack yarn workspace qr-forge-worker wrangler secret put ADMIN_EMAIL
   ```
7. **Secrets de GitHub** (para `.github/workflows/deploy-worker.yml`):
   - Crear un token en Cloudflare (My Profile → API Tokens → plantilla *Edit Cloudflare Workers*, más permiso *D1: Edit*).
   - `gh secret set CLOUDFLARE_API_TOKEN` y `gh secret set CLOUDFLARE_ACCOUNT_ID`.
8. Push a `main` con cambios en `worker/` → tests, migraciones y deploy automáticos.

## Desarrollo local

```bash
cp worker/.dev.vars.example worker/.dev.vars
corepack yarn workspace qr-forge-worker wrangler d1 migrations apply qr-forge --local
corepack yarn workspace qr-forge-worker dev      # http://localhost:8787/admin
corepack yarn workspace qr-forge-worker test
```

## Verificación después del primer deploy

- `https://go.<dominio>/admin` pide el código de Access por email y, con tu email, abre el panel.
- `curl -i https://go.<dominio>/api/links` (sin sesión) → redirección al login de Access o 403.
- Crear un link, escanearlo con el celular y ver el contador en 1.
````

- [ ] **Step 3: Verificar que el workflow es YAML válido**

Run: `corepack yarn dlx js-yaml .github/workflows/deploy-worker.yml`
Expected: imprime el YAML parseado sin errores.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-worker.yml worker/README.md
git commit -m "ci: deploy automático del worker + guía de configuración"
```

---

## Fuera de este plan (pasos del usuario)

Los pasos 1 a 7 de `worker/README.md` necesitan la cuenta de Cloudflare, comprar el dominio y crear credenciales: los hace el dueño del proyecto. Hasta que estén, el workflow de deploy va a fallar en `main`, así que conviene mergear la rama recién cuando estén configurados los secrets.
