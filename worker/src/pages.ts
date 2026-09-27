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
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
    },
  })
}
