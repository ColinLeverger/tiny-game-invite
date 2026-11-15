#!/usr/bin/env python3
"""Build bilan.html, the after-party recap page, from the GoatCounter counts.

    make bilan        # fetch the counts from the GoatCounter API, write bilan.html
    make bilan-demo   # same page from made-up counts, written to bilan-demo.html (git-ignored)

Needs GOATCOUNTER_TOKEN (an API key with "Read statistics", created in GoatCounter under
Settings > API) in the shell or in .env. The fetched counts are saved to
bilan-counts.json so the page can be rebuilt offline with `--from bilan-counts.json`.

GoatCounter counts unique visitors per path, so every figure here is "how many people
did X", not "how many times". Events are not linked to each other: we know how many
people found Poulpy and how many won gold, never whether they were the same people.
That is the price of keeping it anonymous, and the page words its figures that way.
"""
import argparse
import datetime as dt
import html
import json
import os
import sys
import urllib.parse
import urllib.request

SITE = 'https://ketsia-invite.goatcounter.com'
MODES = [('normal', 'Normal'), ('difficile', 'Difficile'), ('extreme', 'Extrême de la mort qui tue')]
MEDALS = [('bronze', 'Bronze', '#c07a3a'), ('argent', 'Argent', '#c3c8d0'), ('or', 'Or', '#f2c14b'), ('diamant', 'Diamant', '#9b59b6')]
DURATIONS = ['0-10', '10-20', '20-30', '30-45', '45-60', '60+']
# rencontre/<key>: what the share of players reads like on the page.
MEETS = [
    ('cat1', 'ont retrouvé le premier chat au Thabor'),
    ('cat2', 'ont ramené le chat craintif de la Vilaine'),
    ('rap', 'ont convaincu le rapporteur'),
    ('loic', 'ont croisé Loïc entre deux morceaux de FIP'),
    ('vero', 'ont souhaité bon voyage à Véronique'),
    ('ioana', 'ont salué Ioana et la petite à vélo'),
    ('bike', 'ont trouvé la station de vélos'),
    ('ot', 'ont relevé le défi Monge'),
    ('metro', 'ont pris le métro'),
    ('climb', 'ont grimpé la tour des maths'),
    ('colin', 'ont trouvé Colin et sa guitare là-haut'),
    ('pigeon', 'ont partagé des tapas avec un pigeon'),
    ('bench', 'se sont posé·es sur un banc'),
    ('fish', 'sont allé·es pêcher sur la Vilaine'),
    ('poulpy', 'ont remonté Poulpy le poulpe'),
    ('ghost', 'ont été rattrapé·es par le Reviewer 2'),
]
CATCHES = [('galette', 'une galette-saucisse'), ('cidre', 'une bouteille de cidre'), ('velo', 'un vélo'),
           ('these', 'le chapitre 3 de la thèse (v1)'), ('triathlete', 'un triathlète'), ('poulpy', 'Poulpy')]
CARD = [('agenda', 'ont ajouté la fête à leur agenda'), ('photo', 'ont pris la photo souvenir'),
        ('rejouer', 'ont rejoué'), ('revoir-fete', 'sont retourné·es voir la fête')]


def load_env(path='.env'):
    """Read KEY=VALUE lines the way `set -a; . ./.env` would for simple files."""
    if not os.path.exists(path):
        return
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"\''))


