# QR Forge

Generador de códigos QR **libre, gratuito y privado**. Sin marcas de agua, sin
límites y sin anuncios. Todo se genera **en tu navegador**: el contenido del QR
nunca se sube a ningún servidor.

> Inspirado en lo cansino que es encontrar generadores de QR detrás de un
> *paywall*. Este no lo tiene.

## Características

- **Tipos de contenido:** URL / texto y redes **Wi-Fi** (SSID + contraseña).
- **Personalización:** color del código y del fondo, paletas, forma de los
  puntos y de las esquinas, logo en el centro y margen.
- **Escaneabilidad:** aviso automático de contraste bajo y corrección de errores
  forzada a nivel alto (H) cuando añades un logo.
- **Exportación:** PNG y SVG (vectorial, listo para imprimir) y copiar al
  portapapeles.

## Stack

- [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vite.dev) (build y dev server)
- [Tailwind CSS v4](https://tailwindcss.com)
- [`qr-code-styling`](https://github.com/kozakdenys/qr-code-styling) para el
  renderizado del QR

## Desarrollo

```bash
npm install
npm run dev      # servidor local en http://localhost:5173
npm run build    # genera la versión de producción en dist/
npm run preview  # sirve la build de producción
```

## Despliegue

El push a `main` dispara el workflow de GitHub Actions
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) que compila y
publica en **GitHub Pages**. Solo hay que activar Pages una vez:

1. *Settings → Pages → Build and deployment → Source: **GitHub Actions***.

`vite.config.ts` usa `base: './'`, así que funciona en cualquier subruta de
Pages sin tocar nada.

## Licencia

MIT.
