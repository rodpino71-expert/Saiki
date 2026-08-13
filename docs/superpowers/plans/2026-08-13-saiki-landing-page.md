# Saiki Landing Page & Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 5-9 require actions in the user's own GitHub/Netlify/Lemon Squeezy accounts and cannot be delegated to a fresh subagent with no access to those accounts — this plan is meant to be executed inline, in a session where the user is present to perform those steps and report back the values (URLs, keys) the next task needs.

**Goal:** Ship a one-page landing site (`web/`) in the existing `saiki` repo that sells Saiki for USD 10.90 via Lemon Squeezy checkout, deployed on Netlify.

**Architecture:** Static HTML/CSS/JS, no build step, in a `web/` subfolder of the existing `saiki` repo. Netlify deploys only that subfolder (base directory = `web`). The buy button links directly to a Lemon Squeezy-hosted checkout — no serverless functions are needed for this sub-project (those belong to the separately-designed license-validation backend). Lemon Squeezy's native file-delivery feature ships the installer to the buyer; no file hosting of our own.

**Tech Stack:** Plain HTML5, CSS3 (no framework, no npm dependency), Netlify static hosting, Lemon Squeezy (checkout + license keys + file delivery).

## Global Constraints

- One repo only — everything lives in the existing `saiki` repo, under `web/`. Do not create a new repo. (Ref: `docs/superpowers/specs/2026-08-13-saiki-landing-page-design.md`, [[feedback_single_repo_no_duplication]])
- No build step / no new frameworks or npm dependencies for the landing page.
- Price: **USD 10.90**, one-time payment, lifetime license.
- Language: Spanish only.
- GitHub repo: **private**, created manually by the user at github.com/new (no `gh` CLI installed).
- Installer delivery: via Lemon Squeezy's file-delivery attachment on the product — no self-hosting.
- License: `activation_limit: 1` per license key.
- No macOS/Windows code-signing/notarization pipeline in this sub-project — the initial launch ships with the Linux `.deb`/`.AppImage` only.
- Machine has 3.5GB RAM total and has historically run out of resources on heavy toolchains — do not launch Electron or `electron-builder` from an agent session; those run only when the user explicitly runs them.

---

### Task 1: Landing page skeleton and logo asset

**Files:**
- Create: `web/index.html` (skeleton only, filled in Task 2)
- Create: `web/img/logo.png`

