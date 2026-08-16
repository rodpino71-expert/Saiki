const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

app.setPath('userData', '/tmp/opencode/saiki-userdata');
app.setAppPath(path.join(__dirname, '..'));
require('../main.js');

const SHOTS_DIR = '/tmp/opencode/wp-shots';
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

const THEMES = [
  { name: 'neutralidad', theme: 'default', label: 'Neutralidad' },
  { name: 'optimismo', theme: 'optimismo', label: 'Optimismo' },
  { name: 'tranquilidad', theme: 'tranquilidad', label: 'Tranquilidad' },
  { name: 'certeza', theme: 'certeza', label: 'Certeza' },
  { name: 'fortaleza', theme: 'fortaleza', label: 'Fortaleza' },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

app.whenReady().then(() => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.error('No se encontró la ventana');
    app.exit(1);
    return;
  }

  win.setSize(1280, 800);
  win.setPosition(0, 0);
  win.setAlwaysOnTop(true);
  win.show();
  win.focus();

  const start = async () => {
    const wc = win.webContents;

    await wc.executeJavaScript(`document.querySelector('[data-target="boardView"]').click(); true`);
    await sleep(1200);

    for (const t of THEMES) {
      await wc.executeJavaScript(
        `document.documentElement.setAttribute('data-theme', ${JSON.stringify(t.theme)}); true`
      );
      await sleep(1000);
      const out = path.join(SHOTS_DIR, `theme-${t.name}.xwd`);
      try {
        execSync(`xwd -root -display ${process.env.DISPLAY} -out ${out}`);
        console.log('capturado', t.label);
      } catch (e) {
        console.error('fallo xwd para', t.label, e.message.slice(0, 120));
      }
    }

    app.exit(0);
  };

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', start);
  } else {
    setTimeout(start, 1500);
  }
});
