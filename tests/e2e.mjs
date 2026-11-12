// Plays the game in a headless Chromium, on a phone (extreme mode) and a laptop (normal mode).
// Puzzles are answered with real taps/clicks where it matters (partition, anomaly, exam questions),
// and the run covers quitting, backgrounding + resume, the ghost, the rapporteur's exam resuming,
// and the diploma being stored as soon as the run ends. Fails on any page error.
// Not covered here: WebKit/Safari (Playwright's WebKit needs system libraries the CI runner lacks),
// real iOS audio and opening generated files in a new tab: check those by hand on an iPhone.
// Run through `make e2e`. Needs playwright (or playwright-core with CHROMIUM_PATH set to a Chrome/Chromium binary).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('playwright-core'); }
const BASE = process.env.BASE || 'http://localhost:8000';
const exe = process.env.CHROMIUM_PATH;

function check(ok, msg) { if (!ok) throw new Error(msg); }
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');


async function play(browser, tag, opts, mode) {
  const p = await browser.newPage(opts);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/index.html?test#i=${b64({ b: 'Bar Test', a: '1 rue Test, Rennes', p: 'Iris', c1: 'Minou', c2: 'Matou' })}`);
  await p.check(`input[value=${mode}]`);
  await p.click('button[type=submit]');
  await p.waitForFunction(() => window.__invite && __invite.state === 'dialog');

  const ev = (f, a) => p.evaluate(f, a);
  const state = () => ev(() => __invite.state);
  const drain = async () => { for (let i = 0; i < 60 && await state() === 'dialog'; i++) await ev(() => __invite.advance()); };
  const place = async (f, a) => { await ev(f, a); await p.waitForTimeout(200); };
  const tapScreen = async (sx, sy) => { // logical screen coordinates -> a real tap or click
    const box = await p.locator('canvas').boundingBox();
    const [W, H] = await ev(() => [__invite.W, __invite.H]);
    const x = box.x + sx * box.width / W, y = box.y + sy * box.height / H;
    if (opts.hasTouch) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y);
    await p.waitForTimeout(40);
  };
  const tapLayout = async (lx, ly) => { const [sx, sy] = await ev(([a, b]) => __invite.PM(a, b), [lx, ly]); await tapScreen(sx, sy); };
  const puzzleIs = async (label) => {
    await p.waitForFunction((l) => __invite.state === 'puzzle' && __invite.puzzle.label.includes(l), label, { timeout: 5000 });
    await p.waitForTimeout(150); // let the puzzle draw once: the portrait layout is computed while drawing
  };
  const afterWin = async () => { await p.waitForFunction(() => !__invite.puzzle || __invite.puzzle.wonT < 0, null, { timeout: 5000 }); await drain(); };
  const winByHook = async () => { await p.waitForFunction(() => __invite.state === 'puzzle'); await ev(() => __invite.win()); await afterWin(); };
  const visitCat = (i, dx = 15, dy = 0) => place(([k, x, y]) => { const c = __invite.cats[k]; __invite.player.x = c.x + x; __invite.player.y = c.y + y; }, [i, dx, dy]);
  await drain();

  // Supervisors (Loïc, Véronique), the pigeon, then the metro to Villejean for Ioana.
  for (const i of [0, 1]) { await place((k) => { const sp = __invite.SUPS[k]; __invite.player.x = sp.x + 14; __invite.player.y = sp.y; }, i); await drain(); }
  await place(() => { const g = __invite.pigeon; __invite.player.x = g.x + 4; __invite.player.y = g.y; }); await drain();
  await place(() => { __invite.player.x = 16 * 16 + 8; __invite.player.y = 4 * 16 + 22; __invite.keys.up = true; });
  await ev(() => { __invite.keys.up = false; });
  check(await state() === 'metroMenu', `${tag}: metro menu did not open`);
  await ev(() => __invite.chooseMetro(__invite.STATIONS.findIndex((s) => s.name.startsWith('Villejean'))));
  await p.waitForFunction(() => __invite.state === 'play', null, { timeout: 15000 });
  await place(() => { const io = __invite.SUPS[2]; __invite.player.x = io.x; __invite.player.y = io.y; }); await drain();
  check(await ev(() => __invite.SUPS.every((s) => s.found)), `${tag}: supervisors not all found`);

  // First cat: a wrong full colouring (one error), background + reload + resume mid-puzzle, then solve it by taps.
  await visitCat(0); await drain();
  await puzzleIs('partitionnement');
  check((await ev(() => __invite.puzzle.title)).startsWith('Minou'), `${tag}: cat name from the link not used`);
  const NODES = await ev(() => __invite.puzzle.nodes), CLUSTER = await ev(() => __invite.puzzle.cluster); // 12 nodes, 4 districts in hard modes
  check(NODES.length === (mode === 'normal' ? 9 : 12), `${tag}: wrong partition size for the mode`);
  for (const [x, y] of NODES) await tapLayout(x, y); // everything one colour: districts too small -> 1 error
  check(await ev(() => __invite.puzzle.wrong) === 1, `${tag}: wrong colouring not counted`);
  await ev(() => __invite.snapshot());
  await p.reload();
  await p.click('#resumeLink');
  check(await ev(() => __invite.SUPS.every((s) => s.found) && __invite.mode) === mode, `${tag}: resume lost progress`);
  await visitCat(0, 60); await visitCat(0); await drain(); // step away and back: the cat offers its puzzle again
  await puzzleIs('partitionnement');
  check(await ev(() => __invite.puzzle.wrong) === 1, `${tag}: error lost across background/resume`);
  for (const [n, [x, y]] of NODES.entries()) for (let t = 0; t <= CLUSTER[n]; t++) await tapLayout(x, y); // colour = its district
  await afterWin();
  check(await ev(() => __invite.cats[0].solved), `${tag}: partition not solved by taps`);

  // Second cat (flees once in normal mode; sneak in the others).
  if (mode === 'normal') {
    await visitCat(1, -40);
    await p.waitForFunction(() => __invite.cats[1].fled >= 1 && !__invite.cats[1].run, null, { timeout: 15000 });
  }
  await ev(() => { __invite.keys.sneak = true; });
  await visitCat(1, 14, 1); await drain(); await winByHook();
  await ev(() => { __invite.keys.sneak = false; });

  if (mode === 'extreme') { // the ghost wakes up when you come close, and catching you sends a cat home
    await place(() => { const g = __invite.ghost; __invite.player.x = g.x + 50; __invite.player.y = g.y + 8; });
    check(await ev(() => __invite.ghost.awake), `${tag}: ghost did not wake up`);
    await place(() => { const g = __invite.ghost; g.cool = 0; __invite.player.x = g.x + 6; __invite.player.y = g.y + 8; });
    check(await ev(() => __invite.fragments) === 1, `${tag}: ghost catch did not free a cat`);
    const i = await ev(() => __invite.cats.findIndex((c) => c.escaped));
    await ev(() => { __invite.ghost.on = false; __invite.keys.sneak = true; });
    // The freed cat may have respawned near the ghost's spot and be running away: catch it once it stops.
    await p.waitForFunction((k) => !__invite.cats[k].run, i, { timeout: 15000 });
    await visitCat(i, 14, 1); await drain();
    await ev(() => { __invite.keys.sneak = false; });
    check(await ev(() => __invite.fragments) === 2, `${tag}: escaped cat not re-caught`);
  }

  // Objectives: the big HTML button on a phone, the HUD button on a laptop; both open the panel.
  if (opts.hasTouch) await p.click('#menuBtn');
  else { const W = await ev(() => __invite.W); await tapScreen(W - 38, 6); }
  await p.waitForSelector('#objBox:not(.hidden)', { timeout: 3000 });
  await p.click('#objClose');

  // A bench: stop on it for a moment, hear a story.
  await place(() => { const b = __invite.BENCHES[1]; __invite.player.x = b.x; __invite.player.y = b.y; });
  await p.waitForFunction(() => __invite.state === 'dialog' && __invite.storyNext === 1, null, { timeout: 3000 });
  await drain();

  // The climbing wall: Colin comes down with Ketsia and follows her.
  await place(() => { __invite.player.x = __invite.WALL.x; __invite.player.y = __invite.WALL.y; __invite.keys.up = true; });
  await p.waitForFunction(() => __invite.state !== 'play', null, { timeout: 3000 });
  await ev(() => { __invite.keys.up = false; }); await drain(); await winByHook();
  check(await ev(() => __invite.climbDone && __invite.stats.met.includes('colin')), `${tag}: Colin did not join after the climb`);

  // Phones can blank a canvas's pictures while the tab is hidden: the game must reload and resume the run.
  if (!opts.hasTouch) {
    const before = await ev(() => [Math.round(__invite.player.x), Math.round(__invite.player.y), __invite.fragments]);
    await Promise.all([
      p.waitForEvent('load', { timeout: 5000 }),
      ev(() => { __invite.world.getContext('2d').clearRect(0, 0, 4, 4); document.dispatchEvent(new Event('visibilitychange')); }),
    ]);
    await p.waitForFunction(() => window.__invite && __invite.state === 'play', null, { timeout: 5000 });
    const after = await ev(() => [Math.round(__invite.player.x), Math.round(__invite.player.y), __invite.fragments]);
    check(after.join() === before.join(), `${tag}: run not resumed after lost pictures: ${before} -> ${after}`);
  }

  // Fishing from the pier: wait for the bite, strike with a real tap or Space, then put the rod away.
  await place(() => { __invite.player.x = __invite.PIER.x; __invite.player.y = __invite.PIER.y; });
  await p.waitForFunction(() => __invite.state !== 'play', null, { timeout: 3000 });
  await drain();
  await p.waitForFunction(() => __invite.puzzle && __invite.puzzle.phase === 'bite', null, { timeout: 8000 });
  if (opts.hasTouch) { const [W, H] = await ev(() => [__invite.W, __invite.H]); await tapScreen(W / 2, H / 2); } else await p.keyboard.press('Space');
  check(await ev(() => __invite.puzzle.phase) === 'caught', `${tag}: the strike did not catch anything`);
  await p.keyboard.press('Escape');
  check(await ev(() => __invite.state === 'play' && Object.values(__invite.stats.fish || {}).reduce((a, b) => a + b, 0) === 1), `${tag}: catch not counted`);
  check(!(await ev(() => __invite.stats.puzzles.some((q) => q.label === 'Repêchage'))), `${tag}: fishing scored as a puzzle`);
  await place(() => { __invite.player.y -= 40; });

  // Rapporteur: tap the anomalous trajectory; in extreme mode quit at question 2, come back, finish the exam.
  const atRap = async () => { await place(() => { __invite.player.x = __invite.rap.x; __invite.player.y = __invite.rap.y + 60; }); await place(() => { __invite.player.x = __invite.rap.x; __invite.player.y = __invite.rap.y + 22; }); await drain(); };
  const answer = async (k) => { // quiz boxes are in screen coordinates
    const [W, H, portrait] = await ev(() => [__invite.W, __invite.H, __invite.H > __invite.W]);
    const h = portrait ? 22 : 18, top = portrait ? H * 0.42 : 70;
    await tapScreen(W / 2, top + k * (h + 6) + h / 2);
  };
  await atRap();
  await puzzleIs('anomalie');
  if (mode === 'normal') await tapLayout(96, 135); // a point on the looping (anomalous) trajectory
  else await tapLayout(95, 140); // hard modes: a point on the detour that first moves away from the star
  if (mode === 'extreme') {
    await puzzleIs('question 2');
    await p.keyboard.press('Escape');
    check(await ev(() => __invite.rapStage) === 1, `${tag}: exam progress not kept`);
    await atRap();
    await puzzleIs('question 2');
    await answer(1); await puzzleIs('question 3');
    await answer(2);
  }
  await afterWin(); // the rapporteur's closing lines
  await p.waitForFunction(() => __invite.state === 'end', null, { timeout: 6000 });
  check(await ev(() => !!localStorage.getItem('invite-diploma')), `${tag}: diploma not stored when the run ended`);
  const labels = await ev(() => __invite.stats.puzzles.map((q) => q.label));
  check(new Set(labels).size === labels.length, `${tag}: a puzzle was recorded twice: ${labels.join(', ')}`);
  await p.waitForSelector('#card:not(.hidden)', { timeout: 9000 }); // after the bar scene
  check((await p.textContent('#cBar')).includes('Bar Test'), `${tag}: bar missing from the card`);
  // The badge medal opens the score details.
  await p.click('#cBadgeBtn');
  check((await p.textContent('#cBadgeTip')).includes('Total'), `${tag}: badge details missing`);
  await p.click('#cTitle');
  // Back to the party, then a tap on the scene brings the card back.
  await p.click('#cParty');
  check(await p.locator('#card.hidden').count() === 1, `${tag}: "Revoir la fête" did not hide the card`);
  await tapScreen(40, 40);
  await p.waitForSelector('#card:not(.hidden)', { timeout: 3000 });
  const pdf = Buffer.from(await ev(() => Array.from(__invite.buildPdf(__invite.diploma()))));
  check(pdf.subarray(0, 5).toString() === '%PDF-', `${tag}: not a PDF`);
  check(errors.length === 0, `${tag}: page errors: ${errors.join(' | ')}`);
  await p.close();
  console.log(`e2e ${tag}: OK`);
}

