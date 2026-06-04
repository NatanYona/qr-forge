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
- **Escaneabilidad:** aviso automático de contraste bajo, corrección de errores
  forzada a nivel alto (H) al añadir un logo, y un **validador que decodifica el QR
  en el navegador** para confirmar que se lee (incluso a tamaño pequeño).
- **Lector multi-QR:** sube una imagen y extrae **todos** los códigos QR que
  contenga, con su tipo (URL / Wi-Fi / texto). 100% local.
- **Exportación:** PNG y SVG (vectorial, listo para imprimir) y copiar al
  portapapeles.

## Stack

- [React](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Vite](https://vite.dev) (build y dev server)
- [Tailwind CSS v4](https://tailwindcss.com)
- [`qr-code-styling`](https://github.com/kozakdenys/qr-code-styling) para el
  renderizado del QR
- [`jsQR`](https://github.com/cozmo/jsQR) (validación de escaneo) y
  [`zxing-wasm`](https://github.com/Sec-ant/zxing-wasm) (lectura multi-QR), ambos
  en el cliente

## Desarrollo

El proyecto usa **Yarn 4** gestionado con [Corepack](https://github.com/nodejs/corepack)
(incluido con Node ≥ 16). Actívalo una vez con `corepack enable` y la versión correcta
de Yarn se usará automáticamente.

```bash
yarn install
yarn dev      # servidor local en http://localhost:5173
yarn build    # genera la versión de producción en dist/
yarn preview  # sirve la build de producción
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
