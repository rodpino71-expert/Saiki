# Diseño: Pantalla de activación de licencia en la app Electron de Saiki

Sub-proyecto: 3 de 3 (pantalla de activación dentro de la app Electron), referido en `2026-08-08-saiki-license-backend-design.md` (sub-proyecto 1, backend de licencias — implementado y desplegado) y `2026-08-13-saiki-landing-page-design.md` (sub-proyecto 2, landing/checkout — implementado y desplegado).

## Contexto y objetivo

Saiki (`main.js`, `preload.js`, `index.html`) hoy se abre sin ningún control de licencia. El backend de activación/validación (`/api/activate`, `/api/validate` en `https://saiki-resilience.netlify.app`) ya está en producción, probado de punta a punta con una compra real de prueba. Falta la última pieza: que la app misma pida y verifique la licencia antes de dejar usarla.

El comportamiento de fondo (almacenamiento, revalidación cada 7 días, margen de gracia offline de 14 días, manejo de revocación, casos borde) **ya está definido y aprobado** en las secciones "Flujo de datos en el cliente" y "Casos borde" de `2026-08-08-saiki-license-backend-design.md` (líneas 86–102). Este documento no lo repite en detalle — lo referencia como contrato fijo — y se enfoca en la parte que faltaba: la UI y su integración con `main.js`/`preload.js`/`index.html`.

**Requisito explícito del usuario:** la pantalla debe ser mínima. Sin onboarding, sin pedir correo. Un campo de texto con placeholder **"Coloca tu clave aquí"** y un botón **"Activar"**. Nada más.

## Arquitectura

Igual que el resto de la app (`taskStorage`, `fileAPI`, `saikiDominio` en `preload.js`), se agrega un puente `licenseAPI` expuesto vía `contextBridge`, respaldado por handlers `ipcMain.handle(...)` en `main.js`. La verificación de firma (Ed25519, con la llave pública embebida) y el llamado HTTP al backend de Netlify ocurren en el proceso principal (`main.js`), no en el renderer — mismo patrón que ya usa el motor de dominio.

```
index.html (renderer)          preload.js               main.js (proceso principal)         Netlify Functions
     |                              |                             |                                  |
     |-- licenseAPI.checkActivation()------------------------------> lee userData/activation.json     |
     |                                                              verifica firma localmente          |
     |<----------------------------------------------------------- { activated, reason? } -------------|
     |
     | (si no activada: muestra el gate)
     |-- licenseAPI.activate(licenseKey) ---------------------------> POST /api/activate -------------->|
     |<----------------------------------------------------------- { ok, token } o { ok:false, reason } -|
     |                                                              si ok: guarda activation.json        |
```

No hay ventana ni archivo HTML separado — el gate vive **dentro de `index.html`**, como un overlay de pantalla completa (mismo patrón que los modales existentes: `profileModal`, `resetWarningOverlay`, etc., mostrados/ocultados con `classList`). Evita duplicar el CSS de temas y el chrome de ventana en un segundo archivo.

## Componentes

### `main.js` — nuevas piezas

- **Constante embebida:** llave pública Ed25519 (no secreta) generada hoy:
  ```
  -----BEGIN PUBLIC KEY-----
  MCowBQYDK2VwAyEA9LgqQ4260n/MbZLTesKxz75O0TQcijn9jleVnuhITeM=
  -----END PUBLIC KEY-----
  ```
- **Constante:** `LICENSE_API_BASE = 'https://saiki-resilience.netlify.app'`.
- **Archivo local:** `path.join(app.getPath('userData'), 'activation.json')`, con forma `{ token, instance_id, device_id, issued_at }` (igual que ya define el doc del backend).
- **`device_id`:** UUID generado con `crypto.randomUUID()` la primera vez que se necesita (no existe antes de la primera activación); se guarda como parte de `activation.json`.
- **Funciones de verificación:** reutilizan la misma lógica de `verifyToken`/`normalizePem` ya escrita y probada en `web/netlify/functions/lib/token.js` (Ed25519 con Node `crypto`, tolerante a PEM con saltos de línea aplanados). Se copia esa función a `main.js` — no hay forma de compartir código entre `web/` (deploy de Netlify) y la raíz (app Electron) sin un paso de build adicional, y el archivo es de ~15 líneas; duplicarlo es más simple que introducir un mecanismo de compartición para un solo caso.
- **Handlers IPC nuevos:**
  - `ipcMain.handle('license:check-activation')` → lee `activation.json`. Si no existe, está corrupto (JSON inválido o le faltan campos), o la firma no verifica con la llave pública embebida → `{ activated: false }`. Si verifica y `issued_at` tiene menos de 7 días → `{ activated: true }`. Si tiene 7+ días → intenta `POST /api/validate` en segundo plano (no bloquea la respuesta): éxito reemplaza `activation.json` con el token nuevo; fallo por red se ignora si no han pasado 14 días desde el `issued_at` **original guardado**; `reason: "revoked"` borra `activation.json`. Mientras se resuelve esa llamada de fondo, la respuesta inmediata a `checkActivation` es `{ activated: true }` si sigue dentro del margen de 14 días, para no bloquear el arranque esperando la red.
  - `ipcMain.handle('license:activate', (event, licenseKey))` → genera/reutiliza `device_id`, llama `POST {LICENSE_API_BASE}/api/activate` con `{ license_key: licenseKey, device_id }`. Si `ok:true`, escribe `activation.json` y responde `{ ok: true }`. Si `ok:false`, responde `{ ok: false, reason }` tal cual. Si la llamada de red falla (timeout, DNS, etc.), responde `{ ok: false, reason: 'service_unavailable' }`.

