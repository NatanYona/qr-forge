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

/** CSRF: rechaza cross-site y formularios (que no pueden fijar content-type application/json). */
function isSameOriginJson(request: Request): boolean {
  const contentType = request.headers.get('content-type')
  const secFetchSite = request.headers.get('sec-fetch-site')
  return !!contentType?.startsWith('application/json') && (secFetchSite === null || secFetchSite === 'same-origin')
}

async function readBody(request: Request): Promise<Body | null> {
  const body = await request.json().catch(() => null)
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Body) : null
}

/** Rutas de /api/*. La autorización se verifica antes de llamar a esta función. */
export async function handleApi(request: Request, env: Env): Promise<Response> {
  const { method } = request
  if (method !== 'GET' && !isSameOriginJson(request)) return json({ error: 'forbidden' }, 403)
  const [, resource, slug, sub] = new URL(request.url).pathname.split('/').filter(Boolean)
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
