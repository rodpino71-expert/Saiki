# 再起 Saiki

Planificador de carga cognitiva y resiliencia personal. Aplicación de escritorio (Electron) para Linux, macOS y Windows.

## Manual de usuario

[Manual_de_Usuario_Saiki.md](./Manual_de_Usuario_Saiki.md) · [versión HTML autocontenida](./Manual_de_Usuario_Saiki.html)

## Licencia

Software comercial. El código fuente es visible por transparencia, pero **todos los derechos están reservados** — ver [LICENSE](./LICENSE). Uso de la aplicación compilada requiere una licencia paga, disponible en [saiki-resilience.netlify.app](https://saiki-resilience.netlify.app).

## Estructura del repositorio

- `main.js`, `preload.js`, `index.html` — aplicación Electron.
- `src/dominio/` — motor de cálculo (carga cognitiva, planificación, puntaje).
- `src/capa_humana/` — contenido y arquetipos.
- `src/licencia/` — verificación de token de activación (Ed25519).
- `web/` — landing page y backend de licencias (Netlify Functions), integrado con Lemon Squeezy.

## Desarrollo

```bash
npm install
npm run build:dominio   # compila el motor de dominio (TypeScript -> dist/)
npm start                # ejecuta la app
npm test                 # corre la suite de tests (Vitest)
```

## Build de instaladores

Los instaladores (`.deb`, `.AppImage`, `.dmg`, `.exe`) se generan automáticamente vía GitHub Actions al crear un tag `v*`, y se publican como [Release](../../releases). No requiere build local.