### `preload.js` — nuevo bridge

```js
contextBridge.exposeInMainWorld('licenseAPI', {
  checkActivation: () => ipcRenderer.invoke('license:check-activation'),
  activate: (licenseKey) => ipcRenderer.invoke('license:activate', licenseKey),
});
```

### `index.html` — nuevo overlay + arranque condicionado

- Nuevo bloque `<div id="activationGate" class="activation-gate">` con: logo/kanji de Saiki (reutiliza estilos existentes), input `<input id="activationKeyInput" placeholder="Coloca tu clave aquí">`, botón `<button id="activationSubmitBtn">Activar</button>`, y un `<p id="activationError">` vacío para mensajes de error. `z-index` por encima de todo, `position: fixed; inset: 0`, fondo sólido (no transparente) — así nada de la app real es visible detrás.
- **Arranque:** el script principal, antes de llamar a la inicialización actual (`init()` / carga de tareas / `saikiDominio`, etc.), llama a `window.licenseAPI.checkActivation()`.
  - `{ activated: true }` → oculta `#activationGate` (o ni se muestra) y sigue el flujo normal exactamente como hoy.
  - `{ activated: false }` → muestra `#activationGate`, **no** ejecuta el resto de `init()` (no carga tareas, no arma el tablero) hasta activar con éxito.
- **Envío del formulario** (botón o Enter en el input):
  1. Deshabilita el botón y cambia su texto a `"Activando..."`.
  2. Llama a `window.licenseAPI.activate(valor_del_input)`.
  3. Éxito (`ok:true`): oculta `#activationGate`, llama a la función de inicialización normal de la app (la misma que hoy corre al cargar).
  4. Error: reactiva el botón, restaura el texto a `"Activar"`, y muestra en `#activationError` un mensaje corto según `reason`:
     - `invalid_key` → "Esa clave no es válida. Revisa que esté bien copiada."
     - `already_activated` → "Esta clave ya está activada en otro equipo. Escríbenos a rodpino71@gmail.com si necesitas ayuda."
     - `service_unavailable` → "Sin conexión a internet. Verifica tu red e inténtalo de nuevo."
     - `bad_request` o cualquier otro valor no reconocido → "Algo salió mal. Inténtalo de nuevo."
  5. El campo no se limpia en error (para que el usuario pueda corregir sin volver a escribir todo).

## Manejo de errores y casos borde

Todos los casos borde (reinstalación, equipo nuevo con cupo agotado, sin internet en primera activación, no rate-limiting propio) ya están definidos en el documento del backend y no cambian aquí — la única adición de UI es el mensaje de `already_activated` con el correo de soporte, ya cubierto arriba.

## Testing

- **Unitario (Vitest, en la raíz del proyecto, no en `web/`):** la lógica pura de verificación de token (`normalizePem`/verify duplicada en `main.js`) y el cálculo de "¿sigue dentro del margen de 7/14 días?" se extraen a funciones puras testeables sin depender de Electron (`app.getPath`, `BrowserWindow`), siguiendo el mismo patrón que `src/dominio`. Los handlers de `ipcMain` en sí (que si dependen de Electron) no se testean unitariamente — se verifican por inspección manual, igual que el resto de `main.js` hoy (no tiene tests de IPC existentes).
- **Manual:** activar con la license_key real de prueba ya emitida hoy (`4B8FC7A5-B841-424F-B502-A53277F3D0AB`, actualmente desactivada) usando `npm start` en un entorno con RAM disponible — no se puede correr Electron desde esta sesión de agente por las limitaciones de memoria ya conocidas (ver Gotchas del plan de landing page). Este paso queda para el usuario, con guía paso a paso del agente.

## Fuera de alcance (explícitamente, YAGNI)

- Autoservicio de gestión de dispositivos (desactivar/transferir licencia desde la app) — ya excluido en el doc del backend.
- Pantalla de "olvidé mi clave" o reenvío de email — Lemon Squeezy ya entrega la clave por correo en la compra; no se duplica esa función.
- Cualquier UI de "modo demo" o exploración sin activar — explícitamente descartado por el usuario en esta sesión.
