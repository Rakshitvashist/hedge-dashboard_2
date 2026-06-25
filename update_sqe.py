"""
Update pipeline for the SQE All-Indices site (Smcresearch/SQE-).

Keeps the SQE site's DATA in sync with the source workbook in one command, so
data.js and holdings.js can never drift apart. It ONLY touches the two data
files — the SQE site's customised app.js / index.html / style.css are never
overwritten.

Steps (all from the same workbook state -> no data mismatch):
  1. (optional) regenerate data.js via extract_dashboard_data.py
  2. regenerate holdings.js via build_holdings.py   (reads the same workbook)
  3. copy data.js into the SQE site
  4. commit & push the SQE repo (its pre-commit hook bumps the cache-bust ?v=)

Usage:
  python update_sqe.py            # sync current data.js + rebuild holdings, push
  python update_sqe.py --extract  # also re-run the full extractor first (slow)

Note: run this AFTER the workbook (Hedge_Pro_Summary_759.xlsx) is up to date.
Without --extract it reuses the existing data.js, so make sure data.js was
generated from the current workbook (e.g. right after the daily update).
"""
import os
import re
import shutil
import subprocess
import sys

MAIN = os.path.dirname(os.path.abspath(__file__))   # the main repo (this folder)
SQE = os.environ.get('SQE_HOST', r'd:/SQE-host')    # the SQE site repo


def run(cmd, cwd=None, check=True):
    print('   $', ' '.join(cmd))
    return subprocess.run(cmd, cwd=cwd, check=check)


def data_last_update(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            head = f.read(4000)
        m = re.search(r'"last_update"\s*:\s*"([^"]+)"', head)
        return m.group(1) if m else 'unknown'
    except OSError:
        return 'unknown'


def main():
    extract = '--extract' in sys.argv

    for p in (MAIN, SQE):
        if not os.path.isdir(p):
            sys.exit(f'[error] path not found: {p}')
    if not os.path.isdir(os.path.join(SQE, '.git')):
        sys.exit(f'[error] {SQE} is not a git repo')

    py = sys.executable

    if extract:
        print('[1/4] Regenerating data.js (extract_dashboard_data.py) ...')
        run([py, 'extract_dashboard_data.py'], cwd=MAIN)
    else:
        print('[1/4] Using existing data.js (pass --extract to regenerate).')

    print('[2/4] Regenerating holdings.js (build_holdings.py) ...')
    run([py, 'build_holdings.py'], cwd=MAIN)

    print('[3/4] Copying data.js -> SQE site ...')
    shutil.copyfile(os.path.join(MAIN, 'data.js'), os.path.join(SQE, 'data.js'))

    print('[4/4] Commit & push SQE repo ...')
    run(['git', 'add', 'data.js', 'holdings.js'], cwd=SQE)
    # Commit only if something actually changed.
    if run(['git', 'diff', '--cached', '--quiet'], cwd=SQE, check=False).returncode == 0:
        print('   No data changes - SQE site already up to date.')
        return
    stamp = data_last_update(os.path.join(SQE, 'data.js'))
    run(['git', 'commit', '-m', f'data: sync SQE data.js + holdings.js ({stamp})'], cwd=SQE)
    run(['git', 'push', 'origin', 'main'], cwd=SQE)
    print(f'\n[OK] SQE site updated and pushed (data as of {stamp}).')


if __name__ == '__main__':
    main()
