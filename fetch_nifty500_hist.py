"""
Fetch price history for Nifty 500 constituents that left the index and so were
never downloaded into nifty500_host. Saves into nifty500_hist/ in the same CSV
schema, named by the BASKET symbol so the point-in-time SOM can match them.

Strategy per symbol: curated rename (if known) -> {SYM}.NS -> {SYM}.BO.
NSE DUMMY* placeholder rows are skipped (not real tradable stocks).
Safe to re-run: skips files already present.
"""
import os
import time
import pandas as pd
import yfinance as yf

OUT_DIR = "nifty500_hist"
HOST_DIR = "nifty500_host"
TRACKER = "nifty500_reshuffle_tracker_v2.xlsx"
os.makedirs(OUT_DIR, exist_ok=True)

# curated renames/mergers (basket symbol -> Yahoo ticker that carries the history)
RENAMES = {
    "TATAGLOBAL": "TATACONSUM.NS", "MOTHERSUMI": "MOTHERSON.NS",
    "CADILAHC": "ZYDUSLIFE.NS", "GMRINFRA": "GMRAIRPORT.NS",
    "ZOMATO": "ETERNAL.NS", "ADANITRANS": "ADANIENSOL.NS",
    "KALPATPOWR": "KPIL.NS", "L&TFH": "LTF.NS",
    "SRTRANSFIN": "SHRIRAMFIN.NS", "MANYAVAR": "VEDANTFAS.NS",
    "IBULHSGFIN": "SAMMAANCAP.NS", "HDFC": "HDFCBANK.NS",
    "INFRATEL": "INDUSTOWER.NS", "MINDTREE": "LTIM.NS", "LTI": "LTIM.NS",
    "EQUITAS": "EQUITASBNK.NS", "BHARATFIN": "EQUITASBNK.NS",
    "MCDOWELL-N": "UNITDSPR.NS", "GSKCONS": "HINDUNILVR.NS",
    "RNAM": "NAM-INDIA.NS", "JISLJALEQS": "JISLJALEQS.BO",
    "NIITTECH": "COFORGE.NS", "HEXAWARE": "HEXT.NS",
    "TATACOFFEE": "TATACONSUM.NS", "EPL": "EPL.NS",
    # second-pass renames/mergers for initially-failed names
    "PVR": "PVRINOX.NS", "MINDAIND": "UNOMINDA.NS", "AMARAJABAT": "ARE&M.NS",
    "WELSPUNIND": "WELSPUNLIV.NS", "WABCOINDIA": "ZFCVINDIA.NS",
    "CENTURYTEX": "ABREL.NS", "AEGISCHEM": "AEGISLOG.NS",
    "IDFC": "IDFCFIRSTB.NS", "IDFCBANK": "IDFCFIRSTB.NS",
    "GET&D": "GETD.NS", "MAGMA": "POONAWALLA.NS", "MAHINDCIE": "CIEINDIA.NS",
    "NBVENTURES": "GENSOL.NS", "UJJIVAN": "UJJIVANSFB.NS",
    "ITDCEM": "ITDCEM.NS", "JUBILANT": "JUBLPHARMA.NS",
    "PEL": "PEL.NS", "AKZOINDIA": "AKZOINDIA.NS", "SUVENPHAR": "SUVENPHAR.NS",
    "SWANENERGY": "SWANENERGY.NS", "GLS": "GLS.NS", "MERCK": "PROCTER.NS",
}


def load_missing():
    avail = {f.replace("_1d_max.csv", "") for f in os.listdir(HOST_DIR) if f.endswith(".csv")}
    fb = pd.read_excel(TRACKER, "Full Basket Per Month")
    ever = set()
    for m in [c for c in fb.columns if c != "Stock #"]:
        ever |= set(fb[m].dropna().astype(str).str.strip())
    ever -= {"nan", "-", ""}
    missing = sorted(s for s in (ever - avail) if not s.upper().startswith("DUMMY"))
    return missing


def candidates(sym):
    cands = []
    if sym in RENAMES:
        cands.append(RENAMES[sym])
    cands += [f"{sym}.NS", f"{sym}.BO"]
    seen, out = set(), []
    for c in cands:
        if c not in seen:
            seen.add(c); out.append(c)
    return out


def fetch(sym):
    for cand in candidates(sym):
        for _ in range(2):
            try:
                d = yf.Ticker(cand).history(period="max", interval="1d")
                if len(d):
                    return cand, d
            except Exception:
                pass
            time.sleep(0.8)
    return None, None


def main():
    missing = load_missing()
    print(f"Fetching {len(missing)} missing Nifty 500 constituents -> {OUT_DIR}/\n")
    ok, failed = [], []
    for i, sym in enumerate(missing, 1):
        path = os.path.join(OUT_DIR, f"{sym}_1d_max.csv")
        if os.path.exists(path):
            ok.append(sym); continue
        cand, d = fetch(sym)
        if d is None:
            failed.append(sym)
            if i % 20 == 0 or len(failed) % 25 == 0:
                print(f"[{i:3d}/{len(missing)}] ... {len(ok)} ok, {len(failed)} failed so far")
            continue
        d.index = d.index.strftime("%d-%m-%Y")
        d.reset_index(inplace=True)
        d.rename(columns={"index": "Date", "Datetime": "Date"}, inplace=True)
        n = len(d)
        pd.DataFrame({
            "Symbol": [sym]*n, "Company": [sym]*n, "Industry": ["-"]*n,
            "Index": ["NIFTY500_HIST"]*n, "Date": d["Date"],
            "Open": d["Open"], "High": d["High"], "Low": d["Low"], "Close": d["Close"],
            "Volume": d["Volume"], "Dividends": d.get("Dividends", 0),
            "Stock Splits": d.get("Stock Splits", 0),
        }).to_csv(path, index=False)
        ok.append(sym)
        if i % 20 == 0:
            print(f"[{i:3d}/{len(missing)}] {len(ok)} ok, {len(failed)} failed  (last OK: {sym} via {cand})")
        time.sleep(0.25)

    print(f"\nDONE: {len(ok)} fetched/existing | {len(failed)} unavailable")
    print(f"Coverage of missing set: {len(ok)/len(missing)*100:.1f}%")
    if failed:
        print(f"\nUnavailable ({len(failed)}): {failed}")


if __name__ == "__main__":
    main()