**Interfaces:**
- Produces: `web/img/logo.png` (500x500 RGBA PNG, referenced by Task 2's `<img>` tags)

- [ ] **Step 1: Create the `web/` folder structure**

```bash
mkdir -p web/img
```

- [ ] **Step 2: Copy the existing logo into place**

```bash
cp "losaiki sin fondo1.png" web/img/logo.png
```

- [ ] **Step 3: Verify the copy**

Run: `file web/img/logo.png`
Expected: `web/img/logo.png: PNG image data, 500 x 500, 8-bit/color RGBA, non-interlaced`

- [ ] **Step 4: Commit**

```bash
git add web/img/logo.png
git commit -m "chore: add logo asset for landing page"
```

---

### Task 2: Landing page HTML content

**Files:**
- Create: `web/index.html`

**Interfaces:**
- Consumes: `web/img/logo.png` (Task 1)
- Produces: `web/styles.css` link (consumed by Task 3), two elements with class `cta-button` and `href="https://REPLACE_WITH_LEMONSQUEEZY_CHECKOUT_URL"` (consumed by Task 8), `<img>` tags expecting `web/img/screenshot-1.png`, `web/img/screenshot-2.png`, `web/img/screenshot-3.png` (consumed by Task 4/user-supplied)

- [ ] **Step 1: Write `web/index.html`**

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Saiki — Planificador de carga cognitiva</title>
  <meta name="description" content="Saiki es el planificador que respeta tu capacidad real: organiza tus tareas sin sobrecargarte, revisa tu mes y cierra cada semestre con claridad. Pago único, USD 10.90.">
  <link rel="icon" href="img/logo.png">
  <link rel="stylesheet" href="styles.css">
</head>
<body>

  <header class="hero">
    <img src="img/logo.png" alt="Saiki" class="logo">
    <h1>Saiki 再起 — volvé a empezar, sin perder el control</h1>
    <p class="subtitle">El planificador que respeta tu capacidad real. Organizá tus tareas sin sobrecargarte, revisá tu mes y cerrá cada semestre con claridad.</p>
    <a href="https://REPLACE_WITH_LEMONSQUEEZY_CHECKOUT_URL" class="cta-button">Comprar Saiki — USD 10.90 (pago único)</a>
    <p class="cta-note">Licencia de por vida. Sin suscripciones.</p>
  </header>

  <main>

    <section class="problem">
      <h2>La mayoría de los planificadores te dejan sobrecargar la lista hasta que todo colapsa</h2>
      <p>Saiki funciona distinto: te avisa cuando tu carga de tareas excede tu capacidad real, en vez de dejarte acumular pendientes hasta el agotamiento. Menos lista infinita, más control real sobre lo que podés hacer.</p>
    </section>

    <section class="features">
      <h2>Qué incluye Saiki</h2>
      <div class="feature-grid">
        <article class="feature-card">
          <span class="feature-icon">⚖️</span>
          <h3>Límite de capacidad</h3>
          <p>Saiki te avisa cuando excedés tu capacidad antes de que sea tarde, en vez de dejarte acumular tareas sin freno.</p>
        </article>
        <article class="feature-card">
          <span class="feature-icon">📊</span>
          <h3>Auditoría mensual</h3>
          <p>Revisá qué pasó cada mes: qué se cumplió, qué se postergó y por qué.</p>
        </article>
        <article class="feature-card">
          <span class="feature-icon">📆</span>
          <h3>Cierre semestral</h3>
          <p>El Gran Cierre Semestral te muestra métricas consolidadas y tu historial de camino cada seis meses.</p>
        </article>
        <article class="feature-card">
          <span class="feature-icon">🔄</span>
          <h3>Reprogramar y repriorizar</h3>
          <p>Movés tareas de fecha o cambiás su prioridad sin perder el registro de por qué lo hiciste.</p>
        </article>
      </div>
    </section>

    <section class="screenshots">
      <h2>Así se ve Saiki</h2>
      <div class="screenshot-grid">
        <img src="img/screenshot-1.png" alt="Tablero de tareas de Saiki" loading="lazy">
        <img src="img/screenshot-2.png" alt="Auditoría mensual de Saiki" loading="lazy">
        <img src="img/screenshot-3.png" alt="Cierre semestral de Saiki" loading="lazy">
      </div>
    </section>

    <section class="pricing">
      <h2>Una sola vez, tuyo para siempre</h2>
      <p class="price">USD 10.90</p>
      <p>Pago único. Sin suscripciones. 1 licencia = 1 dispositivo.</p>
      <a href="https://REPLACE_WITH_LEMONSQUEEZY_CHECKOUT_URL" class="cta-button">Comprar Saiki</a>
    </section>

    <section class="faq">
      <h2>Preguntas frecuentes</h2>
      <dl>
        <dt>¿En qué plataformas funciona?</dt>
        <dd>Windows, macOS y Linux (.deb / AppImage).</dd>

        <dt>¿Cuántos dispositivos puedo activar por licencia?</dt>
        <dd>Uno. Si cambiás de computadora, escribinos y reactivamos tu licencia en el nuevo equipo.</dd>

        <dt>¿Cómo recibo el instalador?</dt>
        <dd>Al comprar, recibís un correo con tu <code>license_key</code> y el link de descarga del instalador.</dd>

        <dt>¿Hay reembolsos?</dt>
        <dd>Si algo no funciona como esperabas, escribinos dentro de los 14 días posteriores a la compra.</dd>
      </dl>
    </section>

  </main>

  <footer>
    <p>Saiki — Rodrigo Pino — <a href="mailto:rodpino71@gmail.com">rodpino71@gmail.com</a></p>
  </footer>

</body>
</html>
```

- [ ] **Step 2: Verify required sections are present**

Run:
```bash
grep -c 'class="cta-button"' web/index.html
grep -c 'REPLACE_WITH_LEMONSQUEEZY_CHECKOUT_URL' web/index.html
grep -c '<section' web/index.html
grep -o 'img/screenshot-[0-9].png' web/index.html | sort -u
```
Expected: `2`, `2`, `5`, and the three distinct `img/screenshot-1.png` / `-2.png` / `-3.png` paths listed.

- [ ] **Step 3: Commit**

```bash
git add web/index.html
git commit -m "feat: add landing page HTML content"
```

---

### Task 3: Landing page styles

**Files:**
- Create: `web/styles.css`

**Interfaces:**
- Consumes: class names and structure from `web/index.html` (Task 2): `.hero`, `.logo`, `.subtitle`, `.cta-button`, `.cta-note`, `.problem`, `.features`, `.feature-grid`, `.feature-card`, `.feature-icon`, `.screenshots`, `.screenshot-grid`, `.pricing`, `.price`, `.faq`, `footer`

- [ ] **Step 1: Write `web/styles.css`**

```css
:root {
  --bg: #faf7f2;
  --text: #23282b;
  --muted: #6b7280;
  --accent: #2f6f63;
  --accent-dark: #1f4e45;
  --cta: #e8763d;
  --cta-dark: #c9591f;
  --card-bg: #ffffff;
  --border: #e5e0d8;
  --radius: 12px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}

h1, h2, h3 { line-height: 1.2; }

.hero {
  text-align: center;
  padding: 64px 20px 48px;
  max-width: 720px;
  margin: 0 auto;
}

.logo {
  width: 96px;
  height: 96px;
  border-radius: 20px;
  margin-bottom: 20px;
}

.hero h1 {
  font-size: clamp(28px, 4vw, 40px);
  margin: 0 0 16px;
}

.subtitle {
  font-size: 18px;
  color: var(--muted);
  margin: 0 0 28px;
}

.cta-button {
  display: inline-block;
  background: var(--cta);
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  font-size: 17px;
  padding: 14px 28px;
  border-radius: var(--radius);
  transition: background 0.15s ease;
}

.cta-button:hover { background: var(--cta-dark); }

.cta-note {
  color: var(--muted);
  font-size: 14px;
  margin-top: 12px;
}

main { max-width: 960px; margin: 0 auto; padding: 0 20px; }

section { padding: 56px 0; border-top: 1px solid var(--border); }

.problem { text-align: center; max-width: 680px; margin: 0 auto; }
.problem h2 { font-size: 26px; }
.problem p { color: var(--muted); font-size: 17px; }

.features h2, .screenshots h2, .pricing h2, .faq h2 {
  text-align: center;
  font-size: 26px;
  margin-bottom: 36px;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 24px;
}

.feature-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
}