// A malformed link must not break the page, and the sound preference must survive a load.
async function robustness(browser) {
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${BASE}/index.html?test#i=${b64({ c1: { toString: null }, b: ['x'], a: 42 })}`);
  await p.evaluate(() => localStorage.setItem('invite-sound', 'on'));
  await p.reload();
  check(await p.isChecked('#soundOn'), 'robustness: sound preference overwritten on load');
  await p.fill('#nameInput', 'Iris'); await p.click('button[type=submit]');
  await p.waitForFunction(() => window.__invite && __invite.state === 'dialog');
  // "No time to play": the big button on the first screen goes straight to the invitation.
  await p.reload();
  await p.click('#skipLink');
  await p.waitForSelector('#card:not(.hidden)', { timeout: 9000 });
  // The roads cross the Vilaine on bridges (a stray comment once removed them: cars drove on water).
  check(await p.evaluate(() => [20, 21, 36, 37, 12, 13].every((x) => [19, 20].every((y) => !__invite.blocked(x * 16 + 8, y * 16 + 12)))),
    'robustness: a bridge over the Vilaine is missing');
  // Every challenge done (developer god mode): every encounter must reach the PDF's "Rencontres du voyage".
  await p.goto(`${BASE}/index.html?test`); await p.fill('#nameInput', 'Iris'); await p.click('button[type=submit]');
  await p.waitForFunction(() => window.__invite && __invite.state === 'dialog');
  const full = await p.evaluate(() => { __invite.godMode(); const d = __invite.diploma(); const pdf = __invite.buildPdf(d); return { met: d.met, pdf: new TextDecoder('latin1').decode(pdf) }; });
  const ALL = ['cat1', 'cat2', 'loic', 'vero', 'ioana', 'pigeon', 'bike', 'metro', 'climb', 'colin', 'bench', 'fish', 'poulpy', 'ot', 'rap'];
  check(ALL.every((k) => full.met.includes(k)), `robustness: encounters missing from a full run: ${ALL.filter((k) => !full.met.includes(k))}`);
  for (const name of ['Colin', 'Poulpy', 'Banc', 'Ioana', 'Escalade', 'Rapporteur']) check(full.pdf.includes(`(${name})`), `robustness: ${name} missing from the full-run PDF`);
  check(errors.length === 0, `robustness: page errors with a malformed link: ${errors.join(' | ')}`);
  await p.close();
  console.log('e2e robustness: OK');
}

const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
try {
  await robustness(browser);
  await play(browser, 'phone/extreme', { viewport: { width: 390, height: 750 }, hasTouch: true, isMobile: true }, 'extreme');
  await play(browser, 'laptop/normal', { viewport: { width: 1280, height: 720 } }, 'normal');
} finally {
  await browser.close();
}
