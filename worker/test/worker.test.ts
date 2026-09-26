import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import worker, { countScan } from '../src/index'
import { handleApi } from '../src/api'

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>

async function get(path: string, init: RequestInit<IncomingRequestCfProperties> = {}, testEnv: Env = env) {
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

describe('csrf', () => {
  it('POST con content-type text/plain: 403 y no crea la fila', async () => {
    const res = await handleApi(
      new Request('https://go.test/api/links', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ slug: 'csrf1', name: 'x', destination: 'https://example.com' }),
      }),
      env,
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
    const row = await env.DB.prepare('SELECT 1 FROM links WHERE slug = ?').bind('csrf1').first()
    expect(row).toBeNull()
  })

  it('POST con sec-fetch-site cross-site: 403', async () => {
    const res = await handleApi(
      new Request('https://go.test/api/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' },
        body: JSON.stringify({ slug: 'csrf2', name: 'x', destination: 'https://example.com' }),
      }),
      env,
    )
    expect(res.status).toBe(403)
  })
})

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
