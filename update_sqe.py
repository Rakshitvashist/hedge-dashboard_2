"""
Update pipeline for the SQE All-Indices site (Smcresearch/SQE-).

Keeps the SQE site's DATA in sync with the source workbook in one command, so
data.js and holdings.js can never drift apart. It ONLY touches the two data
files — the SQE site's customised app.js / index.html / style.css are never
overwritten.

Steps (all from the same source state -> no data mismatch):
  1. (--extract) refresh per-stock price CSVs from yfinance so live prices are
     current: data_set_nifty5.py, data_set_nifty500.py, update_stocks.py
  2. (--extract) re-run the 3 backtests (som_hedge.py) with START_MONTH=2019-12
     so the SQE site keeps its earlier history, then regenerate data.js via
     extract_dashboard_data.py
  3. regenerate holdings.js via build_holdings.py   (reads the same workbook)
  4. copy data.js into the SQE site
  5. commit & push the SQE repo (its pre-commit hook bumps the cache-bust ?v=)

The backtest start is SQE-only: som_hedge.py defaults to 2021-04 (the main
dashboard's daily run), and this pipeline overrides START_MONTH=2019-12, so the
two dashboards stay independent.

Usage:
  python update_sqe.py            # sync current data.js + rebuild holdings, push
  python update_sqe.py --extract  # full rebuild: prices -> 3 backtests -> extract -> push

--extract is HEAVY (~1300 yfinance symbols + 3 full backtests, ~30-60 min,
needs network). Use it when refreshing the SQE site's data for a new month.
Without it, the existing data.js is reused as-is (quick sync only).
"""
import os
import re
import shutil
import subprocess
import sys

MAIN = os.path.dirname(os.path.abspath(__file__))   # the main repo (this folder)

# Both SQE sites share the same data.js (all universes); each has its own
# holdings.js generated from its workbook.
SITES = [
    {'name': 'All-Indices', 'dir': os.environ.get('SQE_HOST', r'd:/SQE-host'),
     'workbook': 'Hedge_Pro_Summary_759.xlsx'},
    {'name': 'Nifty 500',   'dir': os.environ.get('PROQUANT_HOST', r'd:/SQE-ProQuant-host'),
     'workbook': 'Hedge_nifty500.xlsx'},
]

# The SQE site backtests from an earlier start than the main dashboard (which
# defaults to 2021-04). 2019-12 -> first held portfolio Jan 2020.
SQE_START_MONTH = '2019-12'

# (env for STOCKS_FOLDER, BENCHMARK_FILE, OUTPUT_FILE, DEEP_DIVE_FILE) per universe
BACKTESTS = [
    ('nifty50_host',  'NIFTY50_1d.csv',  'Hedge_nifty50.xlsx',          'Hedge_Institutional_Deep_Dive_nifty50.xlsx'),
    ('nifty500_host', 'NIFTY500_1d.csv', 'Hedge_nifty500.xlsx',         'Hedge_Institutional_Deep_Dive_nifty500.xlsx'),
    ('TOTAL_STOCKS',  'NIFTY500_1d.csv', 'Hedge_Pro_Summary_759.xlsx',  'Hedge_Institutional_Deep_Dive_759.xlsx'),
]


def run(cmd, cwd=None, check=True, env=None):
    print('   $', ' '.join(cmd))
    return subprocess.run(cmd, cwd=cwd, check=check, env=env)


def data_last_update(path):
    # last_update sits at the END of data.js, so read the tail of the file.
    try:
        with open(path, 'rb') as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - 4000))
            tail = f.read().decode('utf-8', 'ignore')
        m = re.search(r'"last_update"\s*:\s*"([^"]+)"', tail)
        return m.group(1) if m else 'unknown'
    except OSError:
        return 'unknown'