.feature-icon { font-size: 28px; }
.feature-card h3 { margin: 12px 0 8px; font-size: 18px; }
.feature-card p { margin: 0; color: var(--muted); font-size: 15px; }

.screenshot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
}

.screenshot-grid img {
  width: 100%;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  display: block;
}

.pricing { text-align: center; }
.price {
  font-size: 48px;
  font-weight: 700;
  color: var(--accent-dark);
  margin: 0 0 4px;
}

.faq dl { max-width: 680px; margin: 0 auto; }
.faq dt { font-weight: 600; margin-top: 20px; }
.faq dd { margin: 6px 0 0; color: var(--muted); }

footer {
  text-align: center;
  padding: 32px 20px 48px;
  color: var(--muted);
  font-size: 14px;
}

footer a { color: var(--accent); }
```

- [ ] **Step 2: Verify every class referenced in the HTML has a matching rule**

Run:
```bash
for c in hero logo subtitle cta-button cta-note problem features feature-grid feature-card feature-icon screenshots screenshot-grid pricing price faq; do
  grep -q "\.$c" web/styles.css && echo "OK  .$c" || echo "MISSING .$c"
done
```
Expected: every line printed as `OK`.

- [ ] **Step 3: Open the page locally to sanity-check the layout**

Run: `xdg-open web/index.html` (or open `web/index.html` directly in a browser)
Expected: hero, features grid, screenshot placeholders (broken images are fine at this point — Task 4 adds them), pricing, FAQ and footer all render without layout overlap on both a desktop-width and a narrow (mobile) browser window.

- [ ] **Step 4: Commit**

```bash
git add web/styles.css
git commit -m "feat: add landing page styles"
```

---

### Task 4: Netlify config and screenshots

**Files:**
- Create: `web/netlify.toml`
- Create: `web/img/screenshot-1.png`, `web/img/screenshot-2.png`, `web/img/screenshot-3.png` (copied from the already-supplied `imagenes de saiki/` folder — see Step 3)

- [ ] **Step 1: Write `web/netlify.toml`**

```toml
[build]
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
  force = false
```

- [ ] **Step 2: Commit the Netlify config**

```bash
git add web/netlify.toml
git commit -m "chore: add netlify.toml for landing page"
```

- [ ] **Step 3: Copy the already-supplied screenshots into place**

The user placed real app screenshots (different color themes) in `imagenes de saiki/` at the repo root. Copy the three chosen for variety (light kanban board, light calendar, dark kanban board):

```bash
cp "imagenes de saiki/imagen saiki 2.2 optimismo.png" web/img/screenshot-1.png
cp "imagenes de saiki/imagen saiki 4.2 certeza.png" web/img/screenshot-2.png
cp "imagenes de saiki/imagen saiki 3.2 tranquilidad.png" web/img/screenshot-3.png
```

- [ ] **Step 4: Verify**

Run: `file web/img/screenshot-*.png`
Expected: three PNG files listed, all under `web/img/`.

- [ ] **Step 5: Commit the screenshots**

```bash
git add web/img/screenshot-1.png web/img/screenshot-2.png web/img/screenshot-3.png
git commit -m "chore: add app screenshots to landing page"
```

Expected: reloading `web/index.html` in a browser shows the three real app screenshots instead of broken image icons.

---

### Task 5: Push the repo to GitHub (external, user + agent)

**Files:** none (git/GitHub operations only)

- [ ] **Step 1 (external, user): create the empty private repo**

Go to https://github.com/new, set:
- Repository name: `saiki`
- Visibility: **Private**
- Do NOT initialize with a README, .gitignore, or license (the local repo already has commits)

Report back the repo URL (e.g. `https://github.com/<your-username>/saiki.git`).

