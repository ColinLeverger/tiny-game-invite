// Plays the whole game in a headless Chromium, on a phone (extreme mode) and a laptop (normal mode).
// Fails on any page error, or if a run does not reach the invitation card with a valid PDF.
// Run through `make e2e`. Needs playwright (or playwright-core with CHROMIUM_PATH set to a Chrome/Chromium binary).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('playwright-core'); }
const BASE = process.env.BASE || 'http://localhost:8000';
const exe = process.env.CHROMIUM_PATH;

function check(ok, msg) { if (!ok) throw new Error(msg); }

async function play(browser, tag, opts, mode) {
  const p = await browser.newPage(opts);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const invite = Buffer.from(JSON.stringify({ b: 'Bar Test', a: '1 rue Test, Rennes', p: 'Iris' })).toString('base64url');
  await p.goto(`${BASE}/index.html?test#i=${invite}`);
  await p.check(`input[value=${mode}]`);
  await p.click('button[type=submit]');
  await p.waitForFunction(() => window.__invite && __invite.state === 'dialog');

  const ev = (f, a) => p.evaluate(f, a);
  const state = () => ev(() => __invite.state);
  const drain = async () => { for (let i = 0; i < 60 && await state() === 'dialog'; i++) await ev(() => __invite.advance()); };
  const at = async (x, y) => { await ev(([x2, y2]) => { __invite.player.x = x2; __invite.player.y = y2; }, [x, y]); await p.waitForTimeout(150); };
  const solve = async () => {
    await p.waitForFunction(() => __invite.state === 'puzzle');
    await ev(() => __invite.win());
    // done once the won puzzle is gone (either back to the map, or the next puzzle of a chain)
    await p.waitForFunction(() => !__invite.puzzle || __invite.puzzle.wonT < 0, null, { timeout: 5000 });
    await drain();
  };
  await drain();

  // Supervisors (Loïc, Véronique), the pigeon, then the metro to Villejean for Ioana.
  for (const i of [0, 1]) { // Loïc and Véronique stand still; walk up to whoever is where
    await ev((k) => { const sp = __invite.SUPS[k]; __invite.player.x = sp.x + 14; __invite.player.y = sp.y; }, i);
    await p.waitForTimeout(150); await drain();
  }
  await ev(() => { const g = __invite.pigeon; __invite.player.x = g.x + 4; __invite.player.y = g.y; }); await p.waitForTimeout(150); await drain();
  await at(16 * 16 + 8, 4 * 16 + 22); await ev(() => { __invite.keys.up = true; }); await p.waitForTimeout(300); await ev(() => { __invite.keys.up = false; });
  check(await state() === 'metroMenu', `${tag}: metro menu did not open`);
  await ev(() => __invite.chooseMetro(__invite.STATIONS.findIndex((s) => s.name.startsWith('Villejean'))));
  await p.waitForFunction(() => __invite.state === 'play', null, { timeout: 15000 });
  await ev(() => { const io = __invite.SUPS[2]; __invite.player.x = io.x; __invite.player.y = io.y; }); await p.waitForTimeout(200); await drain();
  check(await ev(() => __invite.SUPS.every((s) => s.found)), `${tag}: supervisors not all found`);

  // The first cat, then autosave + reload + resume.
  await ev(() => { const c = __invite.cats[0]; __invite.player.x = c.x + 15; __invite.player.y = c.y; }); await p.waitForTimeout(150); await drain();
  await solve();
  await ev(() => __invite.snapshot());
  await p.reload();
  await p.click('#resumeLink');
  check(await ev(() => __invite.cats[0].solved && __invite.SUPS.every((s) => s.found) && __invite.mode) === mode, `${tag}: resume lost progress`);

  // The second cat (flees once in normal mode; sneak in the others).
  if (mode === 'normal') {
    await ev(() => { const c = __invite.cats[1]; __invite.player.x = c.x - 40; __invite.player.y = c.y; });
    await p.waitForFunction(() => __invite.cats[1].fled >= 1 && !__invite.cats[1].run, null, { timeout: 15000 });
  }
  await ev(() => { __invite.keys.sneak = true; const c = __invite.cats[1]; __invite.player.x = c.x + 14; __invite.player.y = c.y + 1; });
  await p.waitForTimeout(200); await drain(); await solve();
  await ev(() => { __invite.keys.sneak = false; __invite.ghost.on = false; });

  // Rapporteur (one question, or three in extreme mode).
  await ev(() => { __invite.player.x = __invite.rap.x; __invite.player.y = __invite.rap.y + 22; }); await p.waitForTimeout(200); await drain();
  for (let i = 0; i < (mode === 'extreme' ? 3 : 1); i++) await solve();
  await p.waitForFunction(() => __invite.state === 'end', null, { timeout: 5000 });
  await p.waitForSelector('#card:not(.hidden)', { timeout: 9000 }); // after the bar scene
  check((await p.textContent('#cBar')).includes('Bar Test'), `${tag}: bar missing from the card`);
  const pdf = Buffer.from(await ev(() => Array.from(__invite.buildPdf(__invite.diploma()))));
  check(pdf.subarray(0, 5).toString() === '%PDF-', `${tag}: not a PDF`);
  check(errors.length === 0, `${tag}: page errors: ${errors.join(' | ')}`);
  await p.close();
  console.log(`e2e ${tag}: OK`);
}

const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
try {
  await play(browser, 'phone/extreme', { viewport: { width: 390, height: 750 }, hasTouch: true, isMobile: true }, 'extreme');
  await play(browser, 'laptop/normal', { viewport: { width: 1280, height: 720 } }, 'normal');
} finally {
  await browser.close();
}
