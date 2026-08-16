# 再起 Saiki

Planificador de carga cognitiva y resiliencia personal. Aplicación de escritorio (Electron) para Linux, macOS y Windows.

## Descarga

Instaladores gratuitos (`.deb`, `.AppImage`, `.dmg`, `.exe`) en [GitHub Releases](../../releases/latest).

## Manual de usuario

[web/manual.html](./web/manual.html)

## Licencia

Software gratuito, de uso personal únicamente. El código fuente es visible por transparencia, pero **todos los derechos están reservados** — ver [LICENSE](./LICENSE). No está permitido modificarlo, comercializarlo, revenderlo ni redistribuirlo.

## Estructura del repositorio

- `main.js`, `preload.js`, `index.html` — aplicación Electron.
- `src/dominio/` — motor de cálculo (carga cognitiva, planificación, puntaje).
- `src/capa_humana/` — contenido y arquetipos.
- `src/licencia/` — verificación de token de activación (Ed25519).
- `web/` — landing page y manual de usuario (Netlify).

## Desarrollo

```bash
npm install
npm run build:dominio   # compila el motor de dominio (TypeScript -> dist/)
npm start                # ejecuta la app
npm test                 # corre la suite de tests (Vitest)
```

## Build de instaladores

Los instaladores (`.deb`, `.AppImage`, `.dmg`, `.exe`) se generan automáticamente vía GitHub Actions al crear un tag `v*`, y se publican como [Release](../../releases). No requiere build local.
