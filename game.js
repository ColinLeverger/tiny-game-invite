'use strict';
(() => {
  /* ================= setup ================= */
  // Logical screen: 320x180 in landscape, 180x300 in portrait (phones held upright).
  let W = 320, H = 180, portrait = false;
  const S = 3, T = 16;
  const MAP_W = 72, MAP_H = 28, CITY_W = 48; // x >= 48: Villejean, behind a line of trees (metro only)
  const cv = document.getElementById('game');
  cv.width = W * S; cv.height = H * S;
  const ctx = cv.getContext('2d');
  const FONT = '"Courier New", Courier, monospace';
  const $ = (id) => document.getElementById(id);

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  /* ================= invitation details: URL fragment #i=<base64url JSON> ================= */
  // The fragment never leaves the browser: GitHub Pages never sees the addresses.
  function readInvite() {
    try {
      const m = location.hash.match(/[#&]i=([A-Za-z0-9_-]+)/);
      if (!m) return {};
      let b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      const bytes = Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
      const raw = JSON.parse(new TextDecoder().decode(bytes));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const LIMITS = { b: 80, a: 160, h: 20, s: 160, sh: 20, c1: 20, c2: 20, food: 800, m: 400, f: 60, p: 24 };
      const clean = {};
      for (const [k, max] of Object.entries(LIMITS)) {
        if (typeof raw[k] === 'string' && raw[k].trim()) clean[k] = raw[k].trim().slice(0, max);
      }
      return clean;
    } catch (e) { return {}; }
  }
  const INV = readInvite();
  let playerName = 'toi';
  let hard = false, extreme = false; // extreme = 'EXTRÊME DE LA MORT QUI TUE'
  // The cats' names travel in the private link data, like the bar's address; neutral names otherwise.
  const CAT1 = String(INV.c1 || '').trim().slice(0, 20) || 'Chat noble';
  const CAT2 = String(INV.c2 || '').trim().slice(0, 20) || 'Gros chat';
  const N = (s) => String(s).replace(/\{name\}/g, playerName).replace(/\{c1\}/g, CAT1).replace(/\{c2\}/g, CAT2);
  const escHtml = (t) => String(t).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  // Superstition: nothing claims the thesis is passed before the defence is over (1 Dec 2026, 12:00 Paris = 11:00 UTC).
  const hoping = () => Date.now() < Date.UTC(2026, 11, 1, 11, 0);
  const hope = (s) => (hoping() ? s.replace('Docteure', 'Docteure (on espère)').replace('docteure', 'docteure (on espère)').replace('Thèse validée', 'Thèse validée (on espère)') : s);

  /* ================= sprites ================= */
  function makeSprite(rows, pal) {
    const c = document.createElement('canvas');
    c.width = rows[0].length; c.height = rows.length;
    const x = c.getContext('2d');
    rows.forEach((r, j) => [...r].forEach((ch, i) => {
      if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); }
    }));
    return c;
  }
  function canvasOf(w, h, fn) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    fn((a, b, ww, hh, col) => { x.fillStyle = col; x.fillRect(a, b, ww, hh); }, x);
    return c;
  }
  function flipH(src) {
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
    return c;
  }
  function rotCW(src) {
    const c = document.createElement('canvas'); c.width = src.height; c.height = src.width;
    const x = c.getContext('2d'); x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(src, 0, 0);
    return c;
  }

  // Ketsia: long, light copper curls; tortoiseshell old-school glasses; green dress.
  const PK = { h: '#9a5a2a', H: '#cf8a4c', c: '#eaa868', S: '#f3c9ab', s: '#d9a083', g: '#4a2a14', a: '#b0782f',
    E: '#3b2b2b', m: '#c26b66', D: '#3f8a5a', d: '#2c6a42', y: '#7cc48e', L: '#f0c3a5', K: '#4a3832' };
  const LEGS_A = ['.....LL..LL.....', '.....KK..KK.....'];
  const LEGS_B = ['......LLLL......', '......KKKK......'];
  const K_TOP = ['...h.hchhch.h...', '..hHchHHHcHHch..', '.hHcHHHcHHHcHHh.', 'hHcHHcHHHcHHcHHh'];
  const K_FRONT = [...K_TOP,
    'hcHHSSSSSSSSHHch', 'hHcSgagSSgagSHch', 'hcHSaEggggEaSHch', 'hHHSagaSSagaSHHh',
    'hcHSSSSssSSSSHch', 'hHcHSSSmmSSSHcHh',
    'hHcSdDDDDDDdScHh', 'hcH.SDDyDDyDS.ch', '.hh.dDDDyDDDd.hh', '...dDDDDDDDDd...'];
  const K_BACK = [...K_TOP,
    'hcHHcHHHcHHHcHch', 'hHcHHHcHHHcHHHch', 'hcHHcHHHcHHcHHHh', 'hHHcHHcHHHcHHcHh',
    'hcHHHcHHcHHHcHch', 'hHcHHHcHHcHHHcHh',
    'hcHcHHcHHcHHcHch', '.hcHcHHcHHcHHch.', '..hhcHdDDdHchh..', '...dDDDDDDDDd...'];
  const K_SIDE = ['...h.hchch......', '..hHcHHcHHh.....', '.hHcHHcHHcHh....', 'hHcHHcHHcHHHh...',
    'hcHHcHHHSSSSh...', 'hHcHHcHgagSS....', 'hcHHcHHaEgggS...', 'hHcHHcHgagSSS...',
    'hcHHcHHHSSSs....', 'hHcHHcHHSSmS....',
    'hcHHcHHdDDS.....', 'hHcHcHdDyDDS....', '.hcHhSDDDDyD....', '..hh.dDDDDDd....'];
  const KS = {
    d: [makeSprite([...K_FRONT, ...LEGS_B], PK), makeSprite([...K_FRONT, ...LEGS_A], PK)],
    u: [makeSprite([...K_BACK, ...LEGS_B], PK), makeSprite([...K_BACK, ...LEGS_A], PK)],
    r: [makeSprite([...K_SIDE, ...LEGS_B], PK), makeSprite([...K_SIDE, ...LEGS_A], PK)],
  };
  KS.l = KS.r.map(flipH);

  // Bike (side view and seen from above).
  const BIKE_SIDE = canvasOf(18, 9, (f) => {
    for (const cx of [3.5, 14.5]) for (let j = 0; j < 9; j++) for (let i = 0; i < 18; i++) {
      if (Math.abs(Math.hypot(i + 0.5 - cx, j + 0.5 - 5.5) - 3) < 0.7) f(i, j, 1, 1, '#1d1b22');
    }
    const fr = '#2f8fd0';
    [[4, 5], [5, 4], [6, 4], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 4], [14, 5], [8, 4], [9, 5], [10, 5]]
      .forEach(([i, j]) => f(i, j, 1, 1, fr));
    f(6, 2, 3, 1, '#2a2630'); f(13, 1, 1, 2, '#2a2630'); f(13, 1, 3, 1, '#2a2630');
  });
  const BIKE_V = canvasOf(7, 16, (f) => {
    f(3, 0, 1, 5, '#1d1b22'); f(3, 11, 1, 5, '#1d1b22'); f(3, 5, 1, 6, '#2f8fd0'); f(0, 3, 7, 1, '#2a2630');
  });

  // the big cat: massive (not immense) grey short-hair cat, a bit fearful.
  const PU = { G: '#5f656e', g: '#8d939c', l: '#bcc1c8', e: '#e8cf4a', n: '#e39aa2' };
  const U_BODY = ['...G..........G...G.', '...g.........GgG.GgG', '...G.........GgggggG', '...g.........GgegegG',
    '...G.........GggnggG', '...gGGGGGGGGGGgggggG', '...GgggggggggggggggG', '..GggggggggggggggggG',
    '..Gglllllllllllggg..', '..Gglllllllllllggg..', '...GgggggggggggggG..'];
  const BIGCAT = [makeSprite([...U_BODY, '...Gg.Gg.....Gg.Gg..', '...GG.GG.....GG.GG..'], PU),
    makeSprite([...U_BODY, '....Gg.Gg...Gg.Gg...', '....GG.GG...GG.GG...'], PU)];

  // the noble cat: tiny, noble grey long-hair tom with a white ruff and a huge plumed tail.
  const PT = { F: '#6f747d', f: '#a6abb4', l: '#cfd2d8', w: '#efeff2', e: '#77c3e3', n: '#e39aa2' };
  const T_BODY = ['...........F..F.', '..........FfFFfF', '.ff.......FefefF', 'fFFf......FffnfF',
    'flllf.....wwwwww', 'fFFFFf...wwwwww.', '.flllf..FfwwwwF.', '.fFFFFf.FfflwfF.',
    '..fllllfFffllffF', '...fFFFfFfffffff', '....fllFfffffffF', '.....ffFfffffF..'];
  const NOBLECAT = [makeSprite([...T_BODY, '.......FwF.FwF..'], PT), makeSprite([...T_BODY, '........FwF.FwF.'], PT)];
  const BIGCAT_L = flipH(BIGCAT[0]); // built once: the bar scene used to make a new canvas every frame
  // The cats' heads, for the HUD: lit once the cat follows you.
  const HEAD1 = makeSprite(['F.......F', 'Ff.....fF', 'FfffffffF', 'ffefffeff', 'fffffffff', 'ffffnffff', '.wwwwwww.', '..wwwww..'], PT);
  const HEAD2 = makeSprite(['G.......G', 'Gg.....gG', 'GgggggggG', 'ggegggegg', 'ggggggggg', 'ggggngggg', '.GgggggG.', '..GGGGG..'], PU);

  // The "rapporteur" guarding the bar.
  const PR = { k: '#1e1a22', S: '#e8b896', e: '#ffffff', m: '#9a5550', N: '#2c3a5e', w: '#f2f2f2', R: '#d23c3c', K: '#1e1a22' };
  const RAP = makeSprite(['....kkkkkkkk....', '...kkkkkkkkkk...', '...kSSSSSSSSk...', '...SkkkSSkkkS...',
    '...SkekSSkekS...', '...SSSSSSSSSS...', '....SSSmmSSS....', '.....SSSSSS.....',
    '...NNNNwwNNNN...', '..NNNNNwRNNNNN..', '..NNNNNwRNNNNN..', '..SNNNNNNNNNNS..',
    '...NNNNNNNNNN...', '...NNNN..NNNN...', '...NNNN..NNNN...', '...KKKK..KKKK...'], PR);

  // Ketsia's supervisors. Loïc from his public portrait: curly hair, glasses, stubble, grey hoodie.
  const LOIC = makeSprite(['....hch.hch.....', '..hchhchhchhch..', '..hhSSSSSSSShh..', '...gggggggggg...',
    '...gLEgSSgLEg...', '...ggggSSgggg...', '...SSSSnnSSSS...', '...bSmSSSSmSb...', '....bSmmmmSb....',
    '..OOOYwwYOOOOO..', '..OOYOOOOOOYOO..', '..SOOOOYOOOOOS..', '...OOOOOOOOOO...',
    '...PPPP..PPPP...', '...PPPP..PPPP...', '...KKKK..KKKK...'],
  { h: '#6b4426', c: '#9a6a3a', S: '#e8b896', g: '#9a6a1a', L: '#e3f3fb', E: '#2b2340', n: '#d9a083', m: '#a8605a',
    b: '#d6b08e', O: '#e67e22', Y: '#f7dc6f', w: '#fdf6e3', P: '#2c3a5e', K: '#1e1a22' });
  // Véronique: off to Canada. Short hair, glasses, red coat with a maple leaf, a Canadian-flag suitcase.
  const VERO = makeSprite(['....hhhhhhhh....', '...hhhhhhhhhh...', '...hhSSSSSShh...', '...gggggggggg...',
    '...gLEgSSgLEg...', '...ggggSSgggg...', '....SSSmmSSS....', '...wwwwwwwwww...',
    '..CCCCCCCCCCCC..', '..CCCCCCCCCCCC..', '..SCCCCCCCCCCS..', '...CCCCCCCCCC...',
    '...CCCCCCCCCC...', '...PPPP..PPPP...', '...PPPP..PPPP...', '...KKKK..KKKK...'],
  { h: '#5a3a22', S: '#f0c3a5', g: '#8e44ad', L: '#e3f3fb', E: '#2b2340', m: '#c26b66', w: '#ffffff', C: '#c0392b',
    P: '#2c3a5e', K: '#1e1a22' });
  const SUITCASE = makeSprite(['.....kkk.....', '.....k.k.....', '.RRwwwwwwwRR.', '.RRwwwRwwwRR.', '.RRwRwRwRwRR.',
    '.RRwRRRRRwRR.', '.RRwwRRRwwRR.', '.RRwwwRwwwRR.', '.RRwwwwwwwRR.', '..k.......k..'], { k: '#1e1a22', R: '#d52b1e', w: '#ffffff' });
  // Ioana on her bike, her little girl in the child seat.
  const IOANA_TOP = makeSprite(['....HHHHHHHH....', '...HHHHHHHHHH...', '...hSSSSSSSSh...', '...hSeSSSSeSh...',
    '...hSSSSSSSSh...', '...hSSSmmSSSh...', '...hhSSSSSShh...', '..hhTTTTTTTThh..',
    '..hTTTTTTTTTTh..', '...TTTTTTTTTT...', '...STTTTTTTTS...', '....TTTTTTTT....'],
  { H: '#2fa39a', h: '#3a2618', S: '#f0c3a5', e: '#3b2b2b', m: '#c26b66', T: '#8e44ad' });
  const IOANA = canvasOf(26, 22, (f, x) => {
    x.drawImage(BIKE_SIDE, 6, 13); x.drawImage(IOANA_TOP, 6, 3);
    f(0, 12, 7, 3, '#3a3f4a'); f(1, 10, 5, 3, '#f2c14b'); f(1, 5, 5, 3, '#ff8fb1');
    f(2, 7, 3, 3, '#f3c9ab'); f(3, 8, 1, 1, '#3b2b2b');
  });
  const PIGEON = [
    makeSprite(['.....gg.', '....gneb', 'GGGGGnn.', '.GGGGGG.', '..GGGG..', '...y.y..'],
      { g: '#5c6470', n: '#3f8f6a', e: '#ff7a3a', b: '#c9a07a', G: '#8d939c', y: '#e0a030' }),
    makeSprite(['.G...gg.', 'GG..gneb', 'GGGGGnn.', '.GGGGGG.', '..GGGG..', '........'],
      { g: '#5c6470', n: '#3f8f6a', e: '#ff7a3a', b: '#c9a07a', G: '#8d939c' }),
  ];
  // Reviewer 2, as a ghost (extreme mode only).
  const GHOST = makeSprite(['....wwwwww....', '...wwwwwwww...', '..wwwwwwwwww..', '..wwkkwwkkww..',
    '..wwkkwwkkww..', '..wwwwwwwwww..', '..wwwwkkwwww..', '.wwwwwkkwwwww.', '.wwwwwwwwwwww.',
    'wwwwwwwwwwwwww', 'wwwwrrwwwwwwww', 'wwwwwwwwwwwwww', 'wwwwwwwwwwwwww', 'ww.www.www.www', 'w...w...w...w.'],
  { w: '#eef2f7', k: '#2b2340', r: '#d23c3c' });

  const METRO_ICON = canvasOf(18, 11, (f) => {
    f(0, 0, 18, 9, '#d9534f'); f(0, 6, 18, 1, '#f4f4f4');
    for (const x of [2, 7, 12]) f(x, 2, 4, 3, '#bfe3f2');
    f(3, 9, 2, 2, '#1d1b22'); f(13, 9, 2, 2, '#1d1b22');
  });
  const CLIMB_ICON = canvasOf(12, 18, (f) => {
    f(0, 0, 12, 18, '#8c7f6e');
    [[2, 2, '#e2505e'], [8, 5, '#f2c14b'], [3, 9, '#4fb3e0'], [8, 13, '#6fd06f'], [2, 15, '#c38fd6']].forEach(([x, y, c]) => f(x, y, 2, 2, c));
    f(5, 6, 2, 2, '#f3c9ab'); f(5, 8, 2, 3, '#3f8a5a'); f(4, 11, 1, 2, '#4a3832'); f(7, 11, 1, 2, '#4a3832'); f(6, 0, 1, 6, '#ffffff');
  });

  // What Ketsia fishes out of the Vilaine (she is vegetarian: no fish), and Poulpy the octopus, who tugs the line to tell jokes.
  const GALETTE = makeSprite(['......fff.........', '.SSSBBBBBBBBBBB.ff', 'SsweBbbdbbbbdbbBf.', 'SsssBbbbbdbbbbbBff', 'SsssBbdbbbbbdbbB.f', '.SSSBBBBBBBBBBB...', '.......ff..ff.....'],
    { B: '#7a4a1e', b: '#c08a4a', d: '#8a5a2a', S: '#8a3a30', s: '#c0605a', w: '#ffffff', e: '#1e1a22', f: '#6fb3d9' });
  const VELO = canvasOf(18, 12, (f, x) => {
    x.drawImage(BIKE_SIDE, 0, 0);
    [[3, 8, 3], [5, 9, 3], [12, 8, 4], [15, 9, 2], [9, 5, 3]].forEach(([i, j, h]) => f(i, j, 1, h, '#3f8a49')); // weeds
    f(7, 10, 1, 1, '#6fb3d9'); f(14, 11, 1, 1, '#6fb3d9');
  });
  const CIDRE = makeSprite(['...cc...', '...kk...', '...gg...', '...gg...', '..gggg..', '.gGgggg.', 'gGgggggg', 'gwwwwwwg', 'gwyyyywg', 'gwyrrywg', 'gwyrrywg', 'gwyyyywg', 'gwwwwwwg', 'gGgggggg', 'gGgggggg', 'gggggggg', 'gggggggg', '.gggggg.'],
    { c: '#c8a060', k: '#d23c3c', g: '#3f7a3a', G: '#8fd67a', w: '#f4ead5', y: '#f2c14b', r: '#d23c3c' });
  const THESE = makeSprite(['..wwwwwwwwwwww..', '..wppppppppppws.', '..wpkkkkkkkkpws.', '..wppppppppppws.', '..wpllllllllpws.', '..wppppppppppwb.', '..wpllllllllpws.', '..wppppppppprwb.', '..wpllllprprpws.', '..wppppppprprws.', '..wpppppprpprws.', '..wwwwwwwwwwww..', '...b...b...b....'],
    { w: '#b8b0a0', p: '#efe8d6', k: '#2b2340', l: '#8a8478', r: '#d23c3c', b: '#6fb3d9', s: '#d8d0bc' });
  const TRIATHLETE = makeSprite(['.....RRRRRR.......', '....RRRRRRRR......', '....RRwwRRRR...SS.', '...kBBkkkBBk...SS.', '....SeSSSeSS...SS.', '....SSSSSSSS...S..', '....SSSmmmSS..SS..', '.....SSSSSS..SS...', '..~~~~~~~~~~~~~~~.', '.~~~~~~~~~~~~~~~~~'],
    { R: '#d23c3c', w: '#ffffff', k: '#1e1a22', B: '#6fd0f0', S: '#f0c3a5', e: '#1e1a22', m: '#7a2a2a', '~': '#3d78c0' });
  const POULPY = makeSprite(['....PPPPPP....', '..PPppppppPP..', '.PppppppppppP.', 'PppwwppppwwppP', 'PppweppppewppP', 'PpcppppppppcpP', 'PpppppmmpppppP', '.PppppppppppP.', '.pp.pp..pp.pp.', 'pp..pp..pp..pp', 'p...p.pp.p...p', '.pp..p..p..pp.'],
    { P: '#9a3a6a', p: '#e86a9a', w: '#ffffff', e: '#1e1a22', c: '#ffb0c8', m: '#9a3a6a' });
  // name and sub: the catch screen; a, one, many: the words for the card and the diploma.
  const CATCHES = [
    { key: 'galette', a: 'une galette-saucisse', img: GALETTE, p: 0.3, one: 'galette-saucisse', many: 'galettes-saucisses', name: 'Une galette-saucisse… à nageoires !',
      sub: 'Le poisson typique de Rennes. Ketsia, végétarienne, la rend à la Vilaine avec tout son respect.' },
    { key: 'cidre', a: 'une bouteille de cidre', img: CIDRE, p: 0.25, one: 'bouteille de cidre', many: 'bouteilles de cidre', name: 'Une bouteille de cidre !',
      sub: 'Bien fraîche, pour la fête de ce soir. Youpi ! Elle file au bar.' },
    { key: 'velo', a: 'un vélo', img: VELO, p: 0.22, one: 'vélo', many: 'vélos', name: 'Un vélo !',
      sub: 'Ça arrive plus souvent qu\'on ne croit, dans la Vilaine. Direction la station la plus proche.' },
    { key: 'these', a: 'le chapitre 3 de la thèse (v1)', img: THESE, p: 0.15, one: 'chapitre 3', many: 'chapitres 3', name: 'Le chapitre 3 de la thèse, version 1',
      sub: 'Celui que Ketsia croyait avoir supprimé. Elle le rejette à l\'eau, très vite.' },
    { key: 'triathlete', a: 'un triathlète', img: TRIATHLETE, p: 0.08, one: 'triathlète', many: 'triathlètes', name: 'Un triathlète !',
      sub: 'Trente-quatre ans, bonnet de bain, furieux : « Mon record ! » Il repart en crawl vers le Thabor.' },
  ];
  const POULPY_JOKES = [
    'Un poulpe entre dans un bar et commande huit cidres. « C\'est pour qui ? » « Pour mes bras. »',
    'Mon chiffre préféré ? Le huit. Couché, c\'est l\'infini : j\'ai toujours un bras d\'avance.',
    'J\'ai tenté le transport optimal : huit bras, un seul vélo. Le problème était mal posé.',
    'Pourquoi je ne fais pas de thèse ? Avec huit bras, j\'aurais huit directeurs de thèse.',
  ];

  // Vehicles (drawn facing right, rotated/flipped per lane).
  const CAR_ROWS = ['...kkk.......kkk....', '.CCCCCCCCCCCCCCCCCC.', 'CccccwwwccccwwwwcccY',
    'CccccwwwccccwwwwcccC', 'CccccccccccccccccccC', 'CccccwwwccccwwwwcccC', 'CccccwwwccccwwwwcccY',
    '.CCCCCCCCCCCCCCCCCC.', '...kkk.......kkk....'];
  const TIRE = '#1d1b22', EDGE = '#2a2630', GLASS = '#bfe3f2', LIGHT = '#ffe680';
  function vehicleImg(kind, color) {
    if (kind === 'bus') {
      return canvasOf(36, 11, (f) => {
        f(5, 0, 4, 11, TIRE); f(26, 0, 4, 11, TIRE);
        f(0, 1, 36, 9, EDGE); f(1, 2, 34, 7, color); f(2, 4, 29, 3, '#f4f4f4');
        for (const vx of [5, 14, 23]) f(vx, 4, 4, 3, '#b9bcc4');
        f(32, 2, 2, 7, GLASS); f(35, 2, 1, 2, LIGHT); f(35, 7, 1, 2, LIGHT);
      });
    }
    if (kind === 'truck') {
      return canvasOf(32, 11, (f) => {
        for (const wx of [3, 15, 25]) f(wx, 0, 4, 11, TIRE);
        f(0, 1, 23, 9, EDGE); f(1, 2, 21, 7, '#e6e6ea'); f(1, 5, 21, 1, color);
        f(23, 4, 1, 3, EDGE); f(24, 1, 8, 9, EDGE); f(25, 2, 6, 7, color);
        f(29, 2, 2, 7, GLASS); f(31, 2, 1, 2, LIGHT); f(31, 7, 1, 2, LIGHT);
      });
    }
    return makeSprite(CAR_ROWS, { k: TIRE, C: EDGE, c: color, w: GLASS, Y: LIGHT });
  }

  // Extreme mode's night and the ghost's glow: gradients drawn once, not every frame.
  const NIGHT = canvasOf(840, 840, (f, x) => {
    const g = x.createRadialGradient(420, 420, 16, 420, 420, 62);
    g.addColorStop(0, 'rgba(4,4,14,0)'); g.addColorStop(1, 'rgba(4,4,14,0.96)');
    x.fillStyle = g; x.fillRect(0, 0, 840, 840);
  });
  const HALO = canvasOf(60, 60, (f, x) => {
    const g = x.createRadialGradient(30, 30, 2, 30, 30, 30);
    g.addColorStop(0, 'rgba(190,215,255,0.45)'); g.addColorStop(1, 'rgba(190,215,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 60, 60);
  });

  /* ================= tiles & world ================= */
  function tileCanvas(ch) {
    const c = document.createElement('canvas'); c.width = T; c.height = T;
    const x = c.getContext('2d');
    const px = (i, j, col) => { x.fillStyle = col; x.fillRect(i, j, 1, 1); };
    const box = (i, j, w, h, col) => { x.fillStyle = col; x.fillRect(i, j, w, h); };
    const speck = (cols, n) => { for (let k = 0; k < n; k++) px(rnd() * T | 0, rnd() * T | 0, cols[k % cols.length]); };
    const disc = (cx, cy, r, col) => {
      for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) px(i, j, col);
    };
    const grass = () => { box(0, 0, T, T, '#5f9e4c'); speck(['#548f43', '#6cae58'], 18); };
    const paving = () => {
      box(0, 0, T, T, '#cdb894'); box(0, 15, T, 1, '#b8a27c'); box(15, 0, 1, T, '#b8a27c');
      box(0, 7, T, 1, '#b8a27c'); box(7, 8, 1, 7, '#b8a27c'); speck(['#d8c6a4'], 6);
    };
    const rack = (withBikes) => {
      box(0, 0, T, T, '#c9c6bd'); box(0, 15, T, 1, '#aaa69c');
      for (const i of [2, 7, 12]) {
        box(i, 4, 1, 9, '#7d808a'); box(i + 2, 4, 1, 9, '#7d808a'); box(i, 4, 3, 1, '#7d808a');
        if (withBikes) { box(i + 1, 2, 1, 4, '#1d1b22'); box(i + 1, 10, 1, 4, '#1d1b22'); box(i + 1, 6, 1, 4, '#d9534f'); }
      }
      box(0, 0, T, 2, withBikes ? '#d9534f' : '#8a8f99');
    };
    switch (ch) {
      case '.': grass(); break;
      case 'p': paving(); break;
      case 'q': box(0, 0, T, T, '#d2cdbf'); box(0, 15, T, 1, '#bdb8aa'); box(15, 0, 1, T, '#bdb8aa'); speck(['#dcd8cc'], 5); break;
      case '=': case 'h': box(0, 0, T, T, '#4b4b55'); speck(['#55555f', '#43434c'], 14); break;
      case 'H':
        box(0, 0, T, T, '#a08060'); for (let j = 1; j < T; j += 4) box(0, j, T, 1, '#7a5c40');
        box(0, 0, 2, T, '#5a4030'); box(14, 0, 2, T, '#5a4030'); break;
      case 'J': // fishing pier: planks over the river
        box(0, 0, T, T, '#3d78c0'); speck(['#5b94d6', '#3268a8'], 8);
        box(2, 0, 12, T, '#a07850'); for (let j = 3; j < T; j += 4) box(2, j, 12, 1, '#7a5a38');
        box(2, 0, 1, T, '#6a4a2a'); box(13, 0, 1, T, '#6a4a2a'); box(3, 14, 2, 2, '#4a3020'); box(11, 14, 2, 2, '#4a3020'); break;
      case '~': box(0, 0, T, T, '#3d78c0'); speck(['#5b94d6', '#3268a8'], 10); box(3, 5, 4, 1, '#6aa2e0'); box(10, 11, 4, 1, '#6aa2e0'); break;
      case '#': // Rennes half-timbered house (colombage)
        box(0, 0, T, T, '#e6d5ad'); box(0, 0, T, 2, '#6e4a2c'); box(0, 0, 2, T, '#6e4a2c'); box(8, 0, 2, T, '#6e4a2c');
        box(0, 8, T, 1, '#6e4a2c'); for (let k = 0; k < 6; k++) px(2 + k, 2 + k, '#6e4a2c');
        box(11, 3, 3, 3, '#4f6f96'); box(11, 3, 1, 1, '#9cc0e6'); box(3, 10, 3, 4, '#4f6f96'); box(3, 10, 1, 1, '#9cc0e6');
        box(11, 10, 3, 4, '#4f6f96'); break;
      case 'C': case 'M':
        box(0, 0, T, T, '#b3b7bf'); box(0, 15, T, 1, '#8e929a');
        for (const j of [3, 10]) for (const i of [2, 7, 12]) { box(i, j, 3, 3, '#5d7fa6'); px(i, j, '#a9c6e6'); } break;
      case 'T':
        grass(); disc(8, 9, 7, '#24552d'); disc(8, 8, 6.5, '#2e6b38'); disc(6, 6, 3.5, '#3f8a49'); px(5, 5, '#5aa862'); break;
      case 'f':
        grass(); for (let k = 0; k < 9; k++) {
          const i = 1 + (rnd() * 14 | 0), j = 1 + (rnd() * 14 | 0);
          px(i, j, ['#e2505e', '#f2c14b', '#ffffff', '#e9a3a6'][k % 4]); px(i, j + 1, '#3d7a33');
        } break;
      case 'B':
        box(0, 0, T, T, '#5a3420'); for (let j = 3; j < T; j += 4) box(0, j, T, 1, '#4a2a18');
        box(3, 2, 10, 5, '#ffcf6a'); box(3, 4, 10, 1, '#e0a840'); box(5, 9, 6, 7, '#2e1a0e'); px(9, 12, '#f2c14b'); break;
      case 'D': // Le Diapason: dark violet hall, golden notes, warm windows
        box(0, 0, T, T, '#4a2f5c'); box(0, 0, T, 2, '#2e1d3a');
        box(4, 4, 1, 6, '#f2c14b'); box(2, 9, 3, 2, '#f2c14b'); box(5, 4, 3, 1, '#f2c14b');
        box(10, 9, 4, 4, '#ffcf6a'); box(10, 11, 4, 1, '#e0a840'); break;
      case 'v': rack(true); break;
      case 'o': rack(false); break;
      case 'n': case 'N': // a bench, on grass (n) or on paving (N)
        if (ch === 'n') grass(); else paving();
        box(2, 6, 12, 2, '#8a5a32'); box(2, 9, 12, 2, '#8a5a32'); box(3, 11, 1, 3, '#4a3020'); box(12, 11, 1, 3, '#4a3020'); break;
      case 'e': // metro entrance
        paving(); box(2, 3, 12, 11, '#3a3f4a'); for (let j = 5; j < 14; j += 2) box(3, j, 10, 1, '#5a606c');
        box(5, 0, 6, 3, '#d9534f'); box(7, 1, 2, 1, '#ffffff'); break;
      default: grass();
    }
    return c;
  }

  const grid = Array.from({ length: MAP_H }, () => Array(MAP_W).fill('.'));
  const rect = (x0, y0, x1, y1, ch) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (y >= 0 && y < MAP_H && x >= 0 && x < MAP_W) grid[y][x] = ch;
  };
  const put = (x, y, ch) => { grid[y][x] = ch; };

  // City centre (west): paving, half-timbered blocks, the bar on the north side.
  rect(0, 0, 19, 13, 'p');
  rect(0, 0, 4, 3, '#'); rect(15, 0, 19, 3, '#'); rect(0, 6, 3, 12, '#'); rect(16, 6, 19, 12, '#'); rect(6, 10, 13, 12, '#');
  rect(6, 0, 13, 1, '#'); put(9, 1, 'B'); put(10, 1, 'B');
  put(6, 5, 'T'); put(13, 5, 'T'); put(6, 8, 'T'); put(13, 8, 'T');
  // Parc du Thabor: tree fence, flower beds, cross paths.
  for (let x = 23; x <= 34; x++) { put(x, 2, 'T'); put(x, 12, 'T'); }
  for (let y = 2; y <= 12; y++) { put(23, y, 'T'); put(34, y, 'T'); }
  rect(25, 4, 32, 5, 'f'); rect(25, 9, 32, 10, 'f');
  rect(23, 7, 34, 7, 'p'); rect(28, 3, 29, 12, 'p');
  put(31, 13, 'o'); put(32, 13, 'o'); // empty bike station (bonus challenge)
  // Campus de Beaulieu (east): maths tower with its climbing wall, labs, resto U, metro, bikes.
  rect(38, 7, 42, 7, 'q'); rect(43, 0, 43, 13, 'q'); rect(38, 13, 47, 13, 'q');
  rect(40, 1, 42, 6, 'M');
  rect(44, 1, 47, 4, 'C'); rect(44, 7, 47, 11, 'C');
  rect(41, 16, 46, 17, 'D'); rect(40, 22, 46, 23, 'C'); rect(40, 25, 46, 27, 'C');
  put(46, 12, 'e'); put(16, 4, 'e'); put(11, 23, 'e'); // metro: Beaulieu-Université, Sainte-Anne, Colombier
  put(38, 2, 'T'); put(38, 5, 'T'); put(47, 6, 'T'); put(39, 9, 'T'); put(45, 12, 'T'); put(47, 16, 'T'); put(46, 17, 'T');
  put(44, 5, 'n'); put(41, 12, 'n');
  put(25, 8, 'n'); put(32, 6, 'n'); put(9, 9, 'N'); // benches: Thabor, centre (and the dalle Kennedy, below)
  // South of the river.
  rect(1, 21, 6, 22, '#'); rect(15, 21, 18, 22, '#'); rect(1, 26, 7, 27, '#'); rect(24, 21, 33, 22, '#'); rect(24, 26, 33, 27, '#');
  put(10, 27, 'T'); put(16, 26, 'T'); put(17, 27, 'T'); put(3, 23, 'T');
  for (let x = 0; x < MAP_W; x += 3) if (x < 11 || x > 14) if (grid[18][x] === '.') put(x, 18, 'T');
  put(45, 18, '.'); put(39, 18, '.'); put(42, 18, 'v'); put(43, 18, 'v'); // bike rack tucked behind the Diapason, reached from its west side
  // Roads, river, bridges.
  rect(0, 14, 47, 15, '='); rect(20, 0, 21, 27, '='); rect(36, 0, 37, 27, '='); rect(0, 24, 47, 24, '=');
  rect(0, 19, 47, 20, '~');
  rect(12, 19, 13, 20, 'H'); rect(20, 19, 21, 20, 'h'); rect(36, 19, 37, 20, 'h'); // footbridge, two road bridges
  put(28, 19, 'J'); // the fishing pier
  // Villejean: Rennes 2 (on strike), the dalle Kennedy and its metro, the CHU block ringed by a loop road.
  for (let y = 0; y < MAP_H; y++) { put(48, y, 'T'); put(49, y, y % 2 ? 'T' : '.'); }
  rect(51, 1, 57, 5, 'C'); rect(60, 1, 64, 5, 'C');
  rect(50, 8, 58, 11, 'p'); put(55, 9, 'e'); put(52, 10, 'N');
  rect(53, 16, 58, 21, 'C'); rect(62, 17, 67, 21, 'f');
  rect(51, 14, 70, 14, '='); rect(51, 24, 70, 24, '='); rect(51, 14, 51, 24, '='); rect(70, 14, 70, 24, '=');
  for (let y = 13; y <= 25; y++) put(50, y, 'T');
  for (const [x, y] of [[60, 9], [66, 8], [68, 11], [52, 26], [60, 26], [66, 26], [64, 16], [62, 12], [69, 3]]) put(x, y, 'T');

  const SOLID = new Set(['#', 'C', 'M', 'T', '~', 'B', 'D']);
  const ROADISH = new Set(['=', 'h']);
  const TOWER = { x: 40 * T, y: 1 * T, w: 3 * T, h: 6 * T };
  const world = document.createElement('canvas');
  world.width = MAP_W * T; world.height = MAP_H * T;
  (() => {
    const w = world.getContext('2d');
    const cache = {};
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const ch = grid[y][x];
      // Trees, flowers and grass get a fresh variant per tile; the rest share one.
      const tile = '.Tf'.includes(ch) ? tileCanvas(ch) : (cache[ch] = cache[ch] || tileCanvas(ch));
      w.drawImage(tile, x * T, y * T);
      if (ROADISH.has(ch)) { // curbs where a road meets something else
        w.fillStyle = '#8a8a94';
        const isRoad = (xx, yy) => xx < 0 || yy < 0 || xx >= MAP_W || yy >= MAP_H || ROADISH.has(grid[yy][xx]);
        if (!isRoad(x, y - 1)) w.fillRect(x * T, y * T, T, 1);
        if (!isRoad(x, y + 1)) w.fillRect(x * T, y * T + T - 1, T, 1);
        if (!isRoad(x - 1, y)) w.fillRect(x * T, y * T, 1, T);
        if (!isRoad(x + 1, y)) w.fillRect(x * T + T - 1, y * T, 1, T);
      }
    }
    w.fillStyle = '#e8e2c0'; // lane markings
    for (let x = 0; x < CITY_W * T; x += 12) if (![20, 21, 36, 37].includes(Math.floor(x / T))) w.fillRect(x, 15 * T, 6, 1);
    for (const lx of [21 * T, 37 * T]) for (let y = 0; y < world.height; y += 12) {
      const ty = Math.floor(y / T); if (ty !== 14 && ty !== 15 && ty !== 24) w.fillRect(lx, y, 1, 6);
    }
    // The maths tower: concrete floors, windows, and a climbing wall up its east face.
    const { x: tx, y: ty, w: tw, h: th } = TOWER;
    w.fillStyle = 'rgba(0,0,0,.28)'; w.fillRect(tx + tw, ty + 6, 9, th);
    w.fillStyle = '#c4c7ce'; w.fillRect(tx, ty, tw, th);
    w.fillStyle = '#a9adb5'; w.fillRect(tx, ty, 3, th);
    for (let y = ty + 6; y < ty + th - 8; y += 8) {
      w.fillStyle = '#9ea2aa'; w.fillRect(tx, y, tw, 1);
      for (let x = tx + 5; x < tx + 30; x += 6) {
        w.fillStyle = '#4f6f96'; w.fillRect(x, y + 2, 3, 4); w.fillStyle = '#9cc0e6'; w.fillRect(x, y + 2, 1, 1);
      }
    }
    w.fillStyle = '#8c7f6e'; w.fillRect(tx + 33, ty + 4, 13, th - 4);
    w.fillStyle = '#7a6e5f'; w.fillRect(tx + 33, ty + 4, 1, th - 4);
    const holds = ['#e2505e', '#f2c14b', '#4fb3e0', '#6fd06f', '#c38fd6', '#ff8c42'];
    for (let k = 0; k < 70; k++) {
      w.fillStyle = holds[k % holds.length];
      w.fillRect(tx + 35 + (rnd() * 9 | 0), ty + 6 + (rnd() * (th - 10) | 0), 1 + (rnd() * 2 | 0), 1 + (rnd() * 2 | 0));
    }
    w.fillStyle = '#7d828b'; w.fillRect(tx, ty, tw, 4);
    w.fillStyle = '#5a5f68'; w.fillRect(tx + 10, ty - 7, 1, 7); w.fillRect(tx + 8, ty - 5, 5, 1);
    w.fillStyle = '#3a3f4a'; w.fillRect(tx + 16, ty + th - 7, 9, 7);
    w.fillStyle = '#f4f4f4'; // chalk dust at the foot of the climbing wall
    for (const [i, j] of [[36, 1], [38, 2], [41, 1], [43, 3], [39, 4], [45, 2]]) w.fillRect(tx + i, ty + th + j, 1, 1);
  })();

  const LABELS = [
    { t: 'Tour des maths · IRMAR', x: 41.5 * T, y: 7.7 * T },
    { t: 'Campus de Beaulieu', x: 45.6 * T, y: 6.1 * T },
    { t: 'Resto U', x: 45.6 * T, y: 9.6 * T },
    { t: 'Métro Beaulieu', x: 45.4 * T, y: 12.4 * T },
    { t: 'Métro Sainte-Anne', x: 16.5 * T, y: 4.4 * T },
    { t: 'Station vide', x: 32 * T, y: 13.4 * T },
    { t: 'Parc du Thabor', x: 29 * T, y: 1.5 * T },
    { t: 'Le Diapason', x: 43.8 * T, y: 17.1 * T },
    { t: 'Fac de sciences éco', x: 3.4 * T, y: 5.5 * T },
    { t: 'Rennes 2', x: 54 * T, y: 2.6 * T },
    { t: 'GRÈVE', x: 54 * T, y: 4.2 * T, c: '#ff6b6b' },
    { t: 'Métro Villejean-Université', x: 55.5 * T, y: 8.4 * T },
    { t: 'Dalle Kennedy', x: 53 * T, y: 12.4 * T },
    { t: 'CHU', x: 55.5 * T, y: 18.9 * T },
    { t: 'Villejean', x: 64 * T, y: 12.5 * T, c: '#9cc0e6' },
    { t: 'Centre-ville', x: 10 * T, y: 7.1 * T },
    { t: 'BAR', x: 10 * T, y: 0.8 * T, c: '#f2c14b' },
    { t: 'La Vilaine', x: 31.5 * T, y: 20.2 * T },
    { t: 'Ponton', x: 28.5 * T, y: 17.6 * T },
    { t: 'Passerelle', x: 13 * T, y: 18.3 * T },
    { t: 'Métro Colombier', x: 11.5 * T, y: 22.4 * T },
  ];

  /* ================= entities ================= */
  const START = { x: 41 * T + 8, y: 9 * T + 12 };
  const player = { x: START.x, y: START.y, dir: 'd', anim: 0, moving: false };
  let checkpoint = { ...START };
  let trail = [];
  const BIGCAT_SPOTS = [[12, 26], [28, 25], [9, 22], [17, 25]].map(([x, y]) => ({ x: x * T + 8, y: y * T + 12 }));
  const cats = [
    { key: 'cat1', name: '{c1}', x: 31 * T + 8, y: 8 * T + 12, frames: NOBLECAT, solved: false, order: -1 },
    { key: 'cat2', name: '{c2}', x: BIGCAT_SPOTS[0].x, y: BIGCAT_SPOTS[0].y, frames: BIGCAT, solved: false, order: -1,
      spot: 0, run: null, fled: 0 },
  ];
  const bigcat = cats[1];
  const rap = { x: 10 * T, y: 3 * T + 12, wasNear: false };
  const bikeSpot = { x: 43 * T, y: 18 * T + 10, wasNear: false };
  const STATIONS = [
    { name: 'Beaulieu-Université', tx: 46, ty: 12, out: { x: 46.5 * T, y: 13.7 * T } },
    { name: 'Sainte-Anne', tx: 16, ty: 4, out: { x: 16.5 * T, y: 5.7 * T } },
    { name: 'Colombier', tx: 11, ty: 23, out: { x: 11.5 * T, y: 22.7 * T } },
    { name: 'Villejean-Université', tx: 55, ty: 9, out: { x: 55.5 * T, y: 10.7 * T } },
  ];
  let metro = null, metroLock = -1;
  const otSpot = { x: 32 * T, y: 13 * T + 10, wasNear: false };
  let solvedCount = 0, hasBike = false, otDone = false;
  const SUPS = [
    { key: 'loic', name: 'Loïc', x: 40 * T + 8, y: 17 * T + 12, img: LOIC, found: false, wasNear: false },
    { key: 'vero', name: 'Véronique', x: 4 * T + 8, y: 9 * T + 12, img: VERO, found: false, wasNear: false },
    { key: 'ioana', name: 'Ioana', x: 51 * T + 8, y: 14 * T + 14, img: IOANA, found: false, seg: 0, cool: 0, flip: false },
  ];
  const IOANA_LOOP = [[51, 14], [70, 14], [70, 24], [51, 24]].map(([x, y]) => ({ x: x * T + 8, y: y * T + 14 }));
  const PIGEON_SPOTS = [[8, 6], [11, 4], [12, 8], [14, 6], [7, 3]].map(([x, y]) => ({ x: x * T + 8, y: y * T + 10 }));
  const pigeon = { x: PIGEON_SPOTS[0].x, y: PIGEON_SPOTS[0].y, spot: 0, fly: null, linger: 0, flip: false };
  // Three choke points: the Thabor's west gate, the south end of the footbridge, the centre's south entrance.
  const GHOST_SPOTS = [[22, 7], [12.5, 21], [14, 13]].map(([x, y]) => ({ x: x * T + 8, y: y * T + 6 }));
  const ghost = { x: GHOST_SPOTS[0].x, y: GHOST_SPOTS[0].y, on: false, awake: false, cool: 0 };
  function ghostHome() {
    const sp = GHOST_SPOTS[Math.floor(rnd() * GHOST_SPOTS.length)];
    ghost.x = sp.x; ghost.y = sp.y; ghost.awake = false;
  }
  const following = () => cats.filter((c) => c.solved && !c.escaped).sort((a, b) => a.order - b.order);
  const catActive = (c) => !c.solved || c.escaped;
  const fragments = () => following().length;
  const supsFound = () => SUPS.filter((p) => p.found).length;

  // 8-bit sound effects, off by default (iOS needs a tap before any audio anyway).
  let audio = null, soundOn = false;
  function tone(freq, dur, type = 'square', vol = 0.05, slide = 0, delay = 0) {
    if (!soundOn || !audio) return;
    const t0 = audio.currentTime + delay, o = audio.createOscillator(), g = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.linearRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    return { src: o, g, end: t0 + dur };
  }
  let noiseBuf = null;
  function noise(dur, vol, filter, freq, delay = 0) { // drums and the metro's rumble
    if (!soundOn || !audio) return null;
    if (!noiseBuf) {
      noiseBuf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = audio.currentTime + delay, src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
    src.buffer = noiseBuf; f.type = filter; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(audio.destination); src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
    return { src, g, end: t0 + dur };
  }
  const SFX = {
    meow: () => { tone(700, 0.22, 'triangle', 0.08, 350); tone(1050, 0.3, 'triangle', 0.06, -550, 0.2); },
    purr: () => { for (let i = 0; i < 4; i++) tone(70, 0.12, 'sawtooth', 0.035, 8, i * 0.13); },
    bell: () => { tone(1800, 0.14, 'square', 0.035); tone(1800, 0.14, 'square', 0.035, 0, 0.17); },
    chime: () => [660, 550, 440].forEach((f, i) => tone(f, 0.35, 'sine', 0.08, 0, i * 0.28)),
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'square', 0.045, 0, i * 0.09)),
    hit: () => tone(140, 0.32, 'sawtooth', 0.08, -90),
    ghost: () => { tone(320, 0.7, 'sine', 0.07, -220); tone(330, 0.7, 'sine', 0.04, -200, 0.05); },
    coo: () => { tone(420, 0.12, 'sine', 0.06, 80); tone(390, 0.16, 'sine', 0.06, -70, 0.14); },
    hello: () => { tone(587, 0.1, 'square', 0.04); tone(880, 0.16, 'square', 0.04, 0, 0.11); },
  };
  /* ----- music: one original 8-bit track per scene, scheduled a little ahead on the audio clock ----- */
  // It plays whenever the sound is on and stops by itself when the tab is hidden (no frames, no notes).
  // Notation: one token per step; "C5", "F#4", "Bb3" a note, "=" holds the previous one, "-" a rest.
  // Drums, one character per step: k kick, s snare, x kick+snare, h hi-hat, c rail clack, . nothing.
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  function seq(text) {
    const toks = text.trim().split(/\s+/), out = toks.map(() => null);
    toks.forEach((t, i) => {
      const m = t.match(/^([A-G])([#b]?)(\d)$/);
      if (!m) return;
      let len = 1; while (toks[i + len] === '=') len++;
      const midi = 12 * (Number(m[3]) + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
      out[i] = [hz(midi), len];
    });
    return out;
  }
  // Bass from chord roots, one chord per bar of 8 steps ("D/G" splits a bar): pattern per step, "R" root, "F" fifth, "O" octave.
  function bassLine(chords, oct, pattern) {
    const semi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const root = (c) => 12 * (oct + 1) + semi[c[0]] + (c[1] === '#' ? 1 : c[1] === 'b' ? -1 : 0);
    const out = [];
    for (const bar of chords.split(' ')) {
      const parts = bar.split('/');
      for (let k = 0; k < 8; k++) {
        const ch = pattern[k];
        if (!'RFO'.includes(ch)) { out.push(null); continue; }
        const r = root(parts[Math.floor(k * parts.length / 8)]);
        let len = 1; while (pattern[k + len] === '=') len++;
        out.push([hz(ch === 'F' ? r + 7 : ch === 'O' ? r + 12 : r), len]);
      }
    }
    return out;
  }
  const TRACKS = {
    // Walking around Rennes: a cheerful theme in two parts (128 steps, about 24 s).
    map: { step: 0.19, leadType: 'square', leadVol: 0.012, bassType: 'triangle', bassVol: 0.03, drums: 'k.h.s.h.k.k.s.h.', drumVol: 0.5,
      lead: seq(`E5 G5 C6 G5 E5 = D5 C5  E5 = A4 C5 E5 = D5 C5  A4 C5 F5 = A5 = G5 F5  G5 = = D5 B4 = - -
                 E5 G5 C6 G5 E5 = D5 C5  A5 = G5 E5 C5 = E5 G5  F5 E5 D5 = B4 C5 D5 B4  C5 = = = - G4 A4 B4
                 C5 = A4 C5 F5 = E5 F5  D5 = B4 D5 G5 = F5 G5  E5 = G5 B5 G5 = E5 D5  C5 = E5 A5 = G5 E5 C5
                 A5 = G5 F5 C5 = F5 A5  B5 = A5 G5 D5 = G5 B5  C6 = G5 E5 C5 E5 G5 C6  B5 = G5 = D5 = B4 D5`),
      bass: bassLine('C A F G C A D/G C F G E A F G C G', 3, 'R=F=R=F=') },
    // Puzzles: slow, thoughtful arpeggios in A minor.
    puzzle: { step: 0.24, leadType: 'triangle', leadVol: 0.035, bassType: 'triangle', bassVol: 0.03, drums: null,
      lead: seq(`A4 C5 E5 C5 A4 C5 E5 C5  A4 C5 F5 C5 A4 C5 F5 C5  G4 C5 E5 C5 G4 C5 E5 C5  G#4 B4 E5 B4 G#4 B4 E5 B4
                 A4 C5 E5 C5 A4 C5 E5 C5  A4 D5 F5 D5 A4 D5 F5 D5  G#4 B4 E5 B4 G#4 B4 D5 B4  A4 C5 E5 A5 = = - -`),
      bass: bassLine('A F C E A D E A', 2, 'R=======') },
    // The climbing wall: EPIC. Driving D minor, octave bass, full drums.
    epic: { step: 0.13, leadType: 'square', leadVol: 0.016, bassType: 'sawtooth', bassVol: 0.022, drums: 'khskkhsh', drumVol: 0.8,
      lead: seq(`D5 = A4 D5 F5 = E5 D5  D5 = F5 = Bb5 = A5 F5  E5 = G5 = C6 = Bb5 G5  C#6 = A5 = E5 = C#5 E5
                 F5 = A5 D6 = C6 A5 F5  F5 = Bb5 D6 = C6 Bb5 F5  G5 Bb5 D6 Bb5 A5 C#6 E6 C#6  D6 = = = A5 = D6 =
                 G5 = Bb5 = D6 = C6 Bb5  A5 = F5 = D5 = F5 A5  Bb5 = D6 = F6 = E6 D6  C#6 = E6 = A6 = G6 E6
                 G6 = = F6 E6 = D6 =  F6 = = E6 D6 = A5 =  G#5 = B5 = E6 = D6 B5  C#6 = E6 = A6 = = =`),
      bass: bassLine('D Bb C A D Bb G/A D G D Bb A G D E/A A', 2, 'RORORORO') },
    // The metro: a little bossa groove; while the train rolls, rails clack and the tunnel rumbles.
    metro: { step: 0.17, leadType: 'triangle', leadVol: 0.04, bassType: 'triangle', bassVol: 0.03, drums: 'c.c..h..', drumVol: 0.7,
      lead: seq(`A4 = C5 = F5 E5 D5 C5  Bb4 = D5 = G5 F5 E5 D5  C5 = E5 = A5 G5 F5 E5  F5 = = = - - C5 D5
                 A4 = C5 = F5 G5 A5 F5  G5 = Bb5 = A5 G5 F5 D5  E5 = G5 = C6 Bb5 G5 E5  F5 = = = - - - -`),
      bass: bassLine('F Bb C F F Bb C F', 2, 'R.F.R.F.'),
      fx: (i, d, step) => { if (state === 'metro') noise(step * 1.6, 0.06, 'lowpass', 140 + 50 * Math.sin(i), d); } },
    // Fishing on the Vilaine: a lazy, sunny tune.
    fishing: { step: 0.22, leadType: 'triangle', leadVol: 0.04, bassType: 'triangle', bassVol: 0.028, drums: '....h...', drumVol: 0.4,
      lead: seq(`C5 = = A4 F4 = A4 C5  D5 = = C5 A4 = - -  Bb4 = = D5 F5 = D5 Bb4  C5 = = = - - - -
                 A4 = C5 = F5 = E5 D5  G4 = Bb4 = D5 = C5 Bb4  A4 = = G4 F4 = = =  - - - - - - C5 D5`),
      bass: bassLine('F D Bb C F G C F', 2, 'R...F...') },
    // The party at the bar: four on the floor, pumping bass, a festive tune in G.
    party: { step: 0.14, leadType: 'square', leadVol: 0.014, bassType: 'square', bassVol: 0.016, drums: 'khxhkhxh', drumVol: 0.8,
      lead: seq(`B4 D5 G5 D5 B5 = A5 G5  G5 = E5 = B4 E5 G5 B5  C6 = B5 A5 G5 E5 G5 =  F#5 = A5 = D6 = C6 A5
                 B5 = D6 B5 G5 = B5 D6  E6 = D6 B5 G5 = E5 G5  A5 G5 E5 C5 E5 G5 C6 E6  D6 = C6 = A5 = F#5 A5
                 E6 = D6 C6 G5 = E5 G5  F#6 = E6 D6 A5 = F#5 A5  D6 = B5 = F#5 = B5 D6  E6 = = B5 G5 = E5 =
                 C6 E6 G6 E6 C6 = G5 E5  D6 F#6 A6 F#6 D6 = A5 F#5  G6 = D6 B5 G5 = D6 =  G6 = = = - G5 A5 B5`),
      bass: bassLine('G E C D G E C D C D B E C D G G', 2, 'RORORORO') },
  };
  function drum(ch, d, vol) {
    if (ch === 'k' || ch === 'x') tone(130, 0.12, 'sine', 0.1 * vol, -90, d);
    if (ch === 's' || ch === 'x') noise(0.12, 0.05 * vol, 'bandpass', 1800, d);
    if (ch === 'h') noise(0.03, 0.03 * vol, 'highpass', 7000, d);
    if (ch === 'c') { noise(0.05, 0.08 * vol, 'bandpass', 2600, d); tone(190, 0.04, 'square', 0.015 * vol, 0, d); }
  }
  const musicScene = () => {
    if (state === 'end') return 'party';
    if (state === 'metro' || state === 'metroMenu') return 'metro';
    if (state === 'puzzle' && puzzle) return /escalade/.test(puzzle.label) ? 'epic' : puzzle.free ? 'fishing' : 'puzzle';
    return 'map';
  };
  let musicAt = 0, musicStep = 0, musicNow = '', musicNodes = [];
  function musicTick() {
    if (!soundOn || !audio || audio.state !== 'running' || state === 'name') { musicAt = 0; musicNow = ''; return; }
    const now = audio.currentTime, sc = musicScene();
    if (sc !== musicNow) { // new scene: fade out what is still sounding, start the new track from the top
      for (const n of musicNodes) if (n.end > now) { try { n.g.gain.cancelScheduledValues(now); n.g.gain.setTargetAtTime(0.0001, now, 0.03); n.src.stop(now + 0.2); } catch (e) { /* already stopped */ } }
      musicNodes = []; musicNow = sc; musicStep = 0; musicAt = now + 0.1;
    }
    if (musicAt < now) musicAt = now + 0.05;
    const tr = TRACKS[sc];
    musicNodes = musicNodes.filter((n) => n.end > now);
    while (musicAt < now + 0.3) {
      const d = musicAt - now, i = musicStep;
      const L = tr.lead[i % tr.lead.length], B = tr.bass[i % tr.bass.length];
      if (L) musicNodes.push(tone(L[0], L[1] * tr.step * 0.92, tr.leadType, tr.leadVol, 0, d));
      if (B) musicNodes.push(tone(B[0], B[1] * tr.step * 0.9, tr.bassType, tr.bassVol, 0, d));
      if (tr.drums) drum(tr.drums[i % tr.drums.length], d, tr.drumVol);
      if (tr.fx) tr.fx(i, d, tr.step);
      musicAt += tr.step; musicStep++;
    }
    musicNodes = musicNodes.filter(Boolean);
  }
  const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function unlockAudio() {
    if (!audio) return;
    try {
      if (audio.state !== 'running' && audio.resume) audio.resume();
      const src = audio.createBufferSource(); src.buffer = audio.createBuffer(1, 1, 22050);
      src.connect(audio.destination); src.start(0); // a silent sample, played inside the gesture, unlocks iOS
    } catch (e) { /* ignore */ }
  }
  function setSound(on, quiet, persist = true) {
    soundOn = on; if (persist) store.set('invite-sound', on ? 'on' : 'off');
    if (on) {
      try {
        // iOS 17+: the "playback" session plays even with the silent switch on.
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        unlockAudio();
      } catch (e) { soundOn = false; }
      setTimeout(() => SFX.hello(), 60);
      if (!quiet && state === 'play') showToast(IOS ? 'Son activé ♪ (rien ? regarde le bouton silencieux)' : 'Son activé ♪', 2.4);
    }
    const b = document.querySelector('#pad button[data-k=sound]'); if (b) b.textContent = soundOn ? '♪' : '×';
    const c = $('soundOn'); if (c && persist) c.checked = soundOn; // the initial muted state must not untick the saved preference
  }

  const LANES = [
    { axis: 'x', pos: 14 * T + 8, dir: 1, speed: 52, at: [[0, 'car', '#d64545'], [250, 'bus', '#c0392b'], [520, 'car', '#f2c14b']] },
    { axis: 'x', pos: 15 * T + 8, dir: -1, speed: 44, at: [[120, 'truck', '#3f7fd6'], [400, 'car', '#5fb36a'], [680, 'car', '#e8e8e8']] },
    { axis: 'y', pos: 20 * T + 8, dir: 1, speed: 46, at: [[0, 'car', '#e0a030'], [230, 'bus', '#2e86c1']] },
    { axis: 'y', pos: 21 * T + 8, dir: -1, speed: 38, at: [[120, 'car', '#5fb36a'], [340, 'truck', '#d35400']] },
    { axis: 'y', pos: 36 * T + 8, dir: 1, speed: 42, at: [[40, 'car', '#9b59b6'], [300, 'bus', '#c0392b']] },
    { axis: 'y', pos: 37 * T + 8, dir: -1, speed: 50, at: [[180, 'car', '#e8e8e8'], [400, 'truck', '#7f8c8d']] },
    { axis: 'x', pos: 24 * T + 8, dir: 1, speed: 46, at: [[60, 'truck', '#16a085'], [420, 'car', '#f08a5d']] },
  ];
  const cars = [];
  for (const ln of LANES) {
    for (const [a, kind, color] of ln.at) {
      const horiz = ln.axis === 'x';
      const r = vehicleImg(kind, color), l = flipH(r);
      cars.push({
        horiz, dir: ln.dir, speed: ln.speed,
        x: horiz ? a : ln.pos, y: horiz ? ln.pos : a,
        img: horiz ? (ln.dir > 0 ? r : l) : (ln.dir > 0 ? rotCW(r) : rotCW(l)),
      });
    }
  }
  let trafficMul = 1;

  /* ================= state ================= */
  let state = 'name'; // name | dialog | play | puzzle | end
  let dlg = null, puzzle = null;
  let toast = '', toastT = 0, invul = 0, time = 0;
  const keys = { up: false, down: false, left: false, right: false, sneak: false };
  const stats = { played: false, start: 0, end: 0, hits: 0, dist: 0, pets: 0, metro: 0, puzzles: [], met: [] };
  const meet = (k) => { if (!stats.met.includes(k)) stats.met.push(k); }; // what this guest ran into, in order

  const WHO = {
    '': '#f2c14b', Ketsia: '#e9a3a6', '{c1}': '#c8ccd4', '{c2}': '#aab0b8', Rapporteur: '#e06060', 'Le jury': '#9cc0e6', Colin: '#7fb3e0',
  };
  function say(lines, done) {
    dlg = { lines: lines.map(([who, text]) => ({ who: N(who), key: who, text: N(text) })), i: 0, t: 0, done };
    state = 'dialog';
  }
  function advance() {
    if (!dlg) return;
    const cur = dlg.lines[dlg.i];
    if (dlg.t < cur.text.length) { dlg.t = cur.text.length; return; }
    dlg.i++; dlg.t = 0;
    if (dlg.i >= dlg.lines.length) {
      const done = dlg.done; dlg = null; state = 'play';
      if (done) done();
    }
  }
  function skipDialog() { // jump to the end of the whole conversation
    if (!dlg) return;
    const done = dlg.done; dlg = null; state = 'play';
    if (done) done();
  }
  function showToast(t, d = 2.6) { toast = N(t); toastT = d; }

  /* ================= story ================= */
  function intro() {
    const seen = store.get('invite-seen-intro') === 'yes';
    store.set('invite-seen-intro', 'yes');
    const lines = seen ? [
      ['Ketsia', 'Re-bonjour {name} ! Tu connais l\'histoire : mes chats, {c2} et {c1}, ont filé avec ma démonstration. On y retourne ?'],
    ] : [
      ['', 'Rennes, mardi 1er décembre 2026, campus Hoche. Ketsia vient de soutenir sa thèse : partitionner des graphes, avec du transport optimal, pour comprendre la circulation en ville.'],
      ['Le jury', hope('Après délibération… félicitations, Docteure !')],
      ['', 'Ketsia file récupérer ses affaires à son labo, à Beaulieu, au pied de la tour des maths.'],
      ['Ketsia', 'Ouf ! Maintenant, la fête, au bar. Mais le rapporteur garde la porte : il veut revoir la démonstration de ma dernière diapo.'],
      ['Ketsia', 'Problème : mes deux chats, {c2} et {c1}, s\'étaient glissés dans mon sac. Ils viennent de filer, chacun avec un morceau de la démonstration !'],
      ['Ketsia', '{name}, tu m\'aides à retrouver mes chats ? {c1} adore le Parc du Thabor. {c2} est sûrement parti au sud de la Vilaine.'],
      ['', 'Déplace Ketsia avec les flèches, ZQSD ou le pavé tactile. Attention aux voitures, aux bus et aux camions : la circulation, c\'est son sujet de thèse, pas son sport.'],
      ['', 'Astuce : une station de vélos se cache quelque part sur le campus. Et le métro mène loin.'],
    ];
    if (!seen) lines.push(['Ketsia', 'Ah, et si tu croises mes trois encadrant·es quelque part dans Rennes (Loïc, Ioana et Véronique), invite-les aussi !']);
    stats.played = true; stats.start = Date.now();
    if (extreme) { ghost.on = true; ghostHome(); }
    if (extreme) lines.push(['', 'Mode EXTRÊME DE LA MORT QUI TUE : nuit noire, circulation folle, chaque accident te renvoie au campus, pas d\'aide, et le jury chronomètre les puzzles. Le métro roule en service minimum. {c2} est terrorisé (pas de loup obligatoire : Maj ou bouton B).']);
    if (extreme) lines.push(['', 'Et le Reviewer 2 somnole quelque part, à un passage stratégique. S\'il te repère, il te suit : file avant qu\'il ne te touche. S\'il t\'attrape, ou si une voiture te percute, les chats s\'enfuient.']);
    else if (hard) lines.push(['', 'Mode difficile : {c2} est très craintif. Approche-le à pas de loup (maintiens Maj, ou le bouton B).']);
    say(lines);
  }

  function meetCat(cat) {
    SFX.meow();
    if (cat.key === 'cat1') {
      say([
        ['{c1}', 'Mrrp.'],
        ['', '{c1} trône au milieu des massifs, la queue en panache. Noble parmi les nobles.'],
        ['Ketsia', '{c1} ! Rends-moi le morceau de ma démonstration !'],
        ['', '{c1} pose une patte aristocratique sur un graphe de carrefours tout emmêlé. Il faut le partitionner en 3 quartiers.'],
      ], () => startPuzzle(makePartition(), () => catSolved(cat), () => { cat.wait = true; }));
    } else {
      say([
        ['{c2}', 'MRAOU.'],
        ['', '{c2} est très gros. Pas immense. Mais très gros. Et un peu craintif.'],
        ['Ketsia', '{c2}, qu\'est-ce que tu as fait de mon graphe ?'],
        ['', '{c2} est assis sur deux plans de carrefours : Rennes et Châteaubourg. Ce sont les mêmes routes, mais dessinées autrement.'],
        ['Ketsia', 'C\'est l\'idée de Gromov-Wasserstein : comparer deux réseaux sans savoir quel point va avec quel point. On ne regarde que les distances.'],
        ['Ketsia', 'Ta mission : donner à chaque carrefour de Rennes son jumeau à Châteaubourg. Deux carrefours reliés à Rennes doivent l\'être aussi à Châteaubourg.'],
        ['Ketsia', 'Astuce : le chiffre dans chaque rond, c\'est son nombre de routes. Un carrefour à 3 routes va avec un carrefour à 3 routes. Commence par lui !'],
      ], () => startPuzzle(makeMatching(), () => catSolved(cat), () => { cat.wait = true; }));
    }
  }

  function catSolved(cat) {
    meet(cat.key);
    cat.solved = true; cat.order = solvedCount++;
    checkpoint = { x: player.x, y: player.y };
    trail = [];
    const lines = cat.key === 'cat1'
      ? [['{c1}', 'Prrrt.'], ['', '{c1} lâche le morceau de démonstration et te suit, la queue haute, comme à la parade.']]
      : [['{c2}', 'Mraou…'], ['', '{c2} se lève. Lentement. Il lâche le morceau de démonstration et te suit, en restant prudemment derrière.']];
    if (solvedCount === 1) lines.push(['', 'Astuce : touche un chat qui te suit (ou Espace) pour le caresser.']);
    lines.push(solvedCount === 2
      ? ['Ketsia', 'Mes deux chats, et toute ma démonstration ! Direction le bar, au centre-ville : le rapporteur nous attend.']
      : ['Ketsia', `Un chat sur deux ! Il reste ${cats.find((c) => !c.solved).name}.`]);
    say(lines);
  }

  function bigcatFlee() {
    bigcat.fled++;
    // Run to the hiding spot farthest from Ketsia.
    let best = bigcat.spot, bd = -1;
    BIGCAT_SPOTS.forEach((s, i) => { if (i !== bigcat.spot) { const d = dist(s, player); if (d > bd) { bd = d; best = i; } } });
    bigcat.spot = best; bigcat.run = BIGCAT_SPOTS[best];
    showToast(hard ? '{c2} a filé ! Approche à pas de loup : Maj ou bouton B.' : '{c2} est craintif… il a filé un peu plus loin !');
  }

  let rapStage = 0;
  function meetRapporteur() {
    if (fragments() < 2) {
      say([['Rapporteur', 'Halte. Il manque des morceaux à votre démonstration. Revenez avec les deux chats… et ce qu\'ils ont emporté.']]);
      return;
    }
    const finish = () => say([
      ['Rapporteur', hope(extreme ? 'Trois sur trois. Thèse validée, sans corrections. Entrez !' : 'Anomalie détectée. Thèse validée. Entrez !')],
      ['Ketsia', 'Merci {name} ! Sans toi, {c2} serait encore assis sur Châteaubourg.'],
      ['', 'Les deux chats filent sous une banquette. L\'invitation est à toi.'],
    ], () => { meet('rap'); showCard(); });
    // The exam remembers how far you got (rapStage), so quitting at question 2 or 3 resumes there.
    const q3 = () => startPuzzle(makeQuiz('Rapporteur · question 3', 'Rapporteur · question 3',
      'Qui a posé le problème du transport optimal, en 1781 ?', ['Leonhard Euler', '{c2}', 'Gaspard Monge'], 2), finish);
    const q2 = () => startPuzzle(makeQuiz('Rapporteur · question 2', 'Rapporteur · question 2',
      'Quelle distance compare deux réseaux sans savoir quel carrefour correspond à quel carrefour ?',
      ['Distance de Manhattan', 'Gromov-Wasserstein', 'Distance à vol de pigeon'], 1), () => { rapStage = 2; q3(); });
    const anomaly = () => startPuzzle(makeAnomaly(), () => { if (extreme) { rapStage = 1; q2(); } else finish(); });
    if (extreme && rapStage > 0) {
      say([['Rapporteur', `Reprenons. Question ${rapStage + 1}.`]], rapStage === 1 ? q2 : q3);
      return;
    }
    say([
      ['Rapporteur', extreme ? 'Je suis le rapporteur. Trois questions avant d\'entrer. Pas une de moins.' : 'Je suis le rapporteur. Une dernière question avant d\'entrer.'],
      ['Rapporteur', 'Voici des trajets de voitures. L\'un d\'eux est une anomalie. Lequel ?'],
    ], anomaly);
  }
  function makeQuiz(title, label, q, opts, good) {
    const boxes = () => {
      const h = portrait ? 22 : 18, top = portrait ? H * 0.42 : 70;
      return opts.map((_, i) => ({ x: 15, y: top + i * (h + 6), w: W - 30, h }));
    };
    return {
      title, label, help: [q], noGuide: true,
      draw() { boxes().forEach((b, i) => button(b, N(opts[i]))); status(''); },
      tap(x, y) {
        const i = boxes().findIndex((b) => inBox(b, x, y));
        if (i < 0) return;
        if (i === good) win(); else { this.wrong++; this.msg = 'Faux ! Le rapporteur fronce les sourcils.'; }
      },
    };
  }

  /* ----- side quest: the three supervisors ----- */
  const SUP_TALK = {
    loic: [
      ['Loïc', 'Oh, Ketsia ! Je viens de fumer une clope, j\'y retourne : je prépare mon cours de mécanique de demain.'],
      ['Loïc', 'Demain, je fais vibrer une poutre de Timoshenko devant les L3. Avec une guitare. Ils comprennent les modes propres. La guitare, moins.'],
      ['Loïc', 'Une corde de guitare, c\'est une équation des ondes avec du groove. D\'ailleurs, sur FIP, ils viennent d\'enchaîner Coltrane et une cumbia péruvienne. Sans transition. Du génie.'],
      ['Ketsia', 'Tu viens au bar ce soir ?'],
      ['Loïc', 'J\'arrive dès que ce morceau se termine. Il dure trente-six minutes.'],
    ],
    vero: [
      ['Véronique', 'Ketsia ! Tu tombes bien : tu sais si on a droit à deux valises en soute pour le Canada ?'],
      ['Véronique', 'J\'ai mis trois pulls, deux bonnets, des chaussettes en laine… et ton manuscrit, pour l\'avion. Six cents pages, ça cale bien la valise.'],
      ['Véronique', 'Là-bas, il fera moins vingt. Je compte sur le bar pour me réchauffer avant le départ !'],
      ['Ketsia', 'Alors à ce soir, et bon voyage !'],
    ],
    ioana: [
      ['Ioana', 'Oups ! Pardon, je ne t\'avais pas vu·e ! On fait le tour du quartier, la petite adore le vent dans le casque.'],
      ['La petite', 'Ba-ba ! Vélooo !'],
      ['Ioana', 'Rennes 2 est encore en grève, le campus est bloqué. J\'ai déplacé mon cours trois fois cette semaine…'],
      ['Ioana', 'Bref ! Ce soir, si la petite s\'endort à l\'heure, je passe au bar.'],
    ],
  };
  function meetSup(p) {
    if (p.found) return;
    SFX.hello();
    say(SUP_TALK[p.key], () => {
      p.found = true; meet(p.key);
      const n = supsFound();
      if (n === 3) { SFX.win(); say([['Ketsia', 'Mes trois encadrant·es au bar ! Première réunion d\'encadrement… avec des tapas.']]); }
      else showToast(`Encadrant·e retrouvé·e : ${n} / 3`);
    });
  }
  function recatch(c) {
    c.escaped = false; SFX.meow();
    say([[c.name, c.key === 'cat1' ? 'Mrrp ?' : 'Mraou…'], ['', `${c.name} accepte de te suivre à nouveau, avec son morceau de démonstration.`]]);
  }
  function escapeCat(c) {
    c.escaped = true; c.wait = false;
    if (c.key === 'cat1') { c.x = 31 * T + 8; c.y = 8 * T + 12; }
    else { c.spot = Math.floor(rnd() * BIGCAT_SPOTS.length); c.x = BIGCAT_SPOTS[c.spot].x; c.y = BIGCAT_SPOTS[c.spot].y; c.run = null; }
  }

  function meetBikes() {
    if (hasBike) return;
    say([
      ['Ketsia', 'Une station de vélos ! J\'ai passé trois ans à modéliser ces flux-là.'],
      ['', 'Ketsia emprunte un vélo. Mode vélo : deux fois plus rapide. Pour marcher à pas de loup, maintiens Maj (ou le bouton B).'],
      ['Ketsia', 'Oh, et la station près du Thabor est toujours vide le soir. Un défi bonus, si tu veux.'],
    ], () => { hasBike = true; SFX.bell(); meet('bike'); showToast('Défi bonus débloqué : la station vide, au sud du Thabor.', 3.5); });
  }

  function meetEmptyStation() {
    if (otDone) return;
    if (!hasBike) {
      say([['Ketsia', 'Une station vide… Il faudrait un vélo pour comprendre le problème. Il y en a sur le campus.']]);
      return;
    }
    say([
      ['Ketsia', 'Le grand classique : le soir, certaines stations débordent et d\'autres sont vides.'],
      ['Ketsia', 'Il faut déplacer les vélos en roulant le moins possible. C\'est le problème de Monge, de 1781 : le transport optimal, au cœur de ma thèse.'],
    ], () => startPuzzle(makeTransport(), () => {
      otDone = true; meet('ot');
      say([
        ['Ketsia', 'Transport optimal ! Monge et Kantorovich seraient fiers de toi, {name}.'],
        ['', 'Badge Monge-Kantorovich débloqué. Il apparaîtra sur ton invitation.'],
      ]);
    }));
  }

  /* ================= puzzles ================= */
  const PCOL = ['#e07a5f', '#81b29a', '#f2cc8f', '#7fb3e0', '#c38fd6'];
  let carry = {}; // errors and hints of a puzzle that was quit, so quitting does not wipe them
  function startPuzzle(p, done, onQuit) {
    p.title = N(p.title); p.label = N(p.label); p.help = p.help.map(N);
    const c = carry[p.label] || { wrong: 0, hints: 0 };
    puzzle = Object.assign(p, { time: 0, wonT: -1, msg: '', done, onQuit, wrong: c.wrong, hints: c.hints, skipped: false, guided: false, guideText: '' });
    state = 'puzzle';
  }
  function quitPuzzle(why) {
    if (!puzzle || puzzle.wonT >= 0) return;
    carry[puzzle.label] = { wrong: puzzle.wrong, hints: puzzle.hints };
    const q = puzzle.onQuit; puzzle = null; state = 'play';
    showToast(why || 'Pas de souci, tu pourras revenir quand tu veux.');
    if (q) q();
  }
  // Puzzles are laid out in landscape coordinates (x 30..290, y 36..158). In portrait the
  // layout is transposed into the tall screen; only positions move, text stays upright.
  let pmap = { ox: 0, oy: 0, sx: 1, sy: 1 };
  const PM = (x, y) => (portrait ? [pmap.ox + (y - 36) * pmap.sx, pmap.oy + (x - 30) * pmap.sy] : [x + (W - 320) / 2, y]);
  function hitNode(nodes, x, y, r = 12) {
    let best = -1, bd = r;
    nodes.forEach(([nx, ny], i) => { const [mx, my] = PM(nx, ny); const d = Math.hypot(mx - x, my - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function line(x1, y1, x2, y2, col, w = 1.5, dash = null) {
    [x1, y1] = PM(x1, y1); [x2, y2] = PM(x2, y2);
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
  }
  function node(x, y, fill, ring, r = 6) {
    [x, y] = PM(x, y);
    ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ring; ctx.lineWidth = 1.5; ctx.stroke();
  }
  function blink(x, y, r, col = '#ffffff') { // pulsing ring used by the step-by-step help
    if (Math.floor(time * 4) % 2) return;
    [x, y] = PM(x, y);
    ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
  }
  function centered(t, x, y, col, size = 7) { // screen coordinates
    ctx.fillStyle = col; ctx.font = `bold ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(t, x, y + size * 0.36);
  }
  const ctext = (t, x, y, col, size) => { const [mx, my] = PM(x, y); centered(t, mx, my, col, size); };
  function sideLabel(t, x, y) { // a graph title: above it in landscape, along the left edge in portrait
    if (!portrait) return centered(t, x, y, '#f4ead5', 8);
    const [, my] = PM(x, y);
    ctx.save(); ctx.translate(7, my); ctx.rotate(-Math.PI / 2); centered(t, 0, 0, '#f4ead5', 7); ctx.restore();
  }
  function button(b, label, on = false) {
    ctx.fillStyle = on ? '#8a6d2a' : '#4a4060'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#f4ead5'; ctx.lineWidth = 0.6; ctx.strokeRect(b.x + 0.3, b.y + 0.3, b.w - 0.6, b.h - 0.6);
    centered(label, b.x + b.w / 2, b.y + b.h / 2, '#f4ead5', 7);
  }
  const inBox = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));

  // 1. the noble cat: graph partitioning into 3 districts with minimum cut.
  function makePartition() {
    const nodes = [[60, 74], [102, 54], [90, 116], [152, 64], [192, 48], [178, 102], [232, 124], [274, 94], [262, 146]];
    const edges = [[0, 1], [1, 2], [0, 2], [3, 4], [4, 5], [3, 5], [6, 7], [7, 8], [6, 8], [1, 3], [5, 7], [2, 6]];
    const CLUSTER = [0, 0, 0, 1, 1, 1, 2, 2, 2];
    const col = nodes.map(() => -1);
    const cut = (a) => edges.filter(([u, v]) => a[u] !== a[v]).length;
    const sizesOk = (a) => { const c = [0, 0, 0]; a.forEach((k) => k >= 0 && c[k]++); return c.every((n) => n >= 2); };
    let best = 99; const a = Array(9).fill(0);
    for (let code = 0; code < 19683; code++) {
      let c = code; for (let i = 0; i < 9; i++) { a[i] = c % 3; c = (c / 3) | 0; }
      if (sizesOk(a)) best = Math.min(best, cut(a));
    }
    const guide = () => { // keep the colours the player already chose, fix the rest
      const pm = perms([0, 1, 2]).reduce((b, p) => {
        const s = col.filter((k, i) => k === p[CLUSTER[i]]).length; return s > b.s ? { p, s } : b;
      }, { p: [0, 1, 2], s: -1 }).p;
      const i = col.findIndex((k, n) => k !== pm[CLUSTER[n]]);
      return i < 0 ? null : { i, target: pm[CLUSTER[i]] };
    };
    return {
      title: '{c1} · Partitionnement', label: '{c1} · partitionnement',
      help: ['Touche un rond pour changer sa couleur : 3 quartiers, au moins 2 carrefours chacun.', 'But : le moins de routes possible entre deux couleurs différentes.'],
      draw() {
        for (const [u, v] of edges) {
          const [x1, y1] = nodes[u], [x2, y2] = nodes[v];
          if (col[u] < 0 || col[v] < 0) line(x1, y1, x2, y2, '#6b6580');
          else if (col[u] === col[v]) line(x1, y1, x2, y2, '#f4ead5', 2);
          else line(x1, y1, x2, y2, '#e05050', 1.5, [3, 2]);
        }
        nodes.forEach(([x, y], i) => node(x, y, col[i] < 0 ? '#4a4560' : PCOL[col[i]], '#16131f', 7));
        if (this.guided) {
          const g = guide();
          if (g) blink(...nodes[g.i], 11, PCOL[g.target]);
          this.guideText = 'Aide : chaque triangle forme un quartier. Touche le rond qui clignote jusqu\'à ce qu\'il prenne la couleur de l\'anneau.';
        }
        const full = col.every((k) => k >= 0);
        status(`Routes coupées : ${full ? cut(col) : '?'}   ·   objectif : ${best}`);
      },
      tap(x, y) {
        const i = hitNode(nodes, x, y);
        if (i < 0) return;
        col[i] = (col[i] + 1) % 3;
        this.msg = '';
        if (col.every((k) => k >= 0)) {
          if (!sizesOk(col)) { this.msg = 'Chaque quartier doit avoir au moins 2 carrefours.'; this.wrong++; }
          else if (cut(col) === best) win();
          else this.wrong++;
        }
      },
    };
  }

  // 2. the big cat: match Rennes to Châteaubourg so that every road is kept (graph isomorphism,
  //    the discrete heart of Gromov-Wasserstein: only distances matter, not labels).
  function makeMatching() {
    const L = [[40, 76], [82, 100], [124, 76], [134, 130], [70, 142]];
    const LE = [[0, 1], [1, 2], [2, 3], [1, 4]];
    const R = [[238, 102], [286, 150], [198, 62], [284, 62], [236, 148]];
    const RE = [[0, 3], [0, 2], [0, 4], [4, 1]];
    const PERM = [3, 0, 4, 1, 2]; // one valid answer, used by the step-by-step help
    const key = (u, v) => (u < v ? `${u}-${v}` : `${v}-${u}`);
    const adjR = new Set(RE.map(([u, v]) => key(u, v)));
    const deg = (n, E) => Array.from({ length: n }, (_, i) => E.filter(([u, v]) => u === i || v === i).length);
    const DL = deg(5, LE), DR = deg(5, RE);
    const pair = Array(5).fill(-1);
    let sel = 1;
    const kept = () => LE.filter(([u, v]) => pair[u] >= 0 && pair[v] >= 0 && adjR.has(key(pair[u], pair[v]))).length;
    const check = (self) => {
      sel = pair.indexOf(-1);
      if (sel >= 0) { self.msg = ''; return; }
      const k = kept();
      if (k === LE.length) win();
      else self.wrong++, self.msg = `${LE.length - k} route${LE.length - k > 1 ? 's cassées' : ' cassée'} (en rouge) : échange des carrefours, ou demande l'aide.`;
    };
    return {
      title: '{c2} · Gromov-Wasserstein', label: '{c2} · Gromov-Wasserstein',
      help: ['Touche un rond de Rennes, puis son jumeau à Châteaubourg.', 'Chiffre = nombre de routes. Route verte = conservée, rouge = cassée.'],
      draw() {
        sideLabel('Rennes', 88, 46); sideLabel('Châteaubourg', 242, 46);
        line(160, 44, 160, 150, '#3a3450', 1, [2, 3]);
        for (const [u, v] of LE) {
          let c = '#f4ead5';
          if (pair[u] >= 0 && pair[v] >= 0) c = adjR.has(key(pair[u], pair[v])) ? '#7fd67f' : '#e05050';
          line(...L[u], ...L[v], c, 2);
        }
        for (const [u, v] of RE) line(...R[u], ...R[v], '#f4ead5', 2);
        pair.forEach((j, i) => { if (j >= 0) line(...L[i], ...R[j], PCOL[i] + '88', 1, [2, 2]); });
        L.forEach(([x, y], i) => { node(x, y, PCOL[i], i === sel ? '#ffffff' : '#16131f', i === sel ? 8.5 : 7.5); ctext(String(DL[i]), x, y, '#16131f', 8); });
        R.forEach(([x, y], j) => {
          const i = pair.indexOf(j);
          node(x, y, i >= 0 ? PCOL[i] : '#4a4560', '#16131f', 7.5); ctext(String(DR[j]), x, y, i >= 0 ? '#16131f' : '#f4ead5', 8);
        });
        if (this.guided) {
          const i = [1, 2, 0, 3, 4].find((k) => pair[k] !== PERM[k]);
          if (i !== undefined && sel !== i) { blink(...L[i], 12); this.guideText = 'Aide : touche le rond qui clignote, à Rennes.'; }
          else if (i !== undefined) { blink(...R[PERM[i]], 12, PCOL[i]); this.guideText = 'Aide : touche maintenant son jumeau qui clignote, à Châteaubourg.'; }
        }
        status(sel >= 0 ? `Routes conservées : ${kept()} / 4 · choisis le jumeau du rond blanc` : `Routes conservées : ${kept()} / 4`);
      },
      tap(x, y) {
        const li = hitNode(L, x, y);
        if (li >= 0) { sel = li; this.msg = ''; return; }
        const rj = hitNode(R, x, y);
        if (rj < 0 || sel < 0) return;
        for (let i = 0; i < 5; i++) if (pair[i] === rj) pair[i] = -1;
        pair[sel] = rj;
        check(this);
      },
    };
  }

  // 3. Rapporteur: spot the anomalous trajectory.
  function makeAnomaly() {
    const paths = [
      [[40, 148], [40, 106], [118, 106], [118, 84], [154, 84]],
      [[284, 42], [204, 42], [204, 80], [166, 80]],
      [[284, 148], [244, 148], [244, 92], [166, 88]],
      [[36, 42], [110, 42], [110, 74], [154, 74]],
      [[150, 152], [150, 124], [96, 124], [96, 146], [212, 146], [212, 114], [176, 114], [176, 138], [132, 138]],
    ];
    const ANOM = 4;
    const lens = paths.map((p) => p.slice(1).reduce((s, q, k) => s + Math.hypot(q[0] - p[k][0], q[1] - p[k][1]), 0));
    const at = (i, f) => {
      const p = paths[i]; let d = f * lens[i];
      for (let k = 1; k < p.length; k++) {
        const seg = Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]);
        if (d <= seg) return [p[k - 1][0] + (p[k][0] - p[k - 1][0]) * d / seg, p[k - 1][1] + (p[k][1] - p[k - 1][1]) * d / seg];
        d -= seg;
      }
      return p[p.length - 1];
    };
    const segDist = (x, y, [ax, ay], [bx, by]) => {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
      return Math.hypot(x - ax - t * dx, y - ay - t * dy);
    };
    let picked = -1;
    return {
      title: 'Le rapporteur · Anomalie', label: 'Rapporteur · anomalie',
      help: ['Les trajets normaux vont vers le centre (l\'étoile).', 'Touche la trajectoire anormale.'],
      draw() {
        for (let x = 30; x <= 290; x += 20) line(x, 38, x, 156, '#2a2540', 1);
        for (let y = 38; y <= 156; y += 20) line(30, y, 290, y, '#2a2540', 1);
        paths.forEach((p, i) => {
          const pulse = this.guided && i === ANOM && !(Math.floor(time * 4) % 2);
          ctx.strokeStyle = pulse ? '#ffffff' : PCOL[i]; ctx.lineWidth = picked === i || pulse ? 3 : 1.8; ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(...PM(...p[0])); p.slice(1).forEach((q) => ctx.lineTo(...PM(...q))); ctx.stroke();
          const speed = i === ANOM ? 0.16 + 0.08 * Math.sin(time * 2) : 0.22;
          const [dx, dy] = at(i, ((time * speed) + i * 0.21) % 1);
          node(dx, dy, '#ffffff', PCOL[i], 2.5);
        });
        ctext('★', 160, 80, '#f2c14b', 12);
        if (this.guided) this.guideText = 'Aide : la trajectoire violette tourne en rond et n\'arrive jamais au centre. Touche-la.';
        status('');
      },
      tap(x, y) {
        let best = -1, bd = 9;
        paths.forEach((p, i) => { for (let k = 1; k < p.length; k++) { const d = segDist(x, y, PM(...p[k - 1]), PM(...p[k])); if (d < bd) { bd = d; best = i; } } });
        if (best < 0) return;
        picked = best;
        if (best === ANOM) win();
        else { this.msg = 'Celle-ci est normale : elle va vers le centre.'; this.wrong++; }
      },
    };
  }

  // Bonus: optimal transport (Monge). Move one bike from each full station to an empty one,
  // with the smallest total distance in blocks. Greedy gives 15, the optimum is 13.
  function makeTransport() {
    const G = ([gx, gy]) => [40 + gx * 20, 50 + gy * 20];
    const src = [[1, 1], [6, 4], [11, 1]].map(G);
    const dst = [[4, 4], [7, 0], [12, 4]].map(G);
    const n = src.length;
    const cost = (i, j) => (Math.abs(src[i][0] - dst[j][0]) + Math.abs(src[i][1] - dst[j][1])) / 20;
    const OPT = perms([...Array(n).keys()]).reduce((b, p) => {
      const c = p.reduce((s, j, i) => s + cost(i, j), 0); return c < b.c ? { p, c } : b;
    }, { p: null, c: Infinity });
    const best = OPT.c;
    const asg = Array(n).fill(-1);
    let sel = -1;
    const total = () => asg.reduce((s, j, i) => s + (j >= 0 ? cost(i, j) : 0), 0);
    return {
      title: 'Bonus · Transport optimal', label: 'Bonus · transport optimal',
      help: ['Les stations +1 ont un vélo en trop, les −1 en manquent.', 'Touche un +1 puis un −1 pour y amener le vélo. Roule le moins possible au total !'],
      draw() {
        for (let gx = 0; gx <= 12; gx++) line(40 + gx * 20, 50, 40 + gx * 20, 150, '#2a2540', 1);
        for (let gy = 0; gy <= 5; gy++) line(40, 50 + gy * 20, 280, 50 + gy * 20, '#2a2540', 1);
        asg.forEach((j, i) => {
          if (j < 0) return;
          const [x1, y1] = src[i], [x2, y2] = dst[j];
          line(x1, y1, x2, y1, PCOL[i], 2); line(x2, y1, x2, y2, PCOL[i], 2);
          ctext(String(cost(i, j)), (x1 + x2) / 2, y1 - 6, PCOL[i], 7);
        });
        src.forEach(([sx, sy], i) => {
          const [x, y] = PM(sx, sy);
          ctx.fillStyle = asg[i] >= 0 ? '#5a5070' : '#e07a5f'; ctx.fillRect(x - 7, y - 7, 14, 14);
          ctx.strokeStyle = i === sel ? '#ffffff' : PCOL[i]; ctx.lineWidth = i === sel ? 2 : 1; ctx.strokeRect(x - 7, y - 7, 14, 14);
          centered('+1', x, y, '#16131f', 7);
        });
        dst.forEach(([dx, dy], j) => {
          const [x, y] = PM(dx, dy);
          const i = asg.indexOf(j);
          ctx.fillStyle = i >= 0 ? PCOL[i] : '#7fb3e0'; ctx.fillRect(x - 7, y - 7, 14, 14);
          centered(i >= 0 ? '✓' : '−1', x, y, '#16131f', 7);
          if (sel >= 0) centered(`${cost(sel, j)}`, x + 12, y - 10, '#f2c14b', 7); // distance preview
        });
        if (this.guided) {
          const i = asg.findIndex((j, k) => j !== OPT.p[k]);
          if (i >= 0 && sel !== i) { blink(...src[i], 12); this.guideText = 'Aide : touche la station +1 qui clignote.'; }
          else if (i >= 0) { blink(...dst[OPT.p[i]], 12, PCOL[i]); this.guideText = 'Aide : amène son vélo à la station −1 qui clignote. Le plus proche n\'est pas toujours le mieux pour tous !'; }
        }
        const done = asg.filter((j) => j >= 0).length;
        status(done < n ? `Vélos déplacés : ${done} / ${n} · distance : ${total()}${sel >= 0 ? ' · chiffres jaunes = distance' : ''}` : `Distance totale : ${total()} · meilleur possible : ${best}`);
      },
      tap(x, y) {
        const si = hitNode(src, x, y, 13);
        if (si >= 0) { sel = si; asg[si] = -1; this.msg = ''; return; }
        const dj = hitNode(dst, x, y, 13);
        if (dj < 0 || sel < 0) return;
        for (let i = 0; i < n; i++) if (asg[i] === dj) asg[i] = -1;
        asg[sel] = dj;
        sel = asg.indexOf(-1);
        if (sel < 0) {
          if (total() === best) win();
          else this.wrong++, this.msg = `Total ${total()}, mais ${best} est possible : le plus proche pour chacun n'est pas le mieux pour tous. Touche un +1 pour changer.`;
        }
      },
    };
  }

  // Easter egg: climb the maths tower. Tap the side of the next hold; a wrong side slips you down.
  function makeClimb() {
    const N = 22;
    const sides = Array.from({ length: N }, (_, i) => (i < 2 ? i % 2 : (rnd() < 0.5 ? 0 : 1)));
    const HOLD = ['#e2505e', '#f2c14b', '#4fb3e0', '#6fd06f', '#c38fd6', '#ff8c42'];
    let prog = 0, shown = 0, shake = 0;
    return {
      title: 'Tour des maths · Escalade', label: 'Easter egg · escalade', noGuide: true,
      help: ['Touche la moitié gauche ou droite de l\'écran (ou ← →),', 'du côté de la prise qui clignote. Grimpe jusqu\'au sommet !'],
      tick(dt) { shown += (prog - shown) * Math.min(1, dt * 10); if (shake > 0) shake -= dt; },
      press(side) {
        if (this.wonT >= 0) return;
        if (side === sides[prog]) { prog++; this.msg = ''; if (prog >= N) win(); }
        else { prog = extreme ? 0 : Math.max(0, prog - 2); this.wrong++; shake = 0.3; this.msg = 'Glissade ! Regarde bien de quel côté est la prise.'; }
      },
      draw() {
        const top = portrait ? 50 : 36, bottom = portrait ? H - 42 : H - 22;
        const base = bottom - 30, sp = 20, cx = W / 2;
        const skyY = base - (N - shown) * sp;
        ctx.fillStyle = '#8c7f6e'; ctx.fillRect(cx - 44, top, 88, bottom - top);
        if (skyY > top) {
          ctx.fillStyle = '#9cc0e6'; ctx.fillRect(cx - 44, top, 88, Math.min(bottom, skyY) - top);
          ctx.fillStyle = '#7d828b'; ctx.fillRect(cx - 46, Math.min(bottom, skyY) - 3, 92, 3);
          centered('Sommet !', cx, Math.max(top + 8, skyY - 12), '#2b2340', 8);
        }
        for (let i = Math.max(0, Math.floor(shown) - 3); i < Math.min(N, Math.floor(shown) + 8); i++) {
          const y = base - (i - shown) * sp;
          if (y < top + 4 || y > bottom - 4) continue;
          const x = cx + (sides[i] ? 18 : -18);
          ctx.fillStyle = HOLD[i % HOLD.length]; ctx.fillRect(x - 4, y - 3, 8, 6);
          if (i === prog && Math.floor(time * 4) % 2) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 7, y - 6, 14, 12); }
        }
        const lean = prog > 0 ? (sides[prog - 1] ? 6 : -6) : 0;
        const jitter = shake > 0 ? Math.sin(time * 80) * 2 : 0;
        ctx.drawImage(KS.u[prog % 2], Math.round(cx - 8 + lean + jitter), Math.round(base - 6));
        ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(cx + lean, top, 0.6, base - 6 - top); // rope
        ctx.fillStyle = '#4a4560'; ctx.fillRect(W - 10, top, 4, bottom - top);
        ctx.fillStyle = '#f2c14b'; ctx.fillRect(W - 10, bottom - (bottom - top) * prog / N, 4, (bottom - top) * prog / N);
        status(`Hauteur : ${prog} / ${N} prises`);
      },
      tap(x) { this.press(x < W / 2 ? 0 : 1); },
    };
  }

  function win() { if (puzzle && puzzle.wonT < 0) { puzzle.wonT = 0; puzzle.solvedAt = puzzle.time; SFX.win(); } }
  function status(t) {
    ctx.textAlign = 'center'; ctx.font = `bold 7px ${FONT}`;
    const guide = !puzzle.msg && puzzle.guided && puzzle.guideText;
    ctx.fillStyle = puzzle.msg ? '#ff8a80' : guide ? '#f2c14b' : '#f4ead5';
    const lines = wrap(puzzle.msg || (guide ? puzzle.guideText : t), W - 10);
    const base = (portrait ? H - 20 : H - 5) - (lines.length - 1) * 8;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, base + i * 8));
  }
  // Puzzle buttons: top-right in landscape, a thumb row at the bottom in portrait.
  const quitBox = () => (portrait ? { x: 6, y: H - 15, w: 48, h: 12 } : { x: W - 52, y: 4, w: 48, h: 12 });
  const helpBox = () => (portrait ? { x: W / 2 - 24, y: H - 15, w: 48, h: 12 } : { x: W - 104, y: 4, w: 48, h: 12 });
  const skipBox = () => (portrait ? { x: W - 60, y: H - 15, w: 56, h: 12 } : { x: W - 164, y: 4, w: 56, h: 12 }); // "Passer (100)": skip, 100 points
  const SKIP_AFTER = 15, PUZZLE_LIMIT = 45;

  function drawPuzzle() {
    ctx.fillStyle = '#1d1a2b'; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'left'; ctx.fillStyle = '#f2c14b'; ctx.font = `bold ${portrait ? 8 : 9}px ${FONT}`;
    let y = 12;
    for (const l of wrap(puzzle.title, W - (portrait ? 12 : 172))) { ctx.fillText(l, 6, y); y += 10; }
    ctx.fillStyle = '#c9c3dc'; ctx.font = `7px ${FONT}`;
    for (const h of puzzle.help) for (const l of wrap(h, W - 12)) { ctx.fillText(l, 6, y); y += 8; }
    if (portrait) pmap = { ox: 18, oy: y + 10, sx: (W - 36) / 122, sy: (H - 50 - y - 10) / 260 };
    puzzle.draw();
    if (puzzle.wonT < 0) {
      button(quitBox(), puzzle.free ? 'Ranger' : 'Quitter');
      if (!puzzle.noGuide && !extreme) button(helpBox(), puzzle.guided ? 'Aide ✓' : 'Aide', puzzle.guided);
      if (puzzle.time > SKIP_AFTER && !extreme && !puzzle.free) button(skipBox(), 'Passer (100)');
      if (extreme && !puzzle.free) {
        const left = Math.max(0, Math.ceil(PUZZLE_LIMIT - puzzle.time));
        const b = helpBox();
        centered(`⏱ ${left} s`, b.x + b.w / 2, b.y + b.h / 2, left < 10 ? '#ff6b6b' : '#f2c14b', 8);
      }
    } else {
      ctx.fillStyle = 'rgba(20,16,32,.7)'; ctx.fillRect(0, H / 2 - 17, W, 34);
      centered('Bravo !', W / 2, H / 2, '#f2c14b', 16);
    }
  }
  function puzzleTap(x, y) {
    if (!puzzle || puzzle.wonT >= 0) return;
    if (inBox(quitBox(), x, y)) { quitPuzzle(puzzle.quitMsg && puzzle.quitMsg()); return; }
    if (!puzzle.noGuide && !extreme && inBox(helpBox(), x, y)) {
      puzzle.guided = !puzzle.guided; puzzle.msg = '';
      if (puzzle.guided && !puzzle.hints) puzzle.hints = 1;
      return;
    }
    if (puzzle.time > SKIP_AFTER && !extreme && !puzzle.free && inBox(skipBox(), x, y)) { puzzle.skipped = true; win(); return; }
    puzzle.tap(x, y);
  }

  /* ================= movement & collisions ================= */
  const rapBox = () => ({ x0: rap.x - 7, x1: rap.x + 7, y0: rap.y - 8, y1: rap.y });
  function blocked(x, y) {
    const pts = [[x - 4, y - 3], [x + 4, y - 3], [x - 4, y], [x + 4, y]];
    for (const [px, py] of pts) {
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
      if (SOLID.has(grid[ty][tx])) return true;
    }
    const b = rapBox();
    return x + 4 > b.x0 && x - 4 < b.x1 && y > b.y0 && y - 3 < b.y1;
  }
  const onBike = () => hasBike && !keys.sneak;
  // Touch: Ketsia walks toward the finger (hold to steer, tap to send her there).
  let moveTarget = null, pointerHeld = false, stuckT = 0, lastCam = { cx: 0, cy: 0 };
  function updatePlayer(dt) {
    let vx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let vy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (vx || vy) moveTarget = null;
    else if (moveTarget) {
      const dx = moveTarget.x - player.x, dy = moveTarget.y - player.y, d = Math.hypot(dx, dy);
      if (d < 3) { if (!pointerHeld) moveTarget = null; } else { vx = dx / d; vy = dy / d; }
    }
    player.moving = !!(vx || vy);
    if (!player.moving) return;
    if (Math.abs(vx) === 1 && Math.abs(vy) === 1) { vx *= 0.7071; vy *= 0.7071; }
    player.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'r' : 'l') : (vy > 0 ? 'd' : 'u');
    const speed = keys.sneak ? 30 : (hasBike ? 140 : 72);
    player.anim += dt * (keys.sneak ? 0.5 : 1);
    const sp = speed * dt, ox = player.x, oy = player.y;
    if (!blocked(player.x + vx * sp, player.y)) player.x += vx * sp;
    if (!blocked(player.x, player.y + vy * sp)) player.y += vy * sp;
    const moved = Math.hypot(player.x - ox, player.y - oy);
    stats.dist += moved;
    if (moveTarget && !pointerHeld && moved < sp * 0.2) { stuckT += dt; if (stuckT > 0.8) moveTarget = null; } else stuckT = 0;
    const last = trail[trail.length - 1];
    if (!last || Math.hypot(last.x - player.x, last.y - player.y) >= 1) {
      trail.push({ x: player.x, y: player.y });
      if (trail.length > 160) trail.shift();
    }
  }
  function updateCars(dt) {
    const m = 40;
    for (const c of cars) {
      if (c.horiz) { c.x += c.dir * c.speed * trafficMul * dt; if (c.x > CITY_W * T + 20) c.x = -m; if (c.x < -m) c.x = CITY_W * T + 20; }
      else { c.y += c.dir * c.speed * trafficMul * dt; if (c.y > world.height + m) c.y = -m; if (c.y < -m) c.y = world.height + m; }
    }
  }
  function carHit() {
    for (const c of cars) {
      const hw = c.img.width / 2 - 1, hh = c.img.height / 2 - 1;
      if (player.x + 4 > c.x - hw && player.x - 4 < c.x + hw && player.y > c.y - hh && player.y - 8 < c.y + hh) return true;
    }
    return false;
  }
  function updateBigcat(dt) {
    if (!catActive(bigcat)) return false;
    if (bigcat.run) {
      const dx = bigcat.run.x - bigcat.x, dy = bigcat.run.y - bigcat.y, d = Math.hypot(dx, dy), step = 115 * dt;
      bigcat.flip = dx < 0;
      if (d <= step) { bigcat.x = bigcat.run.x; bigcat.y = bigcat.run.y; bigcat.run = null; }
      else { bigcat.x += dx / d * step; bigcat.y += dy / d * step; }
      return false;
    }
    const d = dist(player, bigcat);
    const scared = extreme ? (d < 72 && !keys.sneak) : hard ? (d < 54 && !keys.sneak) : (bigcat.fled === 0 && d < 46);
    if (scared) { bigcatFlee(); return false; }
    if (d < 22 && !bigcat.wait) { if (bigcat.escaped) recatch(bigcat); else meetCat(bigcat); return true; }
    return false;
  }
  // Easter egg: push up against the foot of the climbing wall for a moment.
  const WALL = { x: TOWER.x + 39, y: TOWER.y + TOWER.h + 5 };
  let wallPush = 0, climbDone = false;
  function updateClimbSpot(dt) {
    const atWall = Math.abs(player.x - WALL.x) < 9 && Math.abs(player.y - WALL.y) < 8;
    const pushingUp = keys.up || (moveTarget && moveTarget.y < player.y - 4);
    if (pushingUp && atWall) wallPush += dt; else wallPush = 0;
    if (wallPush < 0.6) return false;
    wallPush = 0; keys.up = false; moveTarget = null;
    if (climbDone) { say([['Ketsia', 'Déjà grimpé ! Mes avant-bras s\'en souviennent encore.']]); return true; }
    say([
      ['', 'Ketsia pose la main sur une prise, toute blanche de magnésie.'],
      ['Ketsia', 'Tu savais que la tour des maths a un mur d\'escalade ? Une petite voie avant la fête, {name} ?'],
    ], () => startPuzzle(makeClimb(), () => {
      climbDone = true; meet('climb'); meet('colin');
      colin.x = player.x; colin.y = player.y;
      say([
        ['Ketsia', 'Au sommet ! D\'ici, on voit tout le graphe de Rennes. Même {c2}, tout petit.'],
        ['Colin', 'Ketsia ?! Je suis monté jouer de la guitare face au coucher de soleil sur Rennes. Tu as l\'air bien pressée…'],
        ['Ketsia', 'Colin ! Viens avec nous, on descend : direction le bar !'],
        ['', 'Easter egg trouvé : Colin te suit jusqu\'au bar. Et badge secret « Grimpeur·se de la tour des maths ».'],
      ]);
    }));
    return true;
  }
  // Colin, found at the top of the maths tower, walks behind the cats with a little heart over his head.
  const colin = { x: 0, y: 0, moving: false, dir: 'd' };
  function colinPos() {
    const idx = trail.length - 1 - (following().length + 1) * 18;
    if (idx < 0) { colin.moving = false; return colin; }
    const p = trail[idx], q = trail[Math.max(0, idx - 4)];
    const dx = p.x - q.x, dy = p.y - q.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) colin.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'd' : 'u');
    colin.moving = colin.x !== p.x || colin.y !== p.y;
    colin.x = p.x; colin.y = p.y;
    return colin;
  }

  /* ----- fishing things out of the Vilaine, from the pier (no fish: Ketsia is vegetarian), and Poulpy ----- */
  const PIER = { x: 28 * T + 8, y: 19 * T + 10, t: 0, sat: false };
  const fishCaught = () => Object.values(stats.fish || {}).reduce((a, b) => a + b, 0);
  function updatePier(dt) {
    const on = Math.abs(player.x - PIER.x) < 7 && Math.abs(player.y - PIER.y) < 7;
    if (!on) { PIER.sat = false; PIER.t = 0; return false; }
    if (PIER.sat || player.moving) { PIER.t = 0; return false; }
    if ((PIER.t += dt) < 0.4) return false;
    PIER.sat = true; meet('fish');
    say(fishCaught() ? [['Ketsia', 'On relance la ligne ? Qui sait ce qui traîne au fond.']] : [
      ['', 'Une canne à pêche attend au bout du ponton. Personne ne dira rien si Ketsia l\'emprunte un moment.'],
      ['Ketsia', 'Pêcher des poissons ? Jamais, je suis végétarienne. Mais on repêche des trucs incroyables dans la Vilaine…'],
    ], () => startPuzzle(makeFishing(), () => {}, () => {}));
    return true;
  }
  function makeFishing() {
    let phase = 'wait', t = 0, wait = 1.5 + rnd() * 2.2, catchFish = null, joke = 0;
    const counts = () => fishCaught();
    const cast = () => { phase = 'wait'; t = 0; wait = 1.2 + rnd() * 2.5; };
    const pick = () => {
      const poulpy = (stats.fish && stats.fish.poulpy) || 0;
      if (rnd() < (poulpy ? 0.12 : counts() >= 3 ? 0.3 : 0.08)) {
        const j = POULPY_JOKES[joke++ % POULPY_JOKES.length];
        return { key: 'poulpy', img: POULPY, name: poulpy ? 'Poulpy tire encore sur la ligne !' : 'Poulpy le poulpe tire sur la ligne !', sub: `« ${j} »` };
      }
      let r = rnd();
      for (const f of CATCHES) { if (r < f.p) return f; r -= f.p; }
      return CATCHES[0];
    };
    return {
      title: 'La Vilaine · Repêchage', label: 'Repêchage', noGuide: true, free: true,
      help: ['Attends que le bouchon plonge, puis touche l\'écran (ou Espace) pour ferrer.', 'Trop tôt, ça file. Trop tard aussi.'],
      quitMsg: () => `Tu ranges la canne. ${counts() ? `Trouvailles : ${counts()}.` : 'Rien cette fois… la Vilaine garde ses secrets.'}`,
      get phase() { return phase; },
      tick(dt) {
        t += dt;
        if (phase === 'wait' && t > wait) { phase = 'bite'; t = 0; SFX.coo(); }
        else if (phase === 'bite' && t > (extreme ? 0.55 : 0.9)) { phase = 'miss'; t = 0; this.msg = 'Raté ! Ça a filé au fond.'; }
        else if (phase === 'miss' && t > 1.4) { this.msg = ''; cast(); }
      },
      action() {
        if (phase === 'wait') { this.msg = 'Trop tôt ! Ça a filé.'; phase = 'miss'; t = 0; return; }
        if (phase === 'bite') {
          catchFish = pick();
          stats.fish = stats.fish || {}; stats.fish[catchFish.key] = (stats.fish[catchFish.key] || 0) + 1;
          if (catchFish.key === 'poulpy') meet('poulpy');
          phase = 'caught'; t = 0; this.msg = ''; SFX.win(); return;
        }
        if (phase === 'caught' && t > 0.4) cast();
      },
      tap() { this.action(); },
      draw() {
        const top = portrait ? 70 : 44, water = top + (H - top) * 0.32, bottom = H - (portrait ? 22 : 12);
        ctx.fillStyle = '#9cc0e6'; ctx.fillRect(0, top, W, water - top); // sky
        ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.arc(W - 30, top + 10, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3d78c0'; ctx.fillRect(0, water, W, bottom - water);
        ctx.fillStyle = '#2d5f9e'; for (let k = 0; k < 6; k++) ctx.fillRect((k * 61 + time * 8) % W, water + 8 + k * 9, 14, 1);
        for (let k = 0; k < 3; k++) { // shadows going by (free fish, left in peace)
          const fx = (k * 97 + time * (10 + k * 4)) % (W + 40) - 20, fy = water + 18 + k * 14;
          if (fy < bottom - 4) { ctx.fillStyle = 'rgba(20,40,80,.45)'; ctx.fillRect(fx, fy, 10, 3); ctx.fillRect(fx + 10, fy - 1, 3, 5); }
        }
        ctx.fillStyle = '#a07850'; ctx.fillRect(0, water - 4, 46, 6); ctx.fillStyle = '#6a4a2a'; ctx.fillRect(8, water + 2, 3, 12); ctx.fillRect(36, water + 2, 3, 12);
        ctx.drawImage(KS.u[0], 22, water - 20);
        const fx = W * 0.62, dip = phase === 'bite' ? 3 + Math.sin(t * 30) * 1.5 : Math.sin(time * 2.5) * 0.8, fy = water + dip;
        const tipX = W * 0.5, tipY = water - 44;
        ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(32, water - 12); ctx.lineTo(tipX, tipY); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(tipX, tipY); ctx.lineTo(fx, fy - 2); ctx.stroke();
        if (phase !== 'caught') {
          ctx.fillStyle = '#e2505e'; ctx.fillRect(fx - 2, fy - 3, 4, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(fx - 2, fy, 4, 2);
          if (phase === 'bite') centered('!', fx, fy - 12, '#f2c14b', 14);
        } else {
          const f = catchFish, sc = Math.min(4, Math.floor(((bottom - top) * 0.36) / f.img.height), Math.floor((W - 40) / f.img.width));
          ctx.fillStyle = 'rgba(20,16,32,.86)'; ctx.fillRect(10, top + 4, W - 20, bottom - top - 8);
          ctx.drawImage(f.img, Math.round(W / 2 - f.img.width * sc / 2), Math.round(top + 14), f.img.width * sc, f.img.height * sc);
          let ty = top + 26 + f.img.height * sc;
          ctx.font = `bold 9px ${FONT}`;
          for (const l of wrap(f.name, W - 30)) { centered(l, W / 2, ty, '#f2c14b', 9); ty += 11; }
          ctx.font = `bold 7px ${FONT}`; ty += 2;
          for (const l of wrap(f.sub, W - 34)) { centered(l, W / 2, ty, '#f4ead5', 7); ty += 9; }
          if (t > 0.4) centered('Touche pour relancer la ligne', W / 2, ty + 5, '#c9c3dc', 7);
        }
        const c = stats.fish || {};
        status(`Trouvailles : ${counts()}${c.poulpy ? ' · Poulpy ♥' : ''}`);
      },
    };
  }

  /* ----- benches: sit for a moment and hear a story from the history of mathematics ----- */
  const STORIES = [
    [['Ketsia', 'En 1736, Euler se demande si l\'on peut traverser les sept ponts de Königsberg une seule fois chacun.'],
      ['Ketsia', 'Réponse : non. Pour le prouver, il réduit la ville à des points et des traits. La théorie des graphes vient de naître.']],
    [['Ketsia', 'En 1781, Gaspard Monge veut déplacer des tas de terre, les « déblais », vers des trous, les « remblais », en se fatiguant le moins possible.'],
      ['Ketsia', 'C\'est le premier problème de transport optimal : le cœur de ma thèse. Monge participera ensuite à la fondation de l\'École polytechnique.']],
    [['Ketsia', 'En 1939, à Leningrad, Leonid Kantorovitch aide une fabrique de contreplaqué à mieux répartir son travail entre ses machines.'],
      ['Ketsia', 'Il en tire une version plus souple du problème de Monge. Prix Nobel d\'économie en 1975, pour un problème de maths.']],
    [['Ketsia', 'La distance de Wasserstein porte le nom de Leonid Vasershtein, qui l\'étudie en 1969. Roland Dobrushin la baptise ainsi en 1970, à l\'allemande.'],
      ['Ketsia', 'Ironie : Kantorovitch l\'avait déjà définie en 1942. En maths, un nom ne dit pas toujours qui a trouvé quoi.']],
    [['Ketsia', 'Sophie Germain étudie les maths en cachette, la nuit, à la bougie. Elle écrit à Lagrange, puis à Gauss, sous un nom d\'homme : « Monsieur Le Blanc ».'],
      ['Ketsia', 'Gauss découvre la vérité en 1807. Il lui répond avec admiration : il faut, écrit-il, « le plus noble courage » à une femme pour franchir tous ces obstacles.']],
    [['Ketsia', 'En 1918, Emmy Noether démontre qu\'à chaque symétrie de la nature correspond une quantité qui se conserve : l\'énergie, la quantité de mouvement…'],
      ['Ketsia', 'Les physiciens s\'en servent encore tous les jours. Einstein parlera d\'elle comme d\'un génie des mathématiques.']],
    [['Ketsia', 'Quatre couleurs suffisent pour colorier n\'importe quelle carte, sans que deux pays voisins aient la même. La question date de 1852.'],
      ['Ketsia', 'Appel et Haken la démontrent en 1976, avec plus de mille heures de calcul sur ordinateur. Une première, qui a fait débat.']],
    [['Ketsia', 'Évariste Galois meurt en duel en 1832, à 20 ans. La veille, il écrit à un ami une longue lettre qui résume ses découvertes sur les équations.'],
      ['Ketsia', 'Ces idées fondent toute une branche de l\'algèbre : la théorie de Galois.']],
    [['Ketsia', 'En 1843, Ada Lovelace publie des notes sur la machine analytique de Charles Babbage, avec une méthode pour calculer les nombres de Bernoulli.'],
      ['Ketsia', 'On y voit souvent le tout premier programme informatique. La machine, elle, n\'a jamais été construite.']],
    [['Ketsia', '« Un mathématicien est une machine à transformer le café en théorèmes. » La phrase est d\'Alfréd Rényi ; son ami Paul Erdős l\'a rendue célèbre.'],
      ['Ketsia', 'Ce soir, on vérifie si ça marche aussi avec des tapas.']],
  ];
  const BENCHES = [];
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if ('nN'.includes(grid[y][x])) BENCHES.push({ x: x * T + 8, y: y * T + 11, sat: false, t: 0 });
  let storyNext = 0;
  function updateBenches(dt) {
    for (const b of BENCHES) {
      const on = Math.abs(player.x - b.x) < 8 && Math.abs(player.y - b.y) < 7;
      if (!on) { b.sat = false; b.t = 0; continue; }
      if (b.sat || player.moving) { b.t = 0; continue; }
      if ((b.t += dt) < 0.4) continue; // stop on the bench for a moment to sit down
      b.sat = true; meet('bench');
      const story = STORIES[storyNext % STORIES.length];
      storyNext++;
      const lines = [['', storyNext === 1 ? 'Ketsia s\'assoit sur le banc. Une petite histoire des mathématiques, en passant ?' : 'Ketsia s\'assoit sur le banc. Encore une histoire ?'], ...story];
      if (storyNext === STORIES.length) lines.push(['', 'Tu as entendu toutes les histoires des bancs. Auditeur·rice assidu·e !']);
      say(lines);
      return true;
    }
    return false;
  }
  function updateGhost(dt) {
    if (!ghost.on) return false;
    if (ghost.cool > 0) { ghost.cool -= dt; return false; }
    const dx = player.x - ghost.x, dy = player.y - 8 - ghost.y, d = Math.hypot(dx, dy);
    if (!ghost.awake) {
      if (d < 64) { ghost.awake = true; meet('ghost'); SFX.ghost(); showToast('Le Reviewer 2 t\'a repéré·e ! File !', 2.2); }
      return false;
    }
    if (d > 150) { ghostHome(); showToast('Le Reviewer 2 abandonne… pour l\'instant.', 2); return false; }
    const sp = 30 * dt; // slower than walking (72): you can always outrun him, not while sneaking
    if (d > 1) {
      const nx = ghost.x + dx / d * sp, ny = ghost.y + dy / d * sp;
      if (!ghostBlocked(nx, ghost.y)) ghost.x = nx;
      if (!ghostBlocked(ghost.x, ny)) ghost.y = ny;
    }
    if (d > 11 || invul > 0) return false;
    stats.ghost = (stats.ghost || 0) + 1; SFX.ghost(); invul = 1.2;
    const f = following();
    if (f.length) {
      const c = f[f.length - 1]; escapeCat(c);
      showToast(`Reviewer 2 : « Major revisions ! » ${c.name} s'enfuit.`, 3);
    } else {
      player.x = START.x; player.y = START.y; trail = []; moveTarget = null;
      showToast('Reviewer 2 : « Reject. » Retour au campus.', 3);
    }
    ghostHome(); ghost.cool = 2;
    return true;
  }
  function ghostBlocked(x, y) {
    for (const [px, py] of [[x - 4, y + 3], [x + 4, y + 3], [x - 4, y + 7], [x + 4, y + 7]]) {
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H || SOLID.has(grid[ty][tx])) return true;
    }
    return false;
  }
  function updatePigeon(dt) {
    if (pigeon.fly) {
      const dx = pigeon.fly.x - pigeon.x, dy = pigeon.fly.y - pigeon.y, d = Math.hypot(dx, dy), step = 95 * dt;
      pigeon.flip = dx < 0;
      if (d <= step) { pigeon.x = pigeon.fly.x; pigeon.y = pigeon.fly.y; pigeon.fly = null; }
      else { pigeon.x += dx / d * step; pigeon.y += dy / d * step; }
      return;
    }
    const d = dist(player, pigeon);
    if (!pigeon.told && d < 70) { pigeon.told = true; showToast('Un pigeon chipe les tapas prévues pour ce soir ! Attrape-le.', 3); }
    const flyAway = () => {
      let i = pigeon.spot; while (i === pigeon.spot) i = Math.floor(rnd() * PIGEON_SPOTS.length);
      pigeon.spot = i; pigeon.fly = PIGEON_SPOTS[i]; pigeon.linger = 0;
    };
    if (d < 12) {
      stats.tapas = (stats.tapas || 0) + 1; SFX.coo(); meet('pigeon');
      hearts.push({ x: pigeon.x, y: pigeon.y - 8, t: 0, txt: 'rrrou ! tapas sauvées' });
      showToast('Tu reprends au pigeon les tapas de ce soir !');
      flyAway();
    } else if (d < 40) { pigeon.linger += dt; if (pigeon.linger > 0.7) { SFX.coo(); flyAway(); } } else pigeon.linger = 0;
  }
  function updateCatsVsPigeon(dt) {
    for (const c of following()) {
      if (!pigeon.fly && dist(c, pigeon) < 56) {
        c.kek = (c.kek || 0) + dt; c.flip = pigeon.x < c.x;
        if (c.kek > 1.3) { c.kek = 0.01; hearts.push({ x: c.x, y: c.y - 16, t: 0, txt: 'kékéké' }); }
      } else c.kek = 0;
    }
  }
  function updateSups(dt) {
    const io = SUPS[2];
    const goal = IOANA_LOOP[(io.seg + 1) % IOANA_LOOP.length];
    const dx = goal.x - io.x, dy = goal.y - io.y, d = Math.hypot(dx, dy), step = (extreme ? 60 : 42) * dt;
    if (d <= step) { io.x = goal.x; io.y = goal.y; io.seg = (io.seg + 1) % IOANA_LOOP.length; }
    else { io.x += dx / d * step; io.y += dy / d * step; if (Math.abs(dx) > 1) io.flip = dx < 0; }
    if (io.cool > 0) io.cool -= dt;
    if (Math.hypot(player.x - io.x, player.y - io.y) < 14) {
      if (!io.found) { meetSup(io); return true; }
      if (io.cool <= 0) { io.cool = 4; SFX.bell(); showToast('Ioana : « Coucou ! » La petite : « Ba-ba ! »', 2); }
    }
    for (const p of SUPS.slice(0, 2)) if (edge(p, 24, () => meetSup(p))) return true;
    return false;
  }
  function updateMetro() {
    const tx = Math.floor(player.x / T), ty = Math.floor((player.y - 2) / T);
    const i = STATIONS.findIndex((s) => s.tx === tx && s.ty === ty);
    if (i < 0) { metroLock = -1; return false; }
    if (i === metroLock) return false;
    metroLock = i;
    metro = { from: i, to: -1, t: 0, dur: extreme ? 5 : 2.6 }; // long enough to hear the train
    state = 'metroMenu'; moveTarget = null; keys.up = keys.down = keys.left = keys.right = false;
    return true;
  }
  function metroBoxes() {
    const dests = STATIONS.map((st, i) => i).filter((i) => i !== metro.from);
    const h = portrait ? 22 : 16, top = portrait ? 80 : 50;
    return [...dests.map((i, k) => ({ x: 20, y: top + k * (h + 6), w: W - 40, h, i, label: STATIONS[i].name })),
      { x: 20, y: top + dests.length * (h + 6) + 6, w: W - 40, h, i: -1, label: 'Rester ici' }];
  }
  function drawMetroMenu() {
    ctx.fillStyle = '#101018'; ctx.fillRect(0, 0, W, H);
    centered('Métro · où vas-tu ?', W / 2, 18, '#f2c14b', 10);
    centered(`Tu es à ${STATIONS[metro.from].name}`, W / 2, 32, '#c9c3dc', 7);
    metroBoxes().forEach((b, k) => button(b, b.i < 0 ? b.label : `${k + 1}. ${b.label}`));
  }
  function chooseMetro(i) {
    if (i < 0) { metro = null; state = 'play'; return; }
    metro.to = i; metro.t = 0; state = 'metro'; SFX.chime();
  }
  function metroTap(x, y) { const b = metroBoxes().find((bb) => inBox(bb, x, y)); if (b) chooseMetro(b.i); }
  function drawMetro() {
    const k = metro.t / metro.dur;
    ctx.fillStyle = '#101018'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2a2a38'; for (let x = (-time * 200) % 40; x < W; x += 40) ctx.fillRect(x, H / 2 - 30, 20, 2);
    ctx.fillStyle = '#3a3a4a'; ctx.fillRect(0, H / 2 + 22, W, 3);
    const tx = -140 + k * (W + 180), ty = H / 2 - 14;
    ctx.fillStyle = '#d9534f'; ctx.fillRect(tx, ty, 130, 34);
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(tx, ty + 24, 130, 4);
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#bfe3f2'; ctx.fillRect(tx + 8 + i * 24, ty + 6, 16, 12); }
    ctx.drawImage(KS.r[0], Math.round(tx + 58), ty + 4);
    // Whoever follows Ketsia rides along, one per window: the cats, then Colin.
    const riders = [...following().map((c) => (c.key === 'cat1' ? NOBLECAT[0] : BIGCAT[0])), ...(climbDone ? [COLIN_DIR.r] : [])];
    riders.forEach((img, k) => {
      const wx = Math.round(tx + 8 + [3, 1, 4, 0][k] * 24), wy = ty + 6;
      ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, 16, 12); ctx.clip();
      const bounce = Math.floor(time * 6 + k) % 2; // the train rattles
      ctx.drawImage(img, wx + Math.round((16 - img.width) / 2), wy + 12 - Math.min(img.height, 11) - bounce + (img === COLIN_DIR.r ? 3 : 0));
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(wx + 1, wy + 1, 6, 1); // a glint on the glass
      ctx.restore();
    });
    centered(extreme ? 'Service minimum… patience.' : 'Ding-dong !', W / 2, 26, '#f2c14b', 9);
    centered('Métro · prochain arrêt :', W / 2, H - 40, '#f4ead5', 8);
    centered(STATIONS[metro.to].name, W / 2, H - 26, '#f2c14b', 10);
  }
  function edge(spot, r, fn) {
    const near = dist(player, spot) < r;
    if (near && !spot.wasNear) { spot.wasNear = true; fn(); return true; }
    spot.wasNear = near;
    return false;
  }

  function update(dt) {
    time += dt;
    if (toastT > 0) toastT -= dt;
    if (invul > 0) invul -= dt;
    if (state !== 'puzzle') updateCars(dt);
    if (state === 'end' && !cardShown && (barT += dt) > 5) revealCard();
    if (state === 'dialog' && dlg) dlg.t += dt * 50;
    if (state === 'puzzle' && puzzle) {
      puzzle.time += dt;
      if (puzzle.tick) puzzle.tick(dt);
      if (extreme && !puzzle.free && puzzle.wonT < 0 && puzzle.time > PUZZLE_LIMIT) {
        quitPuzzle('Trop lent ! Le jury s\'impatiente. Éloigne-toi et reviens retenter.');
        return;
      }
      if (puzzle.wonT >= 0) {
        puzzle.wonT += dt;
        if (puzzle.wonT > 1.1) {
          const { label, wrong, hints, skipped, solvedAt, done: d } = puzzle;
          if (!stats.puzzles.some((q) => q.label === label)) stats.puzzles.push({ label, time: Math.round(solvedAt), wrong, hints, skipped });
          delete carry[label];
          puzzle = null; state = 'play'; d();
        }
      }
    }
    for (const h of hearts) h.t += dt;
    while (hearts.length && hearts[0].t > 1.3) hearts.shift();
    if (state === 'metro') {
      metro.t += dt;
      if (metro.t > metro.dur) {
        const to = STATIONS[metro.to];
        player.x = to.out.x; player.y = to.out.y; player.dir = 'd'; trail = []; moveTarget = null;
        for (const c of [...following(), colin]) { c.x = player.x; c.y = player.y; }
        metroLock = metro.to; metro = null; state = 'play'; stats.metro++; meet('metro');
        showToast(`Terminus… non, ${to.name} !`, 1.8);
      }
      return;
    }
    if (state !== 'play' || paused) return;
    if ((saveT += dt) > 4) { saveT = 0; snapshot(); }
    updatePlayer(dt);
    if (invul <= 0 && carHit()) {
      const back = extreme ? START : checkpoint;
      player.x = back.x; player.y = back.y; trail = []; invul = 1.2; stats.hits++; moveTarget = null; SFX.hit();
      const fled = extreme ? following() : [];
      fled.forEach(escapeCat);
      showToast(extreme ? `ACCIDENT ! Retour au campus.${fled.length ? ' Les chats ont filé chez eux.' : ''}` : 'Bouchon ! Retour au dernier point sûr.');
      return;
    }
    if (updateGhost(dt)) return;
    updatePigeon(dt); updateCatsVsPigeon(dt);
    if (updateSups(dt)) return;
    if (updateMetro()) return;
    for (const c of cats) if (c.wait && dist(player, c) > 40) c.wait = false;
    const noble = cats[0];
    if (catActive(noble) && !noble.wait && dist(player, noble) < 22) { if (noble.escaped) recatch(noble); else meetCat(noble); return; }
    if (updateClimbSpot(dt)) return;
    if (updateBenches(dt)) return;
    if (updatePier(dt)) return;
    if (updateBigcat(dt)) return;
    if (edge(rap, 26, meetRapporteur)) return;
    if (edge(bikeSpot, 26, meetBikes)) return;
    edge(otSpot, 22, meetEmptyStation);
  }

  /* ================= rendering ================= */
  function camera() {
    return {
      cx: Math.round(clamp(player.x - W / 2, 0, world.width - W)),
      cy: Math.round(clamp(player.y - H / 2 - 8, portrait ? -22 : -14, world.height - H)), // room for the HUD
    };
  }
  // Text is the costliest thing a canvas draws each frame. Each label is rendered once, at full
  // resolution, into a small image; after that, drawing it is a single drawImage.
  const textCache = new Map();
  function textImg(t, col, size, shadow) {
    const key = `${t}|${col}|${size}|${shadow}`;
    let c = textCache.get(key);
    if (c) return c;
    if (textCache.size > 400) textCache.clear();
    const font = `bold ${size * S}px ${FONT}`;
    ctx.save(); ctx.font = font; const w = Math.ceil(ctx.measureText(t).width); ctx.restore();
    c = document.createElement('canvas'); c.width = w + 4; c.height = Math.ceil(size * S * 1.5) + 4;
    const x = c.getContext('2d'); x.font = font; x.textBaseline = 'alphabetic';
    c.base = Math.ceil(size * S * 1.1) + 1; // baseline, in image pixels
    if (shadow) { x.fillStyle = 'rgba(0,0,0,.65)'; x.fillText(t, 1 + 0.6 * S, c.base + 0.6 * S); }
    x.fillStyle = col; x.fillText(t, 1, c.base);
    c.tw = w; textCache.set(key, c);
    return c;
  }
  function drawText(t, x, y, col, size, align = 'center', shadow = true) { // y = baseline, as fillText
    const c = textImg(t, col, size, shadow);
    const dx = align === 'center' ? x - (c.tw / 2 + 1) / S : x - 1 / S;
    ctx.drawImage(c, Math.round(dx * S) / S, Math.round((y - c.base / S) * S) / S, c.width / S, c.height / S);
  }
  const textShadow = (t, x, y, col = '#ffffff', size = 7) => drawText(t, x, y, col, size);
  function catPos(cat) {
    if (catActive(cat)) return { x: cat.x, y: cat.y, flip: !!cat.flip, moving: !!cat.run };
    const idx = trail.length - 1 - (following().indexOf(cat) + 1) * 18;
    if (idx < 0) return { x: cat.x, y: cat.y, flip: cat.flip, moving: false };
    const p = trail[idx], q = trail[Math.max(0, idx - 4)];
    if (p.x !== q.x && !cat.kek) cat.flip = p.x < q.x;
    const moving = cat.x !== p.x || cat.y !== p.y;
    cat.x = p.x; cat.y = p.y;
    return { x: p.x, y: p.y, flip: cat.flip, moving };
  }
  const flipCache = new Map();
  const flipped = (img) => { if (!flipCache.has(img)) flipCache.set(img, flipH(img)); return flipCache.get(img); };

  function drawKetsia(cx, cy) {
    if (invul > 0 && Math.floor(invul * 10) % 2) return;
    const px = Math.round(player.x - cx), py = Math.round(player.y - cy);
    if (onBike()) {
      const fr = KS[player.dir][0];
      if (player.dir === 'u') ctx.drawImage(BIKE_V, px - 3, py - 14);
      ctx.drawImage(fr, px - 8, py - 19);
      if (player.dir === 'l' || player.dir === 'r') {
        ctx.drawImage(player.dir === 'r' ? BIKE_SIDE : flipped(BIKE_SIDE), px - 9, py - 9);
      } else if (player.dir === 'd') ctx.drawImage(BIKE_V, px - 3, py - 12);
      return;
    }
    const fr = KS[player.dir][player.moving ? Math.floor(player.anim * 8) % 2 : 0];
    ctx.drawImage(fr, px - 8, py - 16);
  }

  function drawWorld() {
    const { cx, cy } = camera();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#16131f'; ctx.fillRect(0, 0, W, H);
    const sy = Math.max(0, cy);
    ctx.drawImage(world, cx, sy, W, H - (sy - cy), 0, sy - cy, W, H - (sy - cy));
    // A climber going up and down the maths tower.
    const clx = TOWER.x + 39 - cx, cly = TOWER.y + 14 + (Math.sin(time * 0.5) * 0.5 + 0.5) * (TOWER.h - 30) - cy;
    const reach = Math.floor(time * 2) % 2;
    ctx.fillStyle = '#f3c9ab'; ctx.fillRect(clx + 1, cly, 2, 2);
    ctx.fillStyle = '#e2505e'; ctx.fillRect(clx + 1, cly + 2, 2, 3);
    ctx.fillStyle = '#2c3a5e'; ctx.fillRect(clx + reach * 2, cly + 5, 1, 2); ctx.fillRect(clx + 3 - reach * 2, cly + 5, 1, 2);
    ctx.fillStyle = '#f3c9ab'; ctx.fillRect(clx + (reach ? 0 : 3), cly - 1, 1, 2);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(clx + 2, cly - 12, 0.4, 12); // rope
    for (const l of LABELS) { // only the labels on screen
      const lx = l.x - cx, ly = l.y - cy;
      if (lx > -90 && lx < W + 90 && ly > -10 && ly < H + 10) textShadow(l.t, lx, ly, l.c || '#ffffff', l.c ? 8 : 6);
    }

    const ents = [];
    for (const c of cars) ents.push({ y: c.y + c.img.height / 2, draw: () => ctx.drawImage(c.img, Math.round(c.x - c.img.width / 2 - cx), Math.round(c.y - c.img.height / 2 - cy)) });
    for (const cat of cats) {
      const p = catPos(cat);
      const speed = cat.run ? 12 : (cat.solved ? 8 : 1.5);
      const fr = cat.frames[(p.moving || catActive(cat)) ? Math.floor(time * speed) % 2 : 0];
      const img = p.flip ? flipped(fr) : fr;
      const lunge = cat.kek ? (cat.flip ? -2 : 2) * (Math.floor(time * 8) % 2) : 0; // crouched, ready to pounce
      ents.push({ y: p.y, draw: () => {
        ctx.drawImage(img, Math.round(p.x - img.width / 2 - cx + lunge), Math.round(p.y - img.height - cy));
        if (catActive(cat)) textShadow(cat.run ? '!' : '?', p.x - cx, p.y - img.height - 4 - cy + Math.sin(time * 4) * 1.5, '#f2c14b', 9);
      } });
    }
    ents.push({ y: rap.y, draw: () => {
      ctx.drawImage(RAP, Math.round(rap.x - 8 - cx), Math.round(rap.y - 16 - cy));
      if (fragments() === 2) textShadow('!', rap.x - cx, rap.y - 20 - cy + Math.sin(time * 4) * 1.5, '#e06060', 9);
    } });
    if (hasBike && !otDone) ents.push({ y: otSpot.y, draw: () => textShadow('★', otSpot.x - cx, otSpot.y - 14 - cy + Math.sin(time * 4) * 1.5, '#7fb3e0', 9) });
    ents.push({ y: player.y, draw: () => drawKetsia(cx, cy) });
    if (climbDone) {
      const c = colinPos();
      ents.push({ y: c.y, draw: () => {
        const sx = Math.round(c.x - COLIN.width / 2 - cx), sy = Math.round(c.y - COLIN.height - cy - (c.moving ? Math.floor(time * 8) % 2 : 0));
        ctx.drawImage(COLIN_DIR[c.dir] || COLIN, sx, sy);
        textShadow('♥', c.x - cx, sy - 2 + Math.sin(time * 3) * 1.2, '#ff6b9a', 8);
      } });
    }
    for (const p of SUPS) {
      ents.push({ y: p.y, draw: () => {
        const img = p.flip ? flipped(p.img) : p.img;
        const sx = Math.round(p.x - img.width / 2 - cx), sy = Math.round(p.y - img.height - cy);
        ctx.drawImage(img, sx, sy);
        if (p.key === 'loic') { // a cigarette in his hand, and a thin wisp of smoke
          ctx.fillStyle = '#efe6cf'; ctx.fillRect(sx - 1, sy + 11, 3, 1); // left hand, as in real life
          ctx.fillStyle = Math.floor(time * 3) % 2 ? '#ff7a3a' : '#ffb04a'; ctx.fillRect(sx - 2, sy + 11, 1, 1);
          for (let k = 0; k < 3; k++) {
            const ph = (time * 0.4 + k / 3) % 1;
            ctx.fillStyle = `rgba(220,220,230,${(1 - ph) * 0.5})`;
            ctx.fillRect(sx - 2 + Math.sin(ph * 6 + k) * 1.5, sy + 9 - ph * 12, 1, 1);
          }
        }
        if (p.key === 'vero') ctx.drawImage(SUITCASE, sx + 15, sy + 7);
        if (p.found) textShadow(p.key === 'loic' ? '♪' : p.key === 'vero' ? '✈' : '♥', p.x - cx, sy - 3 + Math.sin(time * 3) * 1.2, '#f2c14b', 7);
      } });
    }
    ents.push({ y: pigeon.y, draw: () => {
      const fr = PIGEON[pigeon.fly ? Math.floor(time * 10) % 2 : 0];
      const img = pigeon.flip ? flipped(fr) : fr;
      const bob = pigeon.fly ? -3 : (Math.floor(time * 3) % 2);
      ctx.drawImage(img, Math.round(pigeon.x - 4 - cx), Math.round(pigeon.y - 6 - cy + bob));
    } });
    ents.sort((a, b) => a.y - b.y).forEach((e) => e.draw());
    // Tunnel mouths toward Villejean: horizontal traffic disappears into them (drawn over the cars).
    for (const [ty, rows] of [[14, 2], [24, 1]]) {
      const x0 = CITY_W * T - cx, y0 = ty * T - cy, hgt = rows * T;
      ctx.fillStyle = '#3f6f3a'; ctx.fillRect(x0, y0 - 6, 2 * T + 4, hgt + 12); // grassy embankment of the rocade
      ctx.fillStyle = '#141218'; ctx.fillRect(x0 + 2, y0 - 1, 2 * T, hgt + 2);  // the dark mouth
      ctx.fillStyle = '#8a8f99'; ctx.fillRect(x0, y0 - 4, 3, hgt + 7); ctx.fillRect(x0, y0 - 4, 2 * T + 4, 3);
      ctx.fillStyle = '#6b6f78'; for (let k = 0; k < hgt + 7; k += 4) ctx.fillRect(x0, y0 - 4 + k, 3, 1);
      const sx = x0 + 4, sy = y0 + hgt + 9; // blue road sign, under the mouth: well away from the Beaulieu metro
      ctx.fillStyle = '#5a5f68'; ctx.fillRect(sx + 11, sy - 3, 1, 3);
      ctx.fillStyle = '#2e5aa8'; ctx.fillRect(sx, sy, 24, 9); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.6; ctx.strokeRect(sx + 0.8, sy + 0.8, 22.4, 7.4);
      centered('Tunnel', sx + 12, sy + 4.6, '#ffffff', 5);
    }
    for (const h of hearts) {
      ctx.globalAlpha = Math.max(0, 1 - h.t / 1.3);
      textShadow(h.txt, h.x - cx, h.y - cy - h.t * 18, '#ff8fb1', 7);
      ctx.globalAlpha = 1;
    }
    if (moveTarget && state === 'play' && Math.floor(time * 4) % 2) {
      const mx = moveTarget.x - cx, my = moveTarget.y - 4 - cy;
      ctx.strokeStyle = '#f2c14b'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(mx - 3, my - 3); ctx.lineTo(mx + 3, my + 3); ctx.moveTo(mx + 3, my - 3); ctx.lineTo(mx - 3, my + 3); ctx.stroke();
    }
    if (extreme && state !== 'name') { // pitch-black night, a small halo around Ketsia
      const px = player.x - cx, py = player.y - 8 - cy;
      ctx.drawImage(NIGHT, Math.round(px) - 420, Math.round(py) - 420); // pre-rendered once
    }
    if (ghost.on && state !== 'name') { // Reviewer 2 glows a ghastly pale blue, visible in the night
      const gx = ghost.x - cx, gy = ghost.y - cy + Math.sin(time * 2) * 2;
      ctx.drawImage(HALO, Math.round(gx) - 30, Math.round(gy) - 30);
      ctx.globalAlpha = ghost.cool > 0 ? 0.3 : ghost.awake ? 0.9 : 0.5;
      ctx.drawImage(GHOST, Math.round(gx - 7), Math.round(gy - 8));
      ctx.globalAlpha = 1;
      textShadow('R2', gx, gy - 11, '#ff6b6b', 6);
      if (!ghost.awake) textShadow('z', gx + 9, gy - 14 - (time * 6 % 6), '#c9d8ff', 6);
    }
    lastCam = { cx, cy };
    return { cx, cy };
  }

  function objective() {
    if (fragments() === 2) return { text: 'Objectif : le bar, au centre-ville', target: rap };
    const left = cats.filter(catActive);
    if (left.length === 2) return { text: 'Objectif : les chats de Ketsia, {c1} (Thabor) et {c2} (sud de la Vilaine)', target: left.reduce((a, b) => (dist(player, a) < dist(player, b) ? a : b)) };
    return { text: left[0].key === 'cat1' ? 'Objectif : le chat {c1}, au Parc du Thabor' : 'Objectif : le chat {c2}, au sud de la Vilaine', target: left[0] };
  }

  // On touch screens the objectives button is a real HTML button (#menuBtn), big and outside the
  // canvas; with a keyboard and mouse it is drawn in the HUD, with a generous hit box.
  const touchUI = () => document.documentElement.classList.contains('touch');
  const menuBox = () => ({ x: W - 46, y: 1, w: 16, h: 11 });
  const menuHit = () => ({ x: W - 52, y: 0, w: 26, h: 18 });
  let paused = false;
  function openObjectives() {
    paused = true; keys.up = keys.down = keys.left = keys.right = false; moveTarget = null;
    const ok = (b) => (b ? '✓' : '○');
    const hint = { loic: 'il aime la musique… cherche du côté d\'une salle de concert, au bord de la Vilaine', vero: 'elle prépare un voyage, sûrement à la fac de sciences éco', ioana: 'elle roule à vélo, loin, à Villejean (le métro y mène)' };
    const li = (done, text) => `<li class="${done ? 'done' : ''}">${ok(done)} ${text}</li>`;
    const noble = cats[0], um = cats[1];
    const html = [
      '<h2>Objectifs</h2>', '<h3>Les deux chats de Ketsia</h3><ul>',
      li(noble.solved && !noble.escaped, 'Le chat {c1}, au Parc du Thabor'),
      li(um.solved && !um.escaped, 'Le chat {c2}, au sud de la Vilaine'),
      li(false, 'Le bar, au centre-ville : le rapporteur garde la porte (il faut les deux chats)'),
      `</ul><h3>Quête annexe : les encadrant·es (${supsFound()}/3)</h3><ul>`,
      ...SUPS.map((p) => li(p.found, p.found ? `${p.name} vient au bar` : `${p.name} : ${hint[p.key]}`)),
      '</ul><h3>Bonus</h3><ul>',
      li(hasBike, hasBike ? 'Vélo trouvé' : 'Une station de vélos se cache sur le campus'),
      li(otDone, hasBike ? 'Défi Monge : la station vide, au sud du Thabor' : 'Défi Monge : il faut d\'abord un vélo'),
      li((stats.tapas || 0) > 0, `Le pigeon voleur des tapas de ce soir, au centre-ville (sauvées : ${stats.tapas || 0} fois)`),
      li((stats.metro || 0) > 0, `Le métro : il te mène jusqu'à Villejean (${stats.metro || 0} trajets)`),
      li(storyNext >= STORIES.length, `Les bancs : assieds-toi un instant pour une histoire des maths (${Math.min(storyNext, STORIES.length)}/${STORIES.length})`),
      li(fishCaught() > 0, `Le repêchage : un ponton t'attend sur la Vilaine (${fishCaught()} trouvailles${(stats.fish || {}).poulpy ? ', Poulpy compris' : ''})`),
      li(climbDone, climbDone ? 'Secret trouvé : la tour des maths… et Colin' : 'Un secret se cache sur le campus… (indice : il faut lever les yeux)'),
      '</ul><h3>Commandes</h3><p>Flèches, ZQSD, ou toucher la carte pour marcher. Maj ou bouton B : avancer à pas de loup.',
      ' Toucher un chat qui te suit (ou Espace) : une caresse. ✥ : croix directionnelle. ♪ : le son et la musique.</p>',
    ].join('') + (store.get('invite-err') ? `<p class="small">Petit bug technique noté (le jeu a continué). Si tu veux aider, envoie une capture de cette ligne : <code>${escHtml(store.get('invite-err'))}</code></p>` : '');
    // Built from the game's own strings; the cats' names come from the link, so they are escaped.
    $('objBody').innerHTML = html.replace(/\{c1\}/g, escHtml(CAT1)).replace(/\{c2\}/g, escHtml(CAT2));
    $('objBox').classList.remove('hidden');
  }
  function closeObjectives() { paused = false; $('objBox').classList.add('hidden'); }
  $('objClose').addEventListener('click', closeObjectives);
  function drawHud(cam) {
    const ob = objective();
    ctx.textAlign = 'left'; ctx.font = `bold 7px ${FONT}`;
    const touch = touchUI();
    const hl = wrap(N(ob.text), W - (touch ? 60 : 54));
    const hudH = 5 + hl.length * 8;
    ctx.fillStyle = 'rgba(20,16,32,.78)'; ctx.fillRect(0, 0, W, hudH);
    ctx.fillStyle = '#f4ead5';
    hl.forEach((l, i) => drawText(l, 4, 9 + i * 8, '#f4ead5', 7, 'left', false));
    if (!touch) {
      const mb = menuBox(); // the objectives button
      ctx.fillStyle = 'rgba(242,193,75,.25)'; ctx.fillRect(mb.x, mb.y, mb.w, mb.h);
      ctx.strokeStyle = '#f2c14b'; ctx.lineWidth = 0.8; ctx.strokeRect(mb.x + 0.4, mb.y + 0.4, mb.w - 0.8, mb.h - 0.8);
      centered('☰', mb.x + mb.w / 2, mb.y + mb.h / 2, '#f4ead5', 8);
    }
    const hx = touch ? W - 54 : W - 25; // the cats' heads: lit once the cat follows you
    [[cats[0], HEAD1], [cats[1], HEAD2]].forEach(([c, img], i) => {
      ctx.globalAlpha = c.solved && !c.escaped ? 1 : 0.4;
      ctx.drawImage(img, hx + i * 11, 2);
      ctx.globalAlpha = 1;
    });
    {
      const parts = [`encadrant·es ${supsFound()}/3`];
      if (keys.sneak) parts.push('à pas de loup…'); else if (hasBike) parts.push('vélo');
      const t = parts.join(' · ');
      ctx.font = `bold 7px ${FONT}`; ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillText(t, 4.6, H - 3.4);
      ctx.fillStyle = '#f4ead5'; ctx.fillText(t, 4, H - 4);
    }
    // Off-screen target arrow.
    const tx = ob.target.x - cam.cx, ty = ob.target.y - 8 - cam.cy;
    if ((tx < 6 || tx > W - 6 || ty < hudH + 3 || ty > H - 6) && Math.floor(time * 3) % 3) {
      const dx = tx - W / 2, dy = ty - H / 2;
      const k = Math.min((W / 2 - 12) / Math.abs(dx || 1e-6), (H / 2 - hudH - 6) / Math.abs(dy || 1e-6));
      const ax = W / 2 + dx * k, ay = H / 2 + dy * k, a = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
      ctx.fillStyle = '#f2c14b'; ctx.strokeStyle = '#16131f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (toastT > 0) {
      ctx.font = `bold 7px ${FONT}`;
      const tl = wrap(toast, W - 20);
      const w = Math.min(W - 8, Math.max(...tl.map((l) => ctx.measureText(l).width)) + 12);
      ctx.fillStyle = 'rgba(160,40,40,.92)'; ctx.fillRect(W / 2 - w / 2, hudH + 4, w, 5 + tl.length * 8);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
      tl.forEach((l, i) => ctx.fillText(l, W / 2, hudH + 11 + i * 8));
    }
  }

  const wrapCache = new Map();
  function wrap(text, maxW) {
    const key = `${ctx.font}|${maxW}|${text}`, hit = wrapCache.get(key);
    if (hit) return hit;
    if (wrapCache.size > 300) wrapCache.clear();
    const lines = wrapNow(text, maxW); wrapCache.set(key, lines);
    return lines;
  }
  function wrapNow(text, maxW) {
    const words = text.split(' '); const lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  let dlgSkipBox = null;
  function drawDialog() {
    const cur = dlg.lines[dlg.i];
    ctx.font = `8px ${FONT}`;
    const lines = wrap(cur.text, W - 28);
    const bx = 6, bw = W - 12, bh = Math.max(46, 12 + lines.length * 9), by = H - bh - 4;
    dlgSkipBox = dlg.lines.length - dlg.i > 1 ? { x: bx + bw - 58, y: by - 11, w: 58, h: 11 } : null;
    if (dlgSkipBox) {
      ctx.fillStyle = 'rgba(22,19,31,.94)'; ctx.fillRect(dlgSkipBox.x, dlgSkipBox.y, dlgSkipBox.w, dlgSkipBox.h);
      centered('tout passer ▸▸', dlgSkipBox.x + dlgSkipBox.w / 2, dlgSkipBox.y + 5.5, '#c9c3dc', 6);
    }
    ctx.fillStyle = 'rgba(22,19,31,.94)'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#f4ead5'; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    if (cur.who) {
      ctx.font = `bold 8px ${FONT}`; const w = ctx.measureText(cur.who).width + 10;
      ctx.fillStyle = WHO[cur.key] || '#f4ead5'; ctx.fillRect(bx + 6, by - 9, w, 11);
      ctx.fillStyle = '#16131f'; ctx.textAlign = 'left'; ctx.fillText(cur.who, bx + 11, by - 1);
    }
    ctx.font = `8px ${FONT}`; ctx.textAlign = 'left';
    ctx.fillStyle = cur.who ? '#f4ead5' : '#f2c14b';
    let left = Math.floor(dlg.t);
    lines.forEach((ln, i) => {
      if (left <= 0) return;
      ctx.fillText(ln.slice(0, left), bx + 8, by + 12 + i * 9);
      left -= ln.length + 1;
    });
    if (dlg.t >= cur.text.length && Math.floor(time * 2) % 2) {
      ctx.fillStyle = '#f2c14b'; ctx.textAlign = 'right'; ctx.fillText('▼', bx + bw - 6, by + bh - 4);
    }
  }

  function render() {
    ctx.setTransform(S, 0, 0, S, 0, 0);
    if (state === 'puzzle' && puzzle) { drawPuzzle(); return; }
    if (state === 'end') { drawBar(); return; }
    if (state === 'metro' && metro) { drawMetro(); return; }
    if (state === 'metroMenu' && metro) { drawMetroMenu(); return; }
    const cam = drawWorld();
    if (state === 'play' || state === 'dialog') drawHud(cam);
    if (state === 'dialog' && dlg) drawDialog();
  }

  /* ================= the bar scene ================= */
  const GUEST_ROWS = ['....hhhhhhhh....', '...hhhhhhhhhh...', '...hSSSSSSSSh...', '...SSeSSSSeSS...', '...SSSSSSSSSS...',
    '...SSSSnnSSSS...', '....SSSmmSSS....', '.....SSSSSS.....', '...TTTTTTTTTT...', '..TTTTTTTTTTTT..',
    '..TTTTTTTTTTTT..', '..STTTTTTTTTTS..', '...TTTTTTTTTT...', '...PPPP..PPPP...', '...PPPP..PPPP...', '...KKKK..KKKK...'];
  // Long-haired variant of the guest template.
  const GUEST_LONG = GUEST_ROWS.map((r, j) => (j >= 2 && j <= 9 ? `${r.slice(0, 2)}hh${r.slice(4, 12)}hh${r.slice(14)}` : r));
  const HAIRS = ['#1e1a22', '#c9a06a', '#8a3a1a', '#5a3a22', '#d9d9d9', '#e2505e', '#3a2618', '#f2c14b'];
  const SHIRTS = ['#16a085', '#e74c3c', '#f39c12', '#3498db', '#9b59b6', '#2ecc71', '#e84393', '#1abc9c', '#f1c40f', '#34495e'];
  const SKINS = ['#f3c9ab', '#c68e5e', '#8d5a3b', '#f0c3a5', '#e8b896'];
  const GUESTS = Array.from({ length: 14 }, (_, i) => makeSprite(i % 3 === 1 ? GUEST_LONG : GUEST_ROWS, {
    h: HAIRS[i % HAIRS.length], S: SKINS[(i * 3) % SKINS.length], e: '#2b2340', n: '#00000022', m: '#a8605a',
    T: SHIRTS[(i * 7) % SHIRTS.length], P: ['#2c3a5e', '#3a3f4a', '#5a3420'][i % 3], K: '#1e1a22' }));
  // Colin: tall, hair down to the shoulders, bright blue glasses, mutton chops, colourful clothes,
  // and a guitar (no case) slung across his back: the neck over his shoulder, the body at his hip.
  const COLIN_PAL = { h: '#5a3a22', c: '#3e2616', S: '#f0c3a5', n: '#d9a083', m: '#a8605a', B: '#2e6fd8', e: '#1e1a22',
    T: '#f2c14b', R: '#e2505e', U: '#2fa39a', O: '#9b59b6', P: '#2c3a5e', K: '#1e1a22',
    g: '#e0943e', G: '#7a3f14', o: '#3a1e0a', k: '#f0c878', w: '#ffffff', z: '#2b1a10' };
  // Front, back and side views; the left view is the right one flipped. The back shows the whole guitar.
  const COLIN_DIR = { d: makeSprite(['.ww...............', '.kk..hhhhhhhh.....', '..k.hhhhhhhhhh....', '..k.hhSSSSSShhh...', '...khBBBSSBBBhh...', '...khBeBBBBeBhh...', '...khcSSSnSSchh...', '...khcccccccchh...', '...khhcSmmSchhh...', '...khh.SSSS.hhh...', '...hzzRRUUOOTTh...', '...hRUzzOTTRRUhGG.', '...TUUOOzzRRUUGggG', '..SUOOTTRRzzOOGogG', '...OTTRRUUOOzzGogG', '....PPPPPPPPPPGggG', '....PPPP..PPPP.GG.', '....PPPP..PPPP....', '....PPPP..PPPP....', '....KKKK..KKKK....'], COLIN_PAL),
    u: makeSprite(['.............ww...', '.....hhhhhhhhkw...', '....hhhhhhhhkh....', '....hhhhhhhhkh....', '....hhhhhhhkhh....', '....hhhhhhhkhh....', '....hhhhhhkhhh....', '....hhhhhhkhhh....', '....hhhhhkhhhh....', '....hhhhhkhhhh....', '...TThGGGhhhhRR...', '...RUGgggGhhhUO...', '...TUGgggGRRUUT...', '..SUOOGgGRUUOOTS..', '...OGgggggGOTTR...', '....GgggggGPPP....', '....PGGGGGPPPP....', '....PPPP..PPPP....', '....PPPP..PPPP....', '....KKKK..KKKK....'], COLIN_PAL),
    r: makeSprite(['ww................', '.k...hhhhhh.......', '.k..hhhhhhhh......', '..k.hhhhhSSSh.....', '..k.hhhhBBBBB.....', '..k.hhhhSBeBS.....', '..k.hhhhcSSSnS....', '...khhhhcccccS....', '...khhhhcSmmS.....', '...khhhhhSSS......', '..GGGhhTTTTTT.....', '.GgggGTRRUUOOT....', '.GgggGTUUOOTTR....', '..GgG.OTTRRUSS....', '.GgggGTRRUUOOT....', '.GgggGPPPPPPP.....', '..GGG.PPP..PPP....', '......PPP..PPP....', '......PPP..PPP....', '......KKKK.KKKK...'], COLIN_PAL) };
  COLIN_DIR.l = flipH(COLIN_DIR.r);
  const COLIN = COLIN_DIR.d;
  // Cabbage heads ("têtes de chou"), partying at the bar.
  const CHOU_ROWS = ['.....lLLLLl.....', '...lLLlLLlLLl...', '..lLlLLLLLLlLl..', '..LLLeLLLLeLLL..', '..lLLLLLLLLLLl..',
    '..LlLLLmmLLLlL..', '...lLLLLLLLLl...', '.....lLLLLl.....', ...GUEST_ROWS.slice(8)];
  const CHOUX = ['#e84393', '#f39c12', '#3498db'].map((T) => makeSprite(CHOU_ROWS,
    { L: '#8fd67a', l: '#4f9a45', e: '#1e1a22', m: '#a8605a', T, S: '#8fd67a', P: '#2c3a5e', K: '#1e1a22' }));
  const BARTENDER = makeSprite(GUEST_ROWS, { h: '#3a2618', S: '#f0c3a5', e: '#2b2340', n: '#d9a083', m: '#a8605a', T: '#fdf6e3', P: '#2c3a5e', K: '#1e1a22' });
  function drawBar() {
    const t = time, floorY = Math.round(H * 0.56);
    ctx.fillStyle = '#2b1f3a'; ctx.fillRect(0, 0, W, H);
    for (let y = floorY; y < H; y += 10) for (let x = 0; x < W; x += 10) {
      ctx.fillStyle = ((x + y) / 10) % 2 ? '#5a3420' : '#4a2a18'; ctx.fillRect(x, y, 10, 10);
    }
    const beams = ['rgba(242,193,75,.16)', 'rgba(233,163,166,.16)', 'rgba(127,179,224,.16)', 'rgba(129,214,154,.16)'];
    beams.forEach((c, k) => {
      const a = Math.sin(t * 1.3 + k * 1.7) * 0.7;
      ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(W / 2, 16);
      ctx.lineTo(W / 2 + Math.tan(a - 0.22) * H, H); ctx.lineTo(W / 2 + Math.tan(a + 0.22) * H, H); ctx.fill();
    });
    ctx.fillStyle = '#9aa3b5'; ctx.fillRect(W / 2, 0, 0.6, 10);
    ctx.fillStyle = '#c9d8ff'; ctx.beginPath(); ctx.arc(W / 2, 16, 6, 0, Math.PI * 2); ctx.fill();
    for (let k = 0; k < 6; k++) { const a = t * 2 + k; ctx.fillStyle = '#ffffff'; ctx.fillRect(W / 2 + Math.cos(a) * 4, 16 + Math.sin(a * 1.3) * 4, 1, 1); }
    centered(INV.b || 'Le bar', W / 2, 32, '#f2c14b', 9);
    // DJ booth (left) and counter with the tapas (right)
    const bob = (ph, amp = 3) => -Math.abs(Math.sin(t * 5 + ph)) * amp;
    { // Colin is the DJ: headphones on, a little heart overhead
      const dy = Math.round(floorY - 34 + bob(0, 2));
      ctx.drawImage(COLIN, 18, dy);
      ctx.fillStyle = '#1e1a22'; ctx.fillRect(22, dy, 10, 1); ctx.fillRect(21, dy + 1, 1, 3); ctx.fillRect(32, dy + 1, 1, 3);
      ctx.fillStyle = '#e2505e'; ctx.fillRect(20, dy + 4, 2, 3); ctx.fillRect(32, dy + 4, 2, 3);
      textShadow('♥', 27, dy - 3 + Math.sin(t * 3) * 1.2, '#ff6b9a', 8);
    }
    ctx.fillStyle = '#1e1a22'; ctx.fillRect(8, floorY - 16, 46, 16); ctx.fillStyle = '#3a3f4a'; ctx.fillRect(8, floorY - 16, 46, 2);
    for (const dx of [16, 40]) { ctx.fillStyle = '#2b2340'; ctx.beginPath(); ctx.arc(dx, floorY - 10, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e2505e'; ctx.fillRect(dx - 0.5, floorY - 10.5, 1, 1); }
    if (Math.floor(t * 2) % 2) textShadow('♪', 30 + Math.sin(t) * 6, floorY - 36 - (t * 10 % 12), '#f2c14b', 8);
    ctx.drawImage(BARTENDER, W - 38, floorY - 32);
    ctx.fillStyle = '#6e4a2c'; ctx.fillRect(W - 62, floorY - 16, 58, 22); ctx.fillStyle = '#8a5a32'; ctx.fillRect(W - 62, floorY - 18, 58, 3);
    [[W - 56, '#f2c14b'], [W - 44, '#e2505e'], [W - 30, '#6fd06f'], [W - 18, '#f39c12']].forEach(([x, c]) => {
      ctx.fillStyle = '#fdf6e3'; ctx.fillRect(x, floorY - 21, 9, 3); ctx.fillStyle = c; ctx.fillRect(x + 2, floorY - 23, 5, 2);
    });
    textShadow('tapas', W - 33, floorY + 2, '#fdf6e3', 6);
    // Everyone dances: guests, the found supervisors, the cats, Ketsia in the middle.
    const perRow = Math.max(5, Math.floor(W / 30));
    const back = GUESTS.slice(0, perRow).map((g, k) => (k === 1 ? CHOUX[0] : k === 4 ? CHOUX[1] : g));
    const middle = [GUESTS[8], NOBLECAT[0], KS.d[0], BIGCAT_L, GUESTS[9]]; // Colin is at the decks
    const front = [GUESTS[10], ...SUPS.filter((p) => p.found && p.key !== 'ioana').map((p) => p.img), CHOUX[2], GUESTS[12], GUESTS[13]].slice(0, perRow);
    const rows = portrait ? [[back, floorY + 18], [middle, floorY + 44], [front, floorY + 72], [GUESTS.slice(4, 4 + perRow), floorY + 100]]
      : [[back, floorY + 16], [middle, floorY + 40], [front, floorY + 64]];
    rows.forEach(([row, y], r) => {
      row.forEach((img, k) => {
        const x = Math.round((W / (row.length + 1)) * (k + 1) - img.width / 2);
        const ph = k * 1.3 + r * 0.7, fl = Math.floor(t * 2 + ph) % 2;
        const top = Math.round(y - img.height + bob(CHOUX.includes(img) ? ph * 2 : ph, CHOUX.includes(img) ? 5 : 3));
        ctx.drawImage(fl ? flipped(img) : img, x, top);
        if (CHOUX.includes(img)) { // party hat
          const hx = x + 8; ctx.fillStyle = ['#f2c14b', '#e2505e', '#7fb3e0'][CHOUX.indexOf(img)];
          ctx.beginPath(); ctx.moveTo(hx - 3, top + 1); ctx.lineTo(hx + 3, top + 1); ctx.lineTo(hx, top - 6); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.fillRect(hx - 0.5, top - 7, 1.5, 1.5);
        }
      });
    });
    for (let k = 0; k < 28; k++) { // confetti
      const cx = (k * 47 + Math.sin(t + k) * 8) % W, cy = (t * (14 + k % 5 * 3) + k * 29) % (H - 34) + 34;
      ctx.fillStyle = ['#f2c14b', '#e9a3a6', '#7fb3e0', '#8fd67a', '#c38fd6'][k % 5];
      ctx.fillRect(Math.round(cx), Math.round(cy), 1 + (Math.floor(t * 4 + k) % 2), 1);
    }
    if (SUPS[2].found) { // Ioana does laps of the dance floor on her bike
      const ix = W / 2 + Math.sin(t * 0.9) * W * 0.36, img = Math.cos(t * 0.9) < 0 ? flipped(IOANA) : IOANA;
      ctx.drawImage(img, Math.round(ix - 13), Math.round(floorY + (portrait ? 124 : 70) - 22)); // clear of the bottom edge
    }
    if ((!cardShown || partyView) && Math.floor(t * 2) % 2) centered(partyView ? 'Touche l\'écran pour revoir ton invitation' : 'Touche l\'écran pour voir ton invitation', W / 2, H - 6, '#f4ead5', 7);
  }

  /* ================= the invitation card ================= */
  function parseTime(s) {
    const m = String(s || '').match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i);
    return m ? [Number(m[1]), Number(m[2] || 0)] : [19, 0];
  }
  function icsText() {
    const [hh, mm] = parseTime(INV.h);
    // 1 December is winter time in Paris: UTC+1.
    const start = new Date(Date.UTC(2026, 11, 1, hh - 1, mm));
    const end = new Date(start.getTime() + 5 * 3600 * 1000);
    const fmt = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
    const loc = [INV.b, INV.a].filter(Boolean).join(', ');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//invitation//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      'UID:ketsia-docteure-20261201@invitation', 'DTSTAMP:20261111T000000Z',
      `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
      'SUMMARY:' + esc(hope('Ketsia est docteure ! On fête ça')),
      loc ? 'LOCATION:' + esc(loc) : null,
      'DESCRIPTION:' + esc('Dress code : déguisé·e en mathématicien·ne. Tapas prévues au bar.'),
      'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n') + '\r\n';
  }
  /* ----- autosave: closing the tab mid-game no longer loses the progress ----- */
  const SAVE_KEY = 'invite-save';
  let saveT = 0;
  function snapshot() {
    if (!stats.played || state === 'end' || state === 'name') return;
    store.set(SAVE_KEY, JSON.stringify({
      v: 1, name: playerName, mode: extreme ? 'extreme' : hard ? 'hard' : 'normal', at: Date.now(),
      px: player.x, py: player.y, cp: checkpoint, solvedCount, hasBike, otDone, climbDone, rapStage, storyNext,
      carry: puzzle && puzzle.wonT < 0 ? { ...carry, [puzzle.label]: { wrong: puzzle.wrong, hints: puzzle.hints } } : carry,
      cats: cats.map((c) => ({ solved: c.solved, escaped: !!c.escaped, order: c.order, x: c.x, y: c.y, spot: c.spot || 0, fled: c.fled || 0 })),
      sups: SUPS.map((p) => p.found), stats: { ...stats, elapsed: Date.now() - stats.start },
    }));
  }
  function readSave() { try { const sv = JSON.parse(store.get(SAVE_KEY) || 'null'); return sv && sv.v === 1 ? sv : null; } catch (e) { return null; } }
  function resume(sv) {
    playerName = sv.name; hard = sv.mode !== 'normal'; extreme = sv.mode === 'extreme';
    trafficMul = extreme ? 1.9 : hard ? 1.3 : 1;
    player.x = sv.px; player.y = sv.py; checkpoint = sv.cp;
    sv.cats.forEach((c, i) => Object.assign(cats[i], c, { run: null, wait: false }));
    ({ solvedCount, hasBike, otDone, climbDone } = sv); carry = sv.carry || {}; rapStage = sv.rapStage || 0; storyNext = sv.storyNext || 0;
    SUPS.forEach((p, i) => { p.found = !!sv.sups[i]; });
    Object.assign(stats, sv.stats); stats.start = Date.now() - (sv.stats.elapsed || 0); delete stats.elapsed;
    for (const c of [...following(), colin]) { c.x = player.x; c.y = player.y; }
    if (extreme) { ghost.on = true; ghostHome(); }
    trail = []; state = 'play';
    $('nameBox').classList.add('hidden'); setTimeout(layout, 50);
    showToast(`Partie reprise, ${playerName} !`, 2.2);
  }
  window.addEventListener('pagehide', snapshot);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') snapshot(); });

  let cardShown = false, barT = 0, endAt = 0;
  let finalDip = null;
  function showCard() { // first the bar scene; the card pops up after a few seconds or a tap
    state = 'end'; cardShown = false; barT = 0; endAt = Date.now();
    if (stats.played) { // store the diploma first: closing during the bar scene must not lose the run
      stats.end = endAt; finalDip = diploma();
      store.set('invite-diploma', JSON.stringify(finalDip));
    }
    store.set(SAVE_KEY, ''); SFX.win();
    $('nameBox').classList.add('hidden');
  }
  function revealCard() {
    if (cardShown) return;
    cardShown = true;
    $('cBig').textContent = hope('Ketsia est docteure ! On fête ça.');
    $('nameBox').classList.add('hidden');
    $('cTitle').textContent = `${playerName === 'toi' ? 'Tu es' : playerName + ', tu es'} invité·e\u00a0!`; // no-break space: the "!" never wraps alone
    $('cWhen').textContent = `Mardi 1er décembre 2026, à partir de ${INV.h || '19h'}.`;
    const where = [INV.b, INV.a].filter(Boolean).join(' · ');
    if (where) {
      $('cBar').textContent = `Où : ${where}`;
      if (INV.a) {
        const q = encodeURIComponent([INV.b, INV.a].filter(Boolean).join(', '));
        $('cMap').href = `https://www.google.com/maps/search/?api=1&query=${q}`;
        $('cMap').classList.remove('hidden');
      }
    } else {
      $('cBar').textContent = 'Où : un bar de Rennes. L\'adresse arrive avec ton lien personnel, demande-la à la personne qui t\'a invité·e.';
    }
    if (INV.s) { $('cDef').textContent = `Avant ça, la soutenance : ${INV.s}${INV.sh ? ', ' + INV.sh : ''}.`; $('cDef').classList.remove('hidden'); }
    const food = String(INV.food || '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (food.length) {
      const ul = $('cFoodList'); ul.textContent = '';
      food.forEach((f) => { const li = document.createElement('li'); li.textContent = f; ul.appendChild(li); });
      ul.classList.remove('hidden');
    }
    const badges = [];
    if (supsFound() === 3) badges.push('Réunion d\'encadrement au complet : Loïc, Ioana et Véronique seront au bar.');
    if ((stats.tapas || 0) > 0) badges.push(`Tu as sauvé ${stats.tapas > 1 ? `${stats.tapas} fois` : 'une fois'} les tapas de ce soir des griffes du pigeon voleur.`);
    if (climbDone) badges.push('Badge secret : tu as grimpé la tour des maths, et Colin est descendu avec toi.');
    const fishN = Object.values(stats.fish || {}).reduce((a, b) => a + b, 0);
    if (fishN) {
      const f = stats.fish || {}, what = CATCHES.filter((c) => f[c.key]).map((c) => (f[c.key] > 1 ? `${f[c.key]} ${c.many}` : c.a));
      badges.push(`Repêché dans la Vilaine : ${what.join(', ') || 'rien de solide'}${f.poulpy ? ', et Poulpy le poulpe t\'a raconté une blague' : ''}.`);
    }
    if (otDone) badges.push('Badge Monge-Kantorovich : tu as rééquilibré les vélos de Rennes au moindre coût.');
    if (extreme && fragments() === 2) badges.push('Survivant·e du mode EXTRÊME DE LA MORT QUI TUE. Respect éternel.');
    else if (hard && solvedCount === 2) badges.push('Mode difficile terminé : {c2} t\'a fait confiance. C\'est rare.');
    if (badges.length) {
      const ul = $('cBadge'); ul.textContent = '';
      badges.forEach((b) => { const li = document.createElement('li'); li.textContent = N(b); ul.appendChild(li); });
      ul.classList.remove('hidden');
    }
    // Nothing to show in the "your run" column (skipped the game): one narrow column instead of two.
    const one = !stats.played && !badges.length;
    document.querySelector('#card .cols').classList.toggle('one', one);
    document.querySelector('#card .box').style.width = one ? 'min(100%, 560px)' : '';
    if (stats.played) {
      const dip = finalDip || diploma();
      $('cPdf').classList.remove('hidden');
      $('cPdf').onclick = (e) => { e.preventDefault(); downloadPdf(dip); };
      $('cScore').textContent = `Ton score : ${dip.score} points, mention ${dip.mention}. Ton diplôme t'attend en PDF : montre-le au bar !`;
      $('cScore').classList.remove('hidden');
      const bi = badgeInfo(dip);
      $('cBadgeImg').src = badgeCanvas(dip).toDataURL('image/png');
      $('cBadgeBtn').classList.remove('hidden');
      fillBadgeTip(dip, bi);
    }
    if (INV.m) { $('cMsg').textContent = INV.m; $('cMsg').classList.remove('hidden'); }
    if (INV.f) { $('cFrom').textContent = `— ${INV.f}`; $('cFrom').classList.remove('hidden'); }
    $('card').classList.remove('hidden');
  }
  // The badge sits in the card's top-right corner; hovering it (or a tap on a phone) shows how the score was made.
  function fillBadgeTip(d, bi) {
    const tip = $('cBadgeTip'); tip.textContent = '';
    const el = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = N(text); if (cls) e.className = cls; tip.appendChild(e); return e; };
    el('h3', `${bi.order} · niveau ${bi.rankName}`);
    el('p', 'Forme : ton mode de jeu. Couleur : ton score. Pierres : les encadrant·es croisé·es. Points du bas : vélo, escalade, pigeon, métro. Au bar, cherche qui a le même !', 'small');
    const t = el('table');
    const row = (label, value, cls) => { const tr = document.createElement('tr'); if (cls) tr.className = cls; [label, value].forEach((v) => { const td = document.createElement('td'); td.textContent = N(v); tr.appendChild(td); }); t.appendChild(tr); };
    d.puzzles.forEach((p) => row(p.label, `${p.score}`));
    const pts = d.parts || {};
    if (pts.sups) row(`Encadrant·es (${d.sups}/3)`, `+${pts.sups}`);
    if (pts.colin) row('Colin, en haut de la tour', `+${pts.colin}`);
    if (pts.fish) row('Repêchage dans la Vilaine', `+${pts.fish}`);
    if (pts.poulpy) row('Poulpy !', `+${pts.poulpy}`);
    if (pts.tapas) row('Tapas sauvées du pigeon', `+${pts.tapas}`);
    if (d.petBonus) row('Caresses aux chats', `+${d.petBonus}`);
    if (d.penalty) row('Accidents et fuites', `−${d.penalty}`);
    if (d.mult && d.mult !== 1) row('Multiplicateur de difficulté', `×${String(d.mult).replace('.', ',')}`);
    row('Total', `${d.score} points`, 'total');
    el('p', `Mention ${d.mention}. Score de référence : ${d.par || '?'} points (puzzles principaux parfaits et les trois encadrant·es).`, 'small');
  }
  $('cBadgeBtn').addEventListener('click', (e) => { e.stopPropagation(); $('cBadgeTip').classList.toggle('open'); });
  document.addEventListener('click', (e) => { if (!e.target.closest || !e.target.closest('#cBadgeTip')) $('cBadgeTip').classList.remove('open'); });

  // Souvenir photo: everyone met tonight, in front of the bar.
  function photo() {
    const c = document.createElement('canvas'); c.width = 480; c.height = 300;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(world, 72, 0, 160, 100, 0, 0, 480, 300);
    x.fillStyle = 'rgba(20,16,32,.35)'; x.fillRect(0, 0, 480, 300);
    const crew = [];
    SUPS.filter((p) => p.found).forEach((p) => crew.push(p.img));
    crew.splice(Math.floor(crew.length / 2), 0, NOBLECAT[0], KS.d[0], ...(climbDone ? [COLIN] : []), BIGCAT_L);
    const sc = crew.length > 4 ? 3 : 4, gap = crew.length > 4 ? 6 : 10, wsum = crew.reduce((s2, im) => s2 + im.width * sc + gap, -gap);
    let px = Math.round((480 - wsum) / 2);
    for (const im of crew) { x.drawImage(im, px, 230 - im.height * sc, im.width * sc, im.height * sc); px += im.width * sc + gap; }
    if (extreme && (stats.ghost || 0) > 0) { x.globalAlpha = 0.6; x.drawImage(GHOST, 420, 40, 42, 45); x.globalAlpha = 1; }
    x.fillStyle = '#fdf6e3'; x.fillRect(0, 0, 480, 44); x.fillRect(0, 252, 480, 48);
    x.fillStyle = '#2b2340'; x.textAlign = 'center';
    x.font = `bold ${hoping() ? 18 : 22}px ${FONT}`; x.fillText(hope('Ketsia est docteure !'), 240, 30);
    x.font = `bold 15px ${FONT}`; x.fillText(`${playerName === 'toi' ? 'Souvenir' : playerName} · mardi 1er décembre 2026`, 240, 282);
    x.strokeStyle = '#2b2340'; x.lineWidth = 6; x.strokeRect(3, 3, 474, 294);
    // toDataURL is synchronous (toBlob is not), so the new tab opens inside the click.
    const bin = atob(c.toDataURL('image/png').split(',')[1]);
    openFile(new Blob([Uint8Array.from(bin, (ch) => ch.charCodeAt(0))], { type: 'image/png' }), 'photo-souvenir.png');
  }
  $('cPhoto').addEventListener('click', (e) => { e.preventDefault(); photo(); });
  $('cIcs').addEventListener('click', (e) => {
    e.preventDefault();
    const url = URL.createObjectURL(new Blob([icsText()], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'ketsia-docteure.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  $('cReplay').addEventListener('click', (e) => { e.preventDefault(); location.reload(); });
  // Back to the party to watch it, then a tap (or Space) brings the card back.
  let partyView = false;
  $('cParty').addEventListener('click', (e) => { e.preventDefault(); partyView = true; $('card').classList.add('hidden'); });
  function backToCard() { partyView = false; $('card').classList.remove('hidden'); }

  /* ================= score & PDF diploma ================= */
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
  }
  const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
  function puzzleScore(p) {
    if (p.skipped) return 100;
    return Math.max(200, Math.round(1000 - 120 * p.wrong - 150 * p.hints - 4 * Math.max(0, p.time - 20)));
  }
  function diploma() {
    const puzzles = stats.puzzles.map((p) => ({ ...p, score: puzzleScore(p) }));
    const flees = bigcat.fled;
    const penalty = 40 * stats.hits + (hard ? 15 : 25) * flees;
    const petBonus = Math.min(100, 5 * stats.pets);
    const sups = supsFound(), tapas = stats.tapas || 0;
    const fish = { ...(stats.fish || {}) }, fishN = Object.values(fish).reduce((a, b) => a + b, 0);
    const parts = { sups: 150 * sups, tapas: Math.min(100, 20 * tapas), fish: Math.min(60, 10 * fishN), poulpy: fish.poulpy ? 50 : 0, colin: climbDone ? 50 : 0 };
    const extraBonus = Object.values(parts).reduce((a, b) => a + b, 0);
    const raw = Math.max(0, puzzles.reduce((s, p) => s + p.score, 0) + petBonus + extraBonus - penalty);
    const mult = extreme ? 2.5 : hard ? 1.5 : 1;
    const score = Math.round(raw * mult);
    // Par = every main puzzle perfect plus the three supervisors; bonuses can push past it.
    const par = mult * (1000 * (extreme ? 5 : 3) + 450), ratio = score / par;
    const mention = ratio >= 0.95 ? 'très honorable avec les félicitations du jury'
      : ratio >= 0.8 ? 'très honorable' : ratio >= 0.6 ? 'honorable' : 'passable (le jury a été clément)';
    const rank = ratio >= 0.95 ? 3 : ratio >= 0.8 ? 2 : ratio >= 0.6 ? 1 : 0;
    const d = {
      rank, supsWho: SUPS.map((p) => p.found), climb: climbDone, colin: climbDone, fish, stories: Math.min(storyNext, STORIES.length),
      name: playerName, hard, extreme, pets: stats.pets, petBonus, metro: stats.metro, sups, tapas, ghost: stats.ghost || 0, met: [...stats.met], god: !!stats.god, seconds: Math.round((stats.end - stats.start) / 1000), meters: Math.round(stats.dist / T * 10),
      hits: stats.hits, flees, bike: hasBike, bonus: otDone, puzzles, penalty, score, mention, parts, mult, par: Math.round(par),
      date: new Date(stats.end).toISOString(),
    };
    let h = 2166136261; // FNV-1a, a light anti-retouch stamp
    for (const ch of JSON.stringify(d)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    d.code = h.toString(36).toUpperCase().padStart(7, '0');
    return d;
  }

  /* ----- the badge: same play profile, same badge, so friends find each other at the bar ----- */
  const RANKS = [['Bronze', '#c07a3a'], ['Argent', '#c3c8d0'], ['Or', '#f2c14b'], ['Diamant', '#9b59b6']];
  const ORDERS = { normal: 'Ordre du Graphe', hard: 'Ordre du Pas de Loup', extreme: 'Ordre du Reviewer 2' };
  function badgeInfo(d) {
    const mode = d.extreme ? 'extreme' : d.hard ? 'hard' : 'normal';
    const rank = d.rank || 0, who = d.supsWho || [false, false, false], met = d.met || [];
    const flags = [!!d.bike, !!(d.climb || met.includes('climb')), (d.tapas || 0) > 0, (d.metro || 0) > 0];
    const code = `${{ normal: 'N', hard: 'D', extreme: 'X' }[mode]}${'BAOF'[rank]}-`
      + `${['L', 'V', 'I'].map((ch, i) => (who[i] ? ch : '·')).join('')}-`
      + `${['v', 'e', 'p', 'm'].map((ch, i) => (flags[i] ? ch : '·')).join('')}${(d.pets || 0) > 0 ? 'c' : ''}`;
    return { mode, rank, who, flags, pets: (d.pets || 0) > 0, code, order: ORDERS[mode], rankName: RANKS[rank][0] };
  }
  function badgeCanvas(d) {
    const b = badgeInfo(d);
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d');
    const px = (i, j, col) => { x.fillStyle = col; x.fillRect(i, j, 1, 1); };
    const inShape = (i, j) => { // shape = mode: round, shield, spiky star
      const dx = i + 0.5 - 16, dy = j + 0.5 - 16;
      if (b.mode === 'normal') return dx * dx + dy * dy <= 14.5 * 14.5;
      if (b.mode === 'hard') return Math.abs(dx) <= 13 && dy >= -14 && (dy <= 3 || Math.abs(dx) <= 13 - (dy - 3) * 1.15);
      return Math.hypot(dx, dy) <= 10.5 + 5 * (Math.cos(Math.atan2(dy, dx) * 8) + 1) / 2;
    };
    const col = RANKS[b.rank][1]; // colour = rank
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      if (!inShape(i, j)) continue;
      const edge = !inShape(i - 1, j) || !inShape(i + 1, j) || !inShape(i, j - 1) || !inShape(i, j + 1);
      const rim = !inShape(i - 2, j) || !inShape(i + 2, j) || !inShape(i, j - 2) || !inShape(i, j + 2);
      px(i, j, edge ? '#2b2340' : rim ? (b.rank === 3 ? '#f2c14b' : '#fdf6e3') : col);
    }
    ['....kk....', '..kkkkkk..', 'kkkkkkkkkk', '..kkkkkk..', '...kkkk.y.', '...kkkk.y.', '........y.']
      .forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') px(11 + i, 11 + j, ch === 'k' ? '#2b2340' : '#f2c14b'); }));
    if (b.pets) [[14, 19], [16, 19], [13, 20], [14, 20], [15, 20], [16, 20], [17, 20], [14, 21], [15, 21], [16, 21], [15, 22]].forEach(([i, j]) => px(i, j, '#e2505e'));
    const gem = (i, j, on, c2) => { x.fillStyle = '#2b2340'; x.fillRect(i - 1, j - 1, 5, 5); x.fillStyle = on ? c2 : '#6b6580'; x.fillRect(i, j, 3, 3); if (on) px(i, j, '#ffffff'); };
    gem(8, 6, b.who[0], '#4a6fa5'); gem(14, 4, b.who[1], '#c0392b'); gem(20, 6, b.who[2], '#2fa39a'); // Loïc, Véronique, Ioana
    const pip = (i, j, on, c2) => { x.fillStyle = '#2b2340'; x.fillRect(i - 1, j - 1, 4, 4); x.fillStyle = on ? c2 : '#4a4560'; x.fillRect(i, j, 2, 2); };
    [[8, 24, '#2f8fd0'], [12, 26, '#8c7f6e'], [18, 26, '#a6abb4'], [22, 24, '#d9534f']].forEach(([i, j, c2], k) => pip(i, j, b.flags[k], c2)); // bike, climb, pigeon, metro
    return c;
  }

  // Minimal one-page PDF writer: Helvetica (WinAnsi), filled rectangles, no dependency.
  const WINANSI = { '−': 0x2d, '★': 0x2a, '✓': 0x76, '—': 0x97, '–': 0x96, '…': 0x85, '’': 0x92, 'œ': 0x9c, 'Œ': 0x8c, '€': 0x80, '“': 0x93, '”': 0x94 };
  const ansi = (t) => [...String(t)].map((ch) => {
    const c = ch.charCodeAt(0);
    if (WINANSI[ch]) return String.fromCharCode(WINANSI[ch]);
    return c < 256 ? ch : '?';
  }).join('').replace(/[\\()]/g, '\\$&');
  function buildPdf(d) {
    const ops = [];
    const rgb = (hex) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
    const fill = (x, y, w, h, hex) => ops.push(`${rgb(hex)} rg ${x} ${y} ${w} ${h} re f`);
    const text = (t0, x, y, size, bold = false, hex = '#2b2340', align = 'left') => {
      const t = N(t0);
      const w = String(t).length * size * (bold ? 0.56 : 0.5);
      const xx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      ops.push(`BT ${rgb(hex)} rg /${bold ? 'F2' : 'F1'} ${size} Tf ${xx.toFixed(1)} ${y} Td (${ansi(t)}) Tj ET`);
    };
    // Each sprite is one embedded image (RGB + alpha mask), not one rectangle per pixel: a few
    // thousand tiny rectangles made Firefox's PDF viewer freeze an older laptop. Pixels are
    // upscaled 4x (nearest neighbour) so viewers that smooth images keep the pixel-art edges.
    const images = [];
    const sprite = (img, x, y, px) => { // y = bottom
      const k = 4, w = img.width * k, h = img.height * k;
      const data = img.getContext('2d').getImageData(0, 0, img.width, img.height).data;
      let rgbS = '', aS = '';
      for (let j = 0; j < h; j++) {
        let rowRgb = '', rowA = '';
        for (let i = 0; i < w; i++) {
          const o = ((j / k | 0) * img.width + (i / k | 0)) * 4;
          rowRgb += String.fromCharCode(data[o], data[o + 1], data[o + 2]);
          rowA += String.fromCharCode(data[o + 3] < 128 ? 0 : 255);
        }
        rgbS += rowRgb; aS += rowA;
      }
      const n = images.length;
      images.push({ w, h, rgbS, aS });
      ops.push(`q ${(img.width * px).toFixed(2)} 0 0 ${(img.height * px).toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im${n} Do Q`);
    };
    fill(0, 0, 595, 842, '#fdf6e3');
    ops.push(`${rgb('#2b2340')} RG 6 w 24 24 547 794 re S 1.5 w 38 38 519 766 re S`);
    text('DIPLÔME', 297, 752, 42, true, '#2b2340', 'center');
    text('de Docteur·e ès Invitation', 297, 722, 18, false, '#2b2340', 'center');
    text('décerné à', 297, 694, 13, false, '#6b6580', 'center');
    text(d.name, 297, 662, 30, true, '#b0782f', 'center');
    sprite(NOBLECAT[0], 150, 566, 5);
    sprite(KS.d[0], 257, 566, 5);
    sprite(flipH(BIGCAT[0]), 355, 566, 5);
    const bi = badgeInfo(d);
    sprite(badgeCanvas(d), 452, 690, 3);
    text(bi.order, 500, 680, 7.5, true, '#2b2340', 'center');
    text(`niveau ${bi.rankName}`, 500, 671, 7.5, false, '#2b2340', 'center');
    text(`badge ${bi.code}`, 500, 662, 7, false, '#6b6580', 'center');
    text(`Mention ${d.mention}`, 297, 536, 14, true, '#2c6a42', 'center');
    text(`${d.score} points`, 297, 504, 26, true, '#2b2340', 'center');
    const rows = [
      ['Difficulté', d.extreme ? 'EXTRÊME DE LA MORT QUI TUE (×2,5)' : d.hard ? 'Difficile (score ×1,5)' : 'Normal'],
      ['Temps total', fmtTime(d.seconds)],
      ['Distance parcourue dans Rennes', `${d.meters} m`],
      ['Accidents de circulation', String(d.hits)],
      ['Fuites de {c2}', String(d.flees)],
      ['Mode vélo', d.bike ? 'oui' : 'non'],
      ['Trajets en métro', String(d.metro || 0)],
      ['Caresses aux chats', `${d.pets || 0}${d.petBonus ? ` · +${d.petBonus} pts` : ''}`],
      ['Encadrant·es retrouvé·es', `${d.sups || 0} / 3${d.sups ? ` · +${150 * d.sups} pts` : ''}`],
      ['Tapas sauvées du pigeon', `${d.tapas || 0} fois`],
      ['Histoires des maths écoutées sur un banc', `${d.stories || 0} / ${STORIES.length}`],
      ['Repêché dans la Vilaine', (() => {
        const f = d.fish || {}, n = Object.values(f).reduce((a, b) => a + b, 0);
        if (!n) return 'rien';
        const parts = CATCHES.filter((c) => f[c.key]).map((c) => `${f[c.key]} ${f[c.key] > 1 ? c.many : c.one}`);
        return `${parts.join(', ')}${f.poulpy ? `${parts.length ? ', ' : ''}Poulpy !` : ''} · +${Math.min(60, 10 * n) + (f.poulpy ? 50 : 0)} pts`;
      })()],
      ['Colin, retrouvé en haut de la tour des maths', d.colin ? 'oui, il est venu au bar · +50 pts' : 'non'],
      ...(d.god ? [['Mode dieu (développeur)', 'oui, tricheur·se']] : []),
    ];
    if (d.extreme) rows.push(['Visites du Reviewer 2', String(d.ghost || 0)]);
    d.puzzles.forEach((p) => {
      const detail = p.skipped ? 'passé sans le résoudre' : `${fmtTime(p.time)} · ${plural(p.wrong, 'erreur')} · ${plural(p.hints, 'indice')}`;
      rows.push([p.label, `${detail} · ${p.score} pts`]);
    });
    if (!d.bonus) rows.push(['Bonus · transport optimal', 'non tenté']);
    if (d.penalty) rows.push(['Pénalités (accidents, fuites)', `−${d.penalty} pts`]);
    rows.push(['Score final', `${d.score} points`, true]);
    const rowH = Math.min(21, (466 - 224) / rows.length), fs = rowH < 13 ? 8 : rowH < 16 ? 9 : 11;
    let y = 462;
    for (const [label, value, bold] of rows) {
      text(label, 70, y, fs, !!bold); text(value, 525, y, fs, !!bold, '#2b2340', 'right');
      ops.push(`${rgb('#d8ccb0')} RG 0.5 w 70 ${(y - rowH * 0.3).toFixed(1)} m 525 ${(y - rowH * 0.3).toFixed(1)} l S`);
      y -= rowH;
    }
    // "Rencontres du voyage": a small sprite for everything this guest ran into, in order.
    const ICONS = {
      cat1: [NOBLECAT[0], '{c1}'], cat2: [BIGCAT[0], '{c2}'], loic: [LOIC, 'Loïc'], vero: [VERO, 'Véronique'],
      ioana: [IOANA, 'Ioana'], pigeon: [PIGEON[0], 'Pigeon'], bike: [BIKE_SIDE, 'Vélo'], metro: [METRO_ICON, 'Métro'],
      climb: [CLIMB_ICON, 'Escalade'], ghost: [GHOST, 'Reviewer 2'], rap: [RAP, 'Rapporteur'], ot: [tileCanvas('v'), 'Monge'],
      colin: [COLIN, 'Colin'], bench: [tileCanvas('n'), 'Banc'], fish: [GALETTE, 'Repêchage'], poulpy: [POULPY, 'Poulpy'],
    };
    const met = (d.met || []).filter((k) => ICONS[k]);
    text('Rencontres du voyage', 297, 206, 10, true, '#2b2340', 'center');
    if (!met.length) text('Aucune : un voyage en solitaire.', 297, 176, 9, false, '#6b6580', 'center');
    else {
      const slot = Math.min(60, 455 / met.length);
      met.forEach((k, n) => {
        const [img, name] = ICONS[k];
        const px = Math.min(2.4, 34 / img.height, (slot - 6) / img.width);
        const cxs = 70 + slot * n + slot / 2;
        sprite(img, cxs - img.width * px / 2, 162, px);
        text(name, cxs, 150, slot < 40 ? 5.5 : 7, false, '#2b2340', 'center');
      });
    }
    text('Rennes, mardi 1er décembre 2026', 297, 128, 12, true, '#2b2340', 'center');
    text('À présenter au bar le soir même. Le jury ({c2} et {c1}) se réserve', 297, 106, 10, false, '#6b6580', 'center');
    text('le droit de réclamer des caresses en guise de frais d\'inscription.', 297, 92, 10, false, '#6b6580', 'center');
    text(`Code de vérification : ${d.code}`, 297, 62, 9, false, '#6b6580', 'center');
    const content = ops.join('\n');
    // Objects 1-6 are fixed; image n is object 7+2n, its alpha mask 8+2n.
    const xobjs = images.map((im, n) => `/Im${n} ${7 + 2 * n} 0 R`).join(' ');
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << ${xobjs} >> >> /Contents 6 0 R >>`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ];
    images.forEach((im, n) => {
      objs.push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate false /SMask ${8 + 2 * n} 0 R /Length ${im.rgbS.length} >>\nstream\n${im.rgbS}\nendstream`);
      objs.push(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceGray /BitsPerComponent 8 /Interpolate false /Length ${im.aS.length} >>\nstream\n${im.aS}\nendstream`);
    });
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offs = objs.map((o, i) => { const at = out.length; out += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Uint8Array.from(out, (c) => c.charCodeAt(0) & 255);
  }
  function downloadPdf(d) {
    openFile(new Blob([buildPdf(d)], { type: 'application/pdf' }), `diplome-${String(d.name).replace(/[^\w-]+/g, '_') || 'invite'}.pdf`);
  }
  // Open a generated file in a new tab (phones show their viewer, with Share/Save); download if the tab is blocked.
  // Must run synchronously inside the click, or browsers treat the new tab as a popup.
  function openFile(blob, name) {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      const a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000); // the new tab still needs it for a while
  }

  /* ================= name screen ================= */
  const nameInput = $('nameInput');
  nameInput.value = INV.p || store.get('invite-name') || '';
  if ($('soundOn')) $('soundOn').checked = store.get('invite-sound') === 'on'; // read the preference first
  setSound(false, true, false); // start muted (audio needs a gesture) without overwriting the preference
  ['touchend', 'click'].forEach((ev) => document.addEventListener(ev, () => { if (soundOn) unlockAudio(); }, { passive: true }));
  function takeName() {
    if ($('soundOn')) setSound($('soundOn').checked, true);
    playerName = nameInput.value.trim().slice(0, 24) || 'toi';
    if (playerName !== 'toi') store.set('invite-name', playerName);
    const m = document.querySelector('input[name=mode]:checked');
    const mode = m ? m.value : 'normal';
    hard = mode !== 'normal'; extreme = mode === 'extreme';
    trafficMul = extreme ? 1.9 : hard ? 1.3 : 1;
  }
  $('nameForm').addEventListener('submit', (e) => {
    e.preventDefault(); takeName();
    $('nameBox').classList.add('hidden'); nameInput.blur();
    setTimeout(layout, 350); // iOS: the keyboard closing resizes the viewport
    intro();
  });
  try {
    const last = JSON.parse(store.get('invite-diploma') || 'null');
    if (last && last.code) {
      $('lastPdf').classList.remove('hidden');
      $('lastPdf').addEventListener('click', (e) => { e.preventDefault(); downloadPdf(last); });
    }
  } catch (e) { /* no saved diploma */ }
  {
    const sv = readSave();
    if (sv && sv.stats && sv.stats.played) {
      const l = $('resumeLink');
      l.textContent = `Reprendre ma partie en cours (${sv.name}, ${sv.mode === 'extreme' ? 'EXTRÊME' : sv.mode === 'hard' ? 'difficile' : 'normal'})`;
      l.classList.remove('hidden');
      l.addEventListener('click', (e) => { e.preventDefault(); setSound($('soundOn').checked, true); resume(sv); });
      let auto = false;
      try { auto = sessionStorage.getItem('invite-autoresume') === '1'; sessionStorage.removeItem('invite-autoresume'); } catch (e) { /* ignore */ }
      if (auto) resume(sv);
    }
  }
  $('skipLink').addEventListener('click', (e) => { e.preventDefault(); takeName(); showCard(); });
  $('pitchCats').textContent = `${CAT1} et ${CAT2}`;
  $('menuBtn').addEventListener('click', () => { if (state === 'play' && !paused) openObjectives(); });

  /* ================= input ================= */
  const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right', ShiftLeft: 'sneak', ShiftRight: 'sneak' };
  let godTaps = [];
  function godMode() {
    showToast('Mode dieu ✨', 1.2);
    if (!stats.played) { stats.played = true; stats.start = Date.now() - 600000; }
    cats.forEach((c) => { if (!c.solved) { c.solved = true; c.order = solvedCount++; } c.escaped = false; });
    SUPS.forEach((p) => { p.found = true; });
    hasBike = true; otDone = true; climbDone = true;
    stats.tapas = Math.max(1, stats.tapas || 0); stats.metro = Math.max(1, stats.metro || 0); stats.pets = Math.max(3, stats.pets);
    storyNext = Math.max(storyNext, STORIES.length);
    stats.fish = { galette: 1, cidre: 1, velo: 1, these: 1, triathlete: 1, poulpy: 1, ...(stats.fish || {}) };
    ['cat1', 'cat2', 'loic', 'vero', 'ioana', 'pigeon', 'bike', 'metro', 'climb', 'colin', 'bench', 'fish', 'poulpy', 'ot', 'rap'].concat(extreme ? ['ghost'] : []).forEach(meet);
    const labels = ['{c1} · partitionnement', '{c2} · Gromov-Wasserstein', 'Bonus · transport optimal', 'Easter egg · escalade', 'Rapporteur · anomalie']
      .concat(extreme ? ['Rapporteur · question 2', 'Rapporteur · question 3'] : []);
    for (const label of labels.map(N)) if (!stats.puzzles.some((p) => p.label === label)) stats.puzzles.push({ label, time: 30, wrong: 0, hints: 0, skipped: false });
    stats.god = true;
    showCard();
  }
  const hearts = [];
  function pet(c) {
    stats.pets++;
    hearts.push({ x: c.x, y: c.y - 14, t: 0, txt: c.key === 'cat1' ? 'prrr ♥' : 'MRRRR ♥' });
    SFX.purr();
  }
  function tryPet(wx, wy, r) {
    let best = null, bd = r;
    for (const c of following()) { const d = Math.hypot(c.x - wx, c.y - 6 - wy); if (d < bd) { bd = d; best = c; } }
    if (best) pet(best);
    return !!best;
  }
  function act() {
    if (state === 'dialog') advance();
    else if (state === 'play') tryPet(player.x, player.y - 6, 50);
  }
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    if (e.code === 'KeyM' && !e.repeat) { setSound(!soundOn); return; }
    if (paused) { if (e.code === 'Escape' || e.code === 'KeyO') { closeObjectives(); e.preventDefault(); } return; }
    if (e.code === 'KeyO' && state === 'play') { openObjectives(); e.preventDefault(); return; }
    if (state === 'end' && !cardShown && (e.code === 'Space' || e.code === 'Enter')) { revealCard(); e.preventDefault(); return; }
    if (state === 'end' && partyView && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) { backToCard(); e.preventDefault(); return; }
    if (state === 'metroMenu' && metro) {
      const opts = metroBoxes();
      if (e.code === 'Escape') { chooseMetro(-1); e.preventDefault(); return; }
      const n = Number((e.code.match(/^Digit(\d)$/) || [])[1]);
      if (n >= 1 && n <= opts.length) { chooseMetro(opts[n - 1].i); e.preventDefault(); }
      return;
    }
    if (state === 'puzzle' && puzzle) {
      if (e.code === 'Escape') { quitPuzzle(puzzle.quitMsg && puzzle.quitMsg()); e.preventDefault(); return; }
      if (puzzle.action && puzzle.wonT < 0 && !e.repeat && (e.code === 'Space' || e.code === 'Enter')) { puzzle.action(); e.preventDefault(); return; }
      if (puzzle.press && puzzle.wonT < 0 && !e.repeat) {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') { puzzle.press(0); e.preventDefault(); return; }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') { puzzle.press(1); e.preventDefault(); return; }
      }
    }
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
    else if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { act(); e.preventDefault(); }
    else if (e.code === 'Escape' && state === 'dialog') { skipDialog(); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height;
    if (state === 'dialog') { if (dlgSkipBox && inBox(dlgSkipBox, x, y)) skipDialog(); else advance(); return; }
    if (state === 'puzzle') { puzzleTap(x, y); return; }
    if (state === 'metroMenu') { metroTap(x, y); return; }
    if (state === 'end' && !cardShown) { revealCard(); return; }
    if (state === 'end' && partyView) { backToCard(); return; }
    if (state === 'play') {
      if (!touchUI() && inBox(menuHit(), x, y)) { openObjectives(); return; }
      const wx = x + lastCam.cx, wy = y + lastCam.cy;
      if (Math.hypot(wx - player.x, wy - (player.y - 8)) < 12) {
        const now = performance.now();
        godTaps = godTaps.filter((t0) => now - t0 < 4000); godTaps.push(now);
        if (godTaps.length >= 10) { godTaps = []; godMode(); return; }
      }
      if (tryPet(wx, wy, 14)) return;
      moveTarget = { x: wx, y: wy + 4 }; pointerHeld = true;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pointerHeld || state !== 'play') return;
    const r = cv.getBoundingClientRect();
    moveTarget = { x: (e.clientX - r.left) * W / r.width + lastCam.cx, y: (e.clientY - r.top) * H / r.height + lastCam.cy + 4 };
  });
  const release = () => { pointerHeld = false; };
  ['pointerup', 'pointercancel'].forEach((ev) => cv.addEventListener(ev, release));

  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (coarse || 'ontouchstart' in window) document.documentElement.classList.add('touch');
  function layout() {
    const vv0 = window.visualViewport;
    const sw = vv0 ? vv0.width : window.innerWidth, sh = vv0 ? vv0.height : window.innerHeight;
    portrait = sh > sw * 1.05;
    // Fill the screen: the short side is fixed, the long side follows the screen's shape.
    [W, H] = portrait ? [180, clamp(Math.round(180 * sh / sw), 280, 400)] : [clamp(Math.round(180 * sw / sh), 320, 400), 180];
    if (cv.width !== W * S || cv.height !== H * S) { cv.width = W * S; cv.height = H * S; }
    document.documentElement.classList.toggle('portrait', portrait);
    const touch = document.documentElement.classList.contains('touch');
    const padH = 0; // controls float over the game (touch) or are the keyboard
    void touch;
    const vv = window.visualViewport;
    const vw = vv ? vv.width : window.innerWidth, vh = (vv ? vv.height : window.innerHeight) - padH;
    const w = Math.max(100, Math.floor(Math.min(vw, vh * W / H)));
    cv.style.width = `${w}px`; cv.style.height = `${Math.floor(w * H / W)}px`;
  }
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 150));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
  document.querySelectorAll('#pad button').forEach((b) => {
    const k = b.dataset.k;
    const down = (e) => {
      e.preventDefault();
      if (k === 'act') act();
      else if (k === 'sound' || k === 'padtoggle') { /* handled on click: iOS only unlocks audio on a click */ }
      else if (k === 'sneak') { keys.sneak = !keys.sneak; b.classList.toggle('on', keys.sneak); } // toggle: easier with one thumb
      else { keys[k] = true; b.classList.add('on'); }
    };
    const up = () => { if (!['act', 'sneak', 'sound', 'padtoggle'].includes(k)) { keys[k] = false; b.classList.remove('on'); } };
    b.addEventListener('pointerdown', down);
    if (k === 'sound') b.addEventListener('click', () => setSound(!soundOn));
    if (k === 'padtoggle') b.addEventListener('click', () => {
      const on = !document.documentElement.classList.contains('showpad');
      document.documentElement.classList.toggle('showpad', on); store.set('invite-pad', on ? 'on' : 'off');
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => b.addEventListener(ev, up));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  /* ================= loop ================= */
  let last = performance.now();
  if (store.get('invite-pad') === 'on') document.documentElement.classList.add('showpad');
  let wasPlaying = null;
  // An error in one frame must never kill the game (a dead loop looks like a frozen or black screen).
  // It is logged, shown in the objectives panel for beta testers, and after a few in a row the game
  // drops whatever overlay broke and goes back to walking.
  const TEST = new URLSearchParams(location.search).has('test');
  let errRun = 0;
  function recover(e) {
    if (TEST) setTimeout(() => { throw e; }); // the e2e run must still fail on it
    try { console.error(e); store.set('invite-err', `${state} · ${String((e && e.stack) || e).split('\n').slice(0, 2).join(' ').slice(0, 240)}`); } catch (_) { /* ignore */ }
    if (++errRun < 3) return;
    errRun = 0; dlg = null; puzzle = null; metro = null; paused = false; $('objBox').classList.add('hidden');
    if (state !== 'end') state = 'play';
  }
  function loop(now) {
    requestAnimationFrame(loop); // scheduled first, so nothing below can stop the loop
    const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
    try {
      if ((state === 'play') !== wasPlaying) { wasPlaying = state === 'play'; document.documentElement.classList.toggle('playing', wasPlaying); }
      update(dt); render(); musicTick();
      errRun = 0;
    } catch (e) { recover(e); }
  }
  requestAnimationFrame(loop);
  // Phones may drop the pictures of a canvas while the tab sits in the background: the map and the
  // sprites come back blank (a black screen where Ketsia still moves). The game is saved when
  // hidden, so if that happened, reload and pick the run up where it was.
  function picturesLost() {
    try {
      return world.getContext('2d').getImageData(1, 1, 1, 1).data[3] === 0 || KS.d[0].getContext('2d').getImageData(8, 6, 1, 1).data[3] === 0;
    } catch (e) { return false; }
  }
  function checkPictures() {
    if (document.visibilityState !== 'visible' || !stats.played || state === 'end' || state === 'name' || !picturesLost()) return;
    snapshot();
    try { sessionStorage.setItem('invite-autoresume', '1'); } catch (e) { /* ignore */ }
    location.reload();
  }
  document.addEventListener('visibilitychange', () => setTimeout(checkPictures, 300));
  window.addEventListener('pageshow', () => setTimeout(checkPictures, 300));

  // Test hook: lets an automated check drive the game without a human.
  function art(kind) { // link-preview image (1200x630) and tab icon (64x64), generated from the game's own sprites
    const c = document.createElement('canvas'), x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    if (kind === 'icon') {
      c.width = c.height = 64; x.fillStyle = '#2b2340'; x.fillRect(0, 0, 64, 64);
      x.drawImage(KS.d[0], 0, 0, 16, 16, 4, 4, 56, 56); return c.toDataURL('image/png');
    }
    c.width = 1200; c.height = 630;
    x.drawImage(world, 72, 0, 200, 105, 0, 0, 1200, 630);
    x.fillStyle = 'rgba(20,16,32,.45)'; x.fillRect(0, 0, 1200, 630);
    const crew = [NOBLECAT[0], KS.d[0], flipH(BIGCAT[0])], sc = 9, gap = 30;
    let px = (1200 - crew.reduce((a, im) => a + im.width * sc + gap, -gap)) / 2;
    for (const im of crew) { x.drawImage(im, px, 520 - im.height * sc, im.width * sc, im.height * sc); px += im.width * sc + gap; }
    x.fillStyle = '#fdf6e3'; x.fillRect(0, 0, 1200, 120);
    x.fillStyle = '#2b2340'; x.textAlign = 'center'; x.font = `bold 64px ${FONT}`; x.fillText('Une invitation t\'attend…', 600, 82);
    x.fillStyle = '#f2c14b'; x.font = `bold 34px ${FONT}`; x.fillText('Un petit jeu pixel art · Rennes · 1er décembre 2026', 600, 590);
    x.strokeStyle = '#2b2340'; x.lineWidth = 16; x.strokeRect(8, 8, 1184, 614);
    return c.toDataURL('image/png');
  }
  if (new URLSearchParams(location.search).has('test')) window.__invite = {
    art, snapshot, BENCHES, colin, world, COLIN_DIR, PIER, CATCHES, POULPY,
    perf(n = 200) { const t0 = performance.now(); for (let i = 0; i < n; i++) { update(1 / 60); render(); } return (performance.now() - t0) / n; }, get storyNext() { return storyNext; }, get mode() { return extreme ? 'extreme' : hard ? 'hard' : 'normal'; },
    get state() { return state; }, get hasBike() { return hasBike; }, get otDone() { return otDone; },
    player, cats, rap, keys, stats, get rapStage() { return rapStage; }, get soundOn() { return soundOn; }, badgeInfo, badgeCanvas, STATIONS, SUPS, pigeon, ghost, meet, chooseMetro, setSound, get fragments() { return fragments(); }, get moveTarget() { return moveTarget; }, WALL, get climbDone() { return climbDone; }, get puzzle() { return puzzle; }, puzzleTap, quitPuzzle, PM, get W() { return W; }, get H() { return H; }, buildPdf, diploma, godMode, bikeSpot, otSpot, BIGCAT_SPOTS, blocked, showCard, win: () => win(), advance,
  };
})();