- [ ] **Step 2: Add the remote and push**

```bash
git remote add origin <REPO_URL_FROM_STEP_1>
git push -u origin master
```

- [ ] **Step 3: Verify**

Run: `git remote -v`
Expected: `origin` listed with the fetch/push URL from Step 1.

Refresh the GitHub repo page in the browser — all commits, including `web/`, should be visible.

---

### Task 6: Connect the repo to Netlify (external, user)

**Files:** none

- [ ] **Step 1 (external, user): create the Netlify site**

In the Netlify dashboard: **Add new site → Import an existing project → GitHub → saiki**.

- [ ] **Step 2 (external, user): configure the base/publish directory**

In the site's build settings:
- Base directory: `web`
- Build command: *(leave empty — no build step)*
- Publish directory: `web`

- [ ] **Step 3 (external, user): rename the site**

Site settings → Site details → Change site name → `saiki` (or the closest available slug), so the URL becomes `https://saiki.netlify.app` (or similar).

- [ ] **Step 4: Verify the deploy**

Open the resulting `https://<site-name>.netlify.app` URL.
Expected: the landing page loads with the same content verified locally in Task 3 Step 3 (buy buttons still point at the `REPLACE_WITH_LEMONSQUEEZY_CHECKOUT_URL` placeholder — that's expected until Task 8).

---

### Task 7: Set up Lemon Squeezy (external, user)

**Files:** none

- [ ] **Step 1 (external, user): create account and store**

Sign up at https://www.lemonsqueezy.com/ and create a Store.

- [ ] **Step 2 (external, user): create the product**

Create a product named "Saiki":
- Price: **USD 10.90**, one-time payment (not a subscription)
- Enable **License Keys** for this product, with `activation_limit: 1`

- [ ] **Step 3 (external, user): build and attach the installer**

On your own machine, when you have RAM headroom (do not run this from an agent session — `electron-builder` is heavy and this machine has run out of memory on similar toolchains before):

```bash
npm run dist
```

This produces the Linux `.deb`/`.AppImage` under `release/`. Upload at least one of those files as a downloadable **file attachment** on the Lemon Squeezy product (Product → Files). Lemon Squeezy will include the download link automatically in the purchase confirmation email, alongside the `license_key`.

- [ ] **Step 4: Get the checkout link**

From the product page in Lemon Squeezy, copy the checkout URL (Share/Buy link).

Report back the checkout URL for Task 8.

---

### Task 8: Wire the real checkout URL into the landing page

**Files:**
- Modify: `web/index.html` (both `class="cta-button"` links)

**Interfaces:**
- Consumes: the checkout URL obtained in Task 7 Step 4

- [ ] **Step 1: Replace the placeholder URL**

```bash
sed -i 's|https://REPLACE_WITH_LEMONSQUEEZY_CHECKOUT_URL|<CHECKOUT_URL_FROM_TASK_7>|g' web/index.html
```

- [ ] **Step 2: Verify no placeholder remains and both buttons point at the real URL**

Run:
```bash
grep -c 'REPLACE_WITH_LEMONSQUEEZY_CHECKOUT_URL' web/index.html
grep -c 'cta-button' web/index.html
```
Expected: first command prints `0` (no placeholder left); second still prints `2` (both buttons intact). Then manually confirm both `href` values equal the checkout URL from Task 7 by opening `web/index.html` and checking each `<a class="cta-button" ...>` tag.

- [ ] **Step 3: Commit and push**

```bash
git add web/index.html
git commit -m "feat: wire real Lemon Squeezy checkout URL into landing page"
git push
```

Expected: Netlify auto-deploys the new commit; reloading the live site shows the buy buttons pointing at the real Lemon Squeezy checkout.

---

### Task 9: End-to-end purchase flow verification (external, user)

**Files:** none

- [ ] **Step 1 (external, user): run a test-mode purchase**

Enable Lemon Squeezy **test mode**, click "Comprar Saiki" on the live Netlify site, and complete a test purchase with a Lemon Squeezy test card.

- [ ] **Step 2: Verify delivery**

Expected in the confirmation email:
- A `license_key`
- A working download link for the installer attached in Task 7 Step 3

- [ ] **Step 3: Disable test mode**

Once verified, turn off Lemon Squeezy test mode so real purchases process for real money.

- [ ] **Step 4: Report back**

Confirm to close out this plan: test purchase succeeded, email received with license key + download link, test mode disabled.
