# Diseño: Backend de validación de licencias de Saiki

Fecha: 2026-08-08
Estado: aprobado por el usuario (pendiente de implementación)
Sub-proyecto: 1 de 3 (backend de licencias). Los otros dos —landing page/checkout en Netlify y pantalla de activación dentro de la app Electron— se diseñarán por separado, pero este documento define el contrato (`/api/activate`, `/api/validate`) que ambos deben respetar.

## Contexto y objetivo

Saiki es una app de escritorio Electron (ver `package.json`, `main.js`) que hoy se distribuye sin ningún control de licencia. El objetivo es cobrar un monto simbólico por Saiki (destinado a la Teletón Chile) a través de Lemon Squeezy, y evitar que la app se use sin haber pagado ese monto — sin que esto le cueste dinero al autor (debe correr en infraestructura gratuita) ni implique un servidor propio que mantener.

Flujo de negocio completo (para contexto; solo el paso 7-8 se diseña en este documento):
1. El usuario entra a la landing de Saiki en Netlify.
2. Pulsa "Comprar Saiki".
3. Lemon Squeezy procesa el pago.
4. Lemon Squeezy genera una `license_key` única y la envía por correo junto con el link de descarga del instalador.
5. El usuario instala Saiki y, al abrirla, ingresa su correo y `license_key`.
6. Saiki consulta el backend propio (**este diseño**).
7. El backend valida la licencia contra la API de Lemon Squeezy (**este diseño**).
8. Si es válida, el dispositivo queda activado y la app habilitada.

## Arquitectura

Dos funciones serverless en Netlify Functions (mismo sitio que la landing page, sin costo adicional), que actúan como proxy delgado hacia la API de "License Keys" de Lemon Squeezy. No hay base de datos propia: Lemon Squeezy es la única fuente de verdad sobre qué licencias existen y cuántos dispositivos tiene activados cada una (vía `activation_limit: 1` en el producto).

```
Comprador          Netlify (estático)      Netlify Functions        Lemon Squeezy
   |                      |                       |                       |
   |-- clic "Comprar" --->|                       |                       |
   |-------------- redirige a checkout de LS ---------------------------->|
   |<----------- LS envía correo con license_key --------------------------|
   |
   | (abre Saiki, ingresa correo + license_key)
   |                                    Saiki --- POST /api/activate ----->|
   |                                      |        (vía Netlify Function)  |
   |                                      |<-- token firmado (Ed25519) ----|
   |                                      guarda token en userData/
   |
   | (aperturas futuras, cada 7 días intenta refrescar)
   |                                    Saiki --- POST /api/validate ----->|
```

Principios:
- El API secret de Lemon Squeezy vive **solo** como variable de entorno en Netlify (`LEMONSQUEEZY_API_KEY`), nunca se distribuye dentro de la app.
- La app Electron nunca llama directo a Lemon Squeezy — siempre pasa por el backend propio.
- El backend nunca llama directo a Lemon Squeezy sin pasar por su API oficial de licencias (`api.lemonsqueezy.com/v1/licenses/*`).
- El token de activación que la app guarda localmente está firmado con una clave privada Ed25519 que solo existe en el backend (`ACTIVATION_SIGNING_PRIVATE_KEY`); la app solo tiene la clave pública correspondiente, embebida como constante, para **verificar** (no puede firmar). Esto evita que alguien edite a mano el archivo local de activación para falsificar un "activado: true" — sin la clave privada no puede producir una firma válida.

## Componentes

### `POST /api/activate`

Se llama una sola vez, cuando el usuario ingresa su correo/`license_key` por primera vez en Saiki.

Entrada:
```json
{ "license_key": "xxxxxxxx-xxxx-...", "device_id": "uuid-generado-localmente-por-la-app" }
```

Lógica:
1. Llama a `POST https://api.lemonsqueezy.com/v1/licenses/activate` con `license_key` e `instance_name: device_id`, usando `LEMONSQUEEZY_API_KEY`.
2. Si Lemon Squeezy responde `activated: true`, toma el `instance_id` que devuelve.
3. Firma (Ed25519, con `ACTIVATION_SIGNING_PRIVATE_KEY`) un token con el contenido `{ license_key, instance_id, device_id, issued_at }`.
4. Responde `{ ok: true, token }`.

Respuestas de error (pasadas casi tal cual desde Lemon Squeezy):
- `{ ok: false, reason: "invalid_key" }` — la `license_key` no existe o está mal escrita.
- `{ ok: false, reason: "already_activated" }` — la licencia ya tiene su único cupo de dispositivo activado en otra instancia.
- `{ ok: false, reason: "service_unavailable" }` — timeout o error 5xx al llamar a Lemon Squeezy; la app debe tratar esto como "sin internet", no como licencia inválida.

