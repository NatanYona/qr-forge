# qr-forge-worker

Redirecciones cortas con contador de escaneos (solo slug + hora) y panel de admin.
Diseño: `docs/superpowers/specs/2026-09-26-qr-avanzado-design.md`.

## Configuración inicial (una vez)

> Hacer los pasos 1–7 **antes** de mergear a `main`: el primer push que toque `worker/` dispara el
> workflow de deploy, y sin esta configuración va a fallar.

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
   - En la configuración de la app, poner la cookie de sesión (**SameSite**) en `Lax` (o `Strict`).
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