def fetch(token, start):
    """All paths with their visitor count, following the API's pagination."""
    counts, seen = {}, []
    end = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)).strftime('%Y-%m-%dT00:00:00Z')
    while True:
        q = {'start': f'{start}T00:00:00Z', 'end': end, 'limit': '100'}
        if seen:
            q['exclude_paths'] = ','.join(map(str, seen))
        req = urllib.request.Request(f'{SITE}/api/v0/stats/hits?{urllib.parse.urlencode(q)}',
                                     headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
        for h in data.get('hits', []):
            seen.append(h['path_id'])
            # Page views land under the site's own path (/tiny-game-invite/...): pool them as visits.
            key = h['path'].lstrip('/') if h.get('event') else '_visits'
            counts[key] = counts.get(key, 0) + int(h.get('count', 0))
        if not data.get('more'):
            return counts


def demo():
    c = {'_visits': 64, 'infos-directes': 9, 'reprise/normal': 6, 'reprise/difficile': 3}
    starts = {'normal': 31, 'difficile': 14, 'extreme': 5}
    ends = {'normal': [3, 8, 11, 4], 'difficile': [1, 3, 4, 2], 'extreme': [1, 1, 0, 1]}
    for m, n in starts.items():
        c[f'debut/{m}'] = n
        for (k, *_), v in zip(MEDALS, ends[m]):
            c[f'fin/{m}/{k}'] = v
        for d, v in zip(DURATIONS, [1, 6, 9, 5, 3, 2] if m == 'normal' else [0, 1, 3, 4, 2, 1]):
            c[f'duree/{m}/{d}-min'] = v
        for s, v in enumerate([1, 3, 6, 9] if m == 'normal' else [0, 1, 2, 2]):
            c[f'encadrants/{m}/{s}-sur-3'] = v
    for (k, _), v in zip(MEETS, [50, 46, 43, 30, 22, 27, 35, 18, 29, 21, 21, 33, 12, 25, 6, 4]):
        c[f'rencontre/{k}'] = v
    for (k, _), v in zip(CATCHES, [24, 19, 17, 12, 7, 6]):
        c[f'peche/{k}'] = v
    for (k, _), v in zip(CARD, [38, 15, 11, 9]):
        c[f'carte/{k}'] = v
    return c


def pct(n, d):
    return min(100, round(100 * n / d)) if d else 0  # resumed runs can push a share past its base


def bar(label, n, total, color='var(--gold)', note=''):
    p = pct(n, total)
    return (f'<div class="row"><div class="lbl">{html.escape(label)}</div>'
            f'<div class="track"><div class="fill" style="width:{p}%;background:{color}"></div></div>'
            f'<div class="num">{p}&nbsp;%<small>{n}{html.escape(note)}</small></div></div>')


def render(c, demo_mode):
    g = lambda k: c.get(k, 0)
    starts = sum(g(f'debut/{m}') for m, _ in MODES)
    ends = sum(g(f'fin/{m}/{k}') for m, _ in MODES for k, *_ in MEDALS)
    visits = g('_visits') or starts
    s = []
    s.append(f'''<section class="hero">
  <div class="big"><b>{visits}</b><span>invité·es ont ouvert le lien</span></div>
  <div class="big"><b>{starts}</b><span>ont lancé une partie</span></div>
  <div class="big"><b>{ends}</b><span>ont ramené les chats au bar</span></div>
  <div class="big"><b>{g("infos-directes")}</b><span>pressé·es ont sauté direct aux infos</span></div>
</section>''')
    s.append('<section><h2>Le mode choisi</h2>' + ''.join(bar(lbl, g(f'debut/{m}'), starts) for m, lbl in MODES) + '</section>')
    med = '<section><h2>Les médailles</h2><p class="hint">Sur les parties terminées.</p>'
    for m, lbl in MODES:
        tot = sum(g(f'fin/{m}/{k}') for k, *_ in MEDALS)
        if not tot:
            continue
        cells = ''.join(f'<span class="medal" style="--c:{col}" title="{name}">{name}<b>{g(f"fin/{m}/{k}")}</b></span>' for k, name, col in MEDALS)
        med += f'<div class="medals"><div class="lbl">{lbl}</div>{cells}</div>'
    s.append(med + '</section>')
    s.append('<section><h2>Qui a fait quoi</h2><p class="hint">Part des joueur·ses qui ont lancé une partie.</p>'
             + ''.join(bar(txt, g(f'rencontre/{k}'), starts) for k, txt in sorted(MEETS, key=lambda kv: -g(f'rencontre/{kv[0]}'))) + '</section>')
    fishers = g('rencontre/fish') or max([g(f'peche/{k}') for k, _ in CATCHES] + [1])
    s.append('<section><h2>Le repêchage de la Vilaine</h2><p class="hint">Part des pêcheur·ses qui ont remonté…</p>'
             + ''.join(bar(txt, g(f'peche/{k}'), fishers, '#7fb8d8') for k, txt in CATCHES) + '</section>')
    dur = '<section><h2>Le temps passé</h2><div class="hist">'
    dtot = [sum(g(f'duree/{m}/{d}-min') for m, _ in MODES) for d in DURATIONS]
    top = max(dtot + [1])
    for d, n in zip(DURATIONS, dtot):
        dur += f'<div class="col"><div class="stick" style="height:{round(100 * n / top)}%"><b>{n}</b></div><span>{d}&nbsp;min</span></div>'
    s.append(dur + '</div></section>')
    sup = [sum(g(f'encadrants/{m}/{n}-sur-3') for m, _ in MODES) for n in range(4)]
    s.append('<section><h2>Les trois encadrant·es</h2><p class="hint">Combien chacun·e en a invité, sur les parties terminées.</p>'
             + ''.join(bar(f'{n} sur 3', sup[n], sum(sup), 'var(--accent)') for n in range(4)) + '</section>')
    s.append('<section><h2>Et après la partie</h2>' + ''.join(bar(txt, g(f'carte/{k}'), ends) for k, txt in CARD) + '</section>')
    banner = '<div class="demo">Aperçu avec des chiffres inventés</div>' if demo_mode else ''
    today = dt.date.today().strftime('%d/%m/%Y')
    return PAGE.replace('{{BANNER}}', banner).replace('{{BODY}}', '\n'.join(s)).replace('{{DATE}}', today)


PAGE = '''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Bilan de la fête</title>
<link rel="icon" href="icon.png">
<style>
  :root { --ink: #2b2340; --paper: #fdf6e3; --accent: #e9a3a6; --gold: #f2c14b; --bg: #16131f; --muted: #a59cb8; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--paper); font-family: "Courier New", Courier, monospace; line-height: 1.4; }
  main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { color: var(--gold); font-size: clamp(24px, 6vw, 36px); margin: 8px 0 4px; }
  h2 { color: var(--accent); font-size: 18px; margin: 0 0 10px; }
  .sub, .hint, footer { color: var(--muted); font-size: 14px; }
  .hint { margin: -6px 0 10px; }
  section { background: rgba(253, 246, 227, .05); border: 2px solid rgba(242, 193, 75, .25); border-radius: 10px; padding: 16px; margin: 16px 0; }
  .hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .big b { display: block; font-size: 40px; color: var(--gold); }
  .big span { font-size: 14px; }
  .row { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(60px, 1fr) 64px; gap: 10px; align-items: center; margin: 7px 0; font-size: 14px; }
  .track { height: 12px; background: rgba(253, 246, 227, .1); border-radius: 6px; overflow: hidden; }
  .fill { height: 100%; border-radius: 6px; }
  .num { text-align: right; font-weight: bold; }
  .num small { display: block; font-weight: normal; color: var(--muted); font-size: 11px; }
  .medals { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 8px 0; }
  .medals .lbl { flex: 1 0 100%; font-size: 14px; }
  .medal { border: 2px solid var(--c); color: var(--c); border-radius: 20px; padding: 3px 10px; font-size: 13px; }
  .medal b { margin-left: 6px; color: var(--paper); }
  .hist { display: flex; gap: 8px; align-items: flex-end; height: 160px; }
  .col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; font-size: 12px; }
  .stick { width: 100%; min-height: 4px; background: var(--gold); border-radius: 6px 6px 0 0; position: relative; }
  .stick b { position: absolute; top: -18px; width: 100%; text-align: center; color: var(--paper); }
  .col span { margin-top: 4px; color: var(--muted); white-space: nowrap; }
  .demo { background: var(--accent); color: var(--ink); text-align: center; font-weight: bold; padding: 6px; }
  a { color: var(--gold); }
  @media (max-width: 480px) { .row { grid-template-columns: 1fr 64px; } .track { grid-column: 1 / -1; grid-row: 2; } }
</style>
</head>
<body>
{{BANNER}}
<main>
  <h1>Bilan de la fête</h1>
  <p class="sub">Ce que vous avez fait dans le jeu de l'invitation de Ketsia, en chiffres.</p>
{{BODY}}
  <footer>
    <p>Comptes anonymes : aucun prénom, aucune adresse, aucun cookie. Chaque chiffre compte des personnes, pas des parties,
    et les chiffres ne sont pas liés entre eux. Arrêté le {{DATE}}.</p>
    <p><a href="index.html">Rejouer</a></p>
  </footer>
</main>
</body>
</html>
'''


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--demo', action='store_true', help='made-up counts, written to bilan-demo.html')
    ap.add_argument('--from', dest='src', help='rebuild from a saved counts JSON instead of the API')
    ap.add_argument('--start', default='2026-11-01', help='first day counted (YYYY-MM-DD)')
    a = ap.parse_args()
    if a.demo:
        counts, out = demo(), 'bilan-demo.html'
    elif a.src:
        counts, out = json.load(open(a.src, encoding='utf-8')), 'bilan.html'
    else:
        load_env()
        token = os.environ.get('GOATCOUNTER_TOKEN')
        if not token:
            sys.exit('GOATCOUNTER_TOKEN missing: create an API key (Settings > API, "Read statistics") '
                     'on ketsia-invite.goatcounter.com and put GOATCOUNTER_TOKEN=... in .env')
        counts, out = fetch(token, a.start), 'bilan.html'
        with open('bilan-counts.json', 'w', encoding='utf-8') as f:
            json.dump(counts, f, ensure_ascii=False, indent=1, sort_keys=True)
        print('counts saved: bilan-counts.json')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(render(counts, a.demo))
    print(f'written: {out}')


if __name__ == '__main__':
    main()
