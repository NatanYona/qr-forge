declare global {
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

export {}
