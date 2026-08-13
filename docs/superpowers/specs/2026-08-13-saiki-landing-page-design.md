# Diseño: Landing page y checkout de Saiki

Fecha: 2026-08-13
Estado: aprobado por el usuario (pendiente de implementación)
Sub-proyecto: 2 de 3 (landing page/checkout en Netlify), referido en `2026-08-08-saiki-license-backend-design.md` (sub-proyecto 1, backend de licencias — aprobado, aún no implementado). El sub-proyecto 3 (pantalla de activación dentro de la app Electron) sigue sin diseñar.

## Contexto y objetivo

Saiki (ver `package.json`, `main.js`) es una app de escritorio Electron ya funcional, sin publicar aún. El objetivo de este sub-proyecto es crear la landing page pública que permite comprarla: presentar la app, cobrar **USD 10.90 (pago único, licencia de por vida)** vía Lemon Squeezy, y entregar el instalador + `license_key` al comprador, todo en infraestructura gratuita.

Este sub-proyecto **no** incluye las funciones serverless de validación de licencia (`/api/activate`, `/api/validate`) definidas en el sub-proyecto 1 — el botón de compra de la landing lleva directo al checkout alojado por Lemon Squeezy, que no depende de esas funciones.

## Decisión de estructura: un solo repo

Todo vive en el repo `saiki` existente, sin crear un repo nuevo — evita duplicar infraestructura y administración por algo que no lo justifica.

```
saiki/
├── main.js, preload.js, index.html, ...   (app Electron, sin cambios)
├── web/                                     (nuevo: landing page)
│   ├── index.html
│   ├── styles.css
│   ├── img/
│   │   ├── logo.png                         (a partir de "losaiki sin fondo1.png")
│   │   └── screenshot-1.png, screenshot-2.png, ... (generadas corriendo la app)
│   └── netlify.toml                         (o netlify.toml en la raíz con base="web")
```

Netlify se configura con **base directory = `web`**, por lo que solo construye/sirve esa carpeta; el resto del repo (código de la app Electron) no forma parte del sitio desplegado.

## Contenido de la landing (una sola página, español)

1. **Hero**: logo, tagline, precio y botón "Comprar Saiki — USD 10.90 (pago único)".
2. **Problema/solución**: sobrecarga cognitiva y cómo Saiki ayuda a manejarla.
3. **Features**: tablero de tareas con límite de capacidad, auditoría mensual, cierre semestral, historial del camino, reprogramar/cambiar prioridad de tareas.
4. **Los 5 Estados de Resiliencia**: sección dedicada que explica el marco conceptual detrás de los 5 temas de color de Saiki (Optimismo, Tranquilidad, Certeza, Fortaleza, Neutralidad), cada uno con su definición en segunda persona provista por el autor. Un pequeño "dot" de color por card asocia cada estado a su tema visual real en la app.
5. **Capturas de pantalla**: 3 capturas reales de la app (aportadas por el usuario en `imagenes de saiki/`), elegidas para mostrar variedad de vista (tablero/calendario) y tema (claro/oscuro).
6. **Precio/CTA final**: repite el botón de compra.
7. **FAQ**: plataformas soportadas (Windows, macOS, Linux — .deb/AppImage), 1 dispositivo por licencia, cómo pedir soporte.
8. **Footer**: contacto (correo del autor).

Sin build step: HTML/CSS/JS plano, sin frameworks ni dependencias nuevas en `node_modules` — evita cargar el toolchain de build en una máquina con 3.5GB de RAM.

## Integración con Lemon Squeezy

- El botón "Comprar Saiki" enlaza directo al checkout hospedado por Lemon Squeezy (overlay o link, según lo que ofrezca el producto) — no requiere backend propio para este flujo.
- **Entrega del instalador**: se adjunta como archivo descargable directo al producto en Lemon Squeezy (feature nativa de "file delivery"). El comprador recibe el link de descarga junto con la `license_key` en el correo de confirmación de compra — sin hosting propio.
- Licencia: `activation_limit: 1` por licencia (ya definido en el diseño del backend, sub-proyecto 1).

## Pasos de configuración externa (a realizar durante la implementación, guiados)

**Lemon Squeezy** (cuenta nueva):
1. Crear cuenta y Store.
2. Crear producto "Saiki", precio USD 10.90, pago único.
3. Activar License Keys, `activation_limit: 1`.
4. Adjuntar al menos un instalador como archivo descargable del producto (mínimo viable: el `.deb`/`.AppImage` de Linux generado con `npm run dist`; agregar `.dmg`/`.exe` cuando estén disponibles).
5. Configurar el correo de confirmación de compra para incluir `license_key` + link de descarga (comportamiento por defecto de LS al adjuntar archivos).
6. Obtener el link/embed de checkout del producto para el botón de la landing.

**GitHub**:
1. El usuario crea el repo `saiki` como **privado** en github.com/new (vacío, sin README).
2. Se agrega como remote y se hace push del historial local existente.

**Netlify**:
1. Conectar el repo `saiki` (privado) a un nuevo sitio en Netlify.
2. Configurar base directory = `web`.
3. Elegir nombre de sitio (ej. `saiki` → `https://saiki.netlify.app`), gratis, sin dominio propio requerido — mismo paso que ya preveía el diseño del backend para cuando se implemente.

## Fuera de alcance de este sub-proyecto

- Funciones serverless `/api/activate` y `/api/validate` (sub-proyecto 1, ya diseñado, no implementado).
- Pantalla de activación dentro de la app Electron (sub-proyecto 3, sin diseñar).
- Pipeline de build/firma de instaladores para macOS y Windows (certificados de firma de código, notarización, etc.) — para el lanzamiento inicial alcanza con adjuntar el instalador de Linux; los demás se agregan cuando existan.
- Dominio propio (se usa el subdominio gratuito `*.netlify.app`).
- Analítica/tracking de la landing.

## Verificación

- Cargar `web/index.html` localmente en el navegador antes de desplegar.
- Probar el flujo de compra completo con el *test mode* de Lemon Squeezy (checkout, correo con `license_key` + link de descarga) antes de anunciar el lanzamiento con precio real.