### `POST /api/validate`

Se llama en segundo plano cada 7 días mientras la app está activada, para renovar el token.

Entrada:
```json
{ "license_key": "...", "instance_id": "...", "device_id": "..." }
```

Lógica:
1. Llama a `POST https://api.lemonsqueezy.com/v1/licenses/validate` con `license_key` e `instance_id`.
2. Si sigue válida (no fue reembolsada/revocada/expirado el cupo), firma y devuelve un token nuevo con `issued_at` actualizado: `{ ok: true, token }`.
3. Si Lemon Squeezy indica que ya no es válida (reembolso, chargeback, licencia desactivada manualmente) → `{ ok: false, reason: "revoked" }`. Esto no requiere lógica adicional: Lemon Squeezy ya marca automáticamente la licencia como inválida en estos casos; el backend solo reenvía ese estado.
4. Igual que en `/activate`, un error de red/timeout/5xx se responde como `{ ok: false, reason: "service_unavailable" }`, nunca como `"revoked"`.

Ambas funciones son *stateless*: no escriben nada en disco propio, solo reenvían a Lemon Squeezy y firman la respuesta.

## Flujo de datos en el cliente (referencia para el sub-proyecto de la app Electron)

Aunque la implementación de la UI de activación es un sub-proyecto separado, el backend asume este comportamiento del lado de la app:

1. **Primera activación** (requiere internet): la app genera un `device_id` (UUID) si no existe, llama a `/api/activate`, y si `ok: true` guarda `{ token, instance_id, device_id }` en `userData/activation.json`.
2. **Aperturas siguientes**: la app verifica la firma del token localmente (sin red). Si `issued_at` tiene menos de 7 días, abre directo. Si tiene más, intenta `POST /api/validate` en segundo plano:
   - Éxito → reemplaza el token guardado.
   - Sin internet o `service_unavailable` → deja abrir igual mientras no se superen **14 días** desde el `issued_at` original (margen de gracia para uso offline, ej. viajes).
   - Pasados los 14 días sin poder revalidar → bloquea el uso hasta reconectar.
   - `reason: "revoked"` → borra `activation.json` y vuelve a pedir licencia.
3. Si `activation.json` no existe, está corrupto, o la firma no verifica → se trata como no activada.

## Casos borde

- **Reinstalación en el mismo equipo sin borrar `userData`**: el token sigue siendo válido, no se pide nada de nuevo.
- **Equipo nuevo o `userData` borrado**: se genera un `device_id` nuevo; `/api/activate` devuelve `already_activated` porque el cupo (`activation_limit: 1`) ya está usado. **No se construye autoservicio de gestión de dispositivos en esta v1** (YAGNI dado el volumen esperado); la pantalla de error muestra un correo de soporte, y el desarrollador desactiva manualmente la instancia vieja desde el dashboard de Lemon Squeezy.
- **Sin internet en la primera activación**: no evitable, se comunica explícitamente en la UI.
- **Abuso/escaneo del endpoint público `/api/activate`**: no se implementa rate-limiting propio en v1 — el tier gratuito de Netlify Functions (125k invocaciones/mes) y el rechazo rápido de Lemon Squeezy ante claves inválidas son suficientes para el volumen esperado. Revisar si se detecta abuso real.

## Configuración necesaria

**En Lemon Squeezy** (cuenta nueva, nada configurado aún):
1. Crear cuenta y una Store.
2. Crear un Product "Saiki" con el precio simbólico definido (destino: Teletón Chile).
3. Activar License Keys para ese producto con `activation_limit: 1`.
4. Obtener el API key secreto (Settings → API).
5. Configurar el correo de confirmación de compra para incluir la `license_key` y el link de descarga del instalador de Saiki.

**Variables de entorno en Netlify** (Site settings → Environment variables):
- `LEMONSQUEEZY_API_KEY` — secreto del paso 4 de arriba.
- `ACTIVATION_SIGNING_PRIVATE_KEY` — clave privada Ed25519 generada una sola vez; solo vive en Netlify.
- La clave pública Ed25519 correspondiente se embebe como constante en el código de la app Electron (no es secreta).

**Pruebas**: usar el *test mode* de Lemon Squeezy (genera licencias de prueba sin cobro real) para probar el flujo completo activate/validate/offline/margen-de-gracia antes de lanzar con precio real.

## Fuera de alcance de este sub-proyecto

- La landing page y el botón "Comprar Saiki" (sub-proyecto 2).
- La pantalla de activación dentro de la app Electron y el almacenamiento local (sub-proyecto 3) — este documento solo define el contrato que esa pantalla debe consumir.
- Autoservicio de cambio de dispositivo (desactivar manualmente vía soporte en v1).
- Rate-limiting propio de los endpoints (revisar solo si hay abuso real).
