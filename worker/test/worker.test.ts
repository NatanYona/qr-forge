import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import worker, { countScan } from '../src/index'

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
