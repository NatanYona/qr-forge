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
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 })
    let slug: string
    try {
      slug = decodeURIComponent(pathname.slice(1))
    } catch (err) {
      if (err instanceof URIError) return html(notFoundPage, 404)
      throw err
    }
    return redirect(slug, request.method, env, ctx)
  },
} satisfies ExportedHandler<Env>

async function redirect(slug: string, method: string, env: Env, ctx: ExecutionContext) {
  const link = await env.DB.prepare('SELECT destination, paused FROM links WHERE slug = ?')
    .bind(slug)
    .first<{ destination: string; paused: number }>()
  if (!link) return html(notFoundPage, 404)
  if (link.paused) return html(pausedPage)
  // Responder primero; el contador se escribe después y un fallo no afecta la redirección.
  if (method === 'GET') ctx.waitUntil(countScan(env.DB, slug).catch(() => {}))
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
