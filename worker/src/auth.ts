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