def main():
    extract = '--extract' in sys.argv

    if not os.path.isdir(MAIN):
        sys.exit(f'[error] path not found: {MAIN}')
    sites = [s for s in SITES if os.path.isdir(os.path.join(s['dir'], '.git'))]
    for s in SITES:
        if s not in sites:
            print(f"   [warn] skipping {s['name']}: {s['dir']} is not a git repo")
    if not sites:
        sys.exit('[error] no SQE site repos found')

    py = sys.executable

    if extract:
        # Refresh the per-stock price CSVs from yfinance FIRST (same as the
        # original daily flow) so the live portfolio shows current prices.
        # get_live_prices reads nifty50_host -> nifty500_host -> TOTAL_STOCKS,
        # so all three are refreshed to stay consistent.
        print('[1/5] Refreshing live price CSVs from yfinance (this takes a few minutes) ...')
        for sc in ('data_set_nifty5.py', 'data_set_nifty500.py', 'update_stocks.py'):
            if os.path.exists(os.path.join(MAIN, sc)):
                print(f'   -> {sc}')
                run([py, sc], cwd=MAIN)
            else:
                print(f'   (skip) {sc} not found')
        # Re-run the 3 backtests with the SQE start month so the SQE site stays
        # at its earlier history independently of the main dashboard's default.
        print(f'[2/5] Running backtests (som_hedge.py, START_MONTH={SQE_START_MONTH}) for all 3 universes ...')
        for stocks, bench, out, deep in BACKTESTS:
            env = {**os.environ, 'STOCKS_FOLDER': stocks, 'BENCHMARK_FILE': bench,
                   'OUTPUT_FILE': out, 'DEEP_DIVE_FILE': deep,
                   'START_MONTH': SQE_START_MONTH, 'PYTHONIOENCODING': 'utf-8'}
            print(f'   -> {out}  ({stocks})')
            run([py, '-u', 'som_hedge.py'], cwd=MAIN, env=env)
    else:
        print('[1-2] Quick mode: skipping price refresh + backtests (pass --extract for those).')

    # ALWAYS regenerate data.js from the current workbooks so the SQE sites
    # reflect the workbook state directly — never the main repo's own data.js
    # (which may be the main dashboard's different history).
    print('[3] Regenerating data.js from workbooks (extract_dashboard_data.py) ...')
    run([py, 'extract_dashboard_data.py'], cwd=MAIN)

    stamp = data_last_update(os.path.join(MAIN, 'data.js'))
    for i, s in enumerate(sites, 1):
        print(f"\n[{i}/{len(sites)}] Updating {s['name']} site ({s['dir']}) ...")
        # Site-specific holdings.js from its own workbook.
        env = {**os.environ, 'HOLDINGS_SRC': s['workbook'],
               'HOLDINGS_OUT': os.path.join(s['dir'], 'holdings.js')}
        run([py, 'build_holdings.py'], cwd=MAIN, env=env)
        # Same shared data.js for every site.
        shutil.copyfile(os.path.join(MAIN, 'data.js'), os.path.join(s['dir'], 'data.js'))
        run(['git', 'add', 'data.js', 'holdings.js'], cwd=s['dir'])
        if run(['git', 'diff', '--cached', '--quiet'], cwd=s['dir'], check=False).returncode == 0:
            print(f"   No changes - {s['name']} already up to date.")
            continue
        run(['git', 'commit', '-m', f'data: sync data.js + holdings.js ({stamp})'], cwd=s['dir'])
        run(['git', 'push', 'origin', 'main'], cwd=s['dir'])
        print(f"   [OK] {s['name']} pushed.")

    # Leave the main repo pristine — extract regenerated its data.js/index.html
    # only as a transient source for the SQE sites; the main dashboard keeps its
    # own (committed) state.
    run(['git', 'checkout', '--', 'data.js', 'index.html'], cwd=MAIN, check=False)
    print(f'\n[OK] Done. Sites updated (data as of {stamp}). Main repo left unchanged.')


if __name__ == '__main__':
    main()
