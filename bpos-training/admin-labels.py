"""
Build .local/admin-labels.json: every English string in the back office's Rails locale
files mapped to its French version(s), for A("Save") in flows -- the back-office twin of
register.mjs's L(), which reads the register's JSON translations instead.

    python3 bpos-training/admin-labels.py <bpos checkout>
"""
import glob, json, pathlib, sys, yaml

root = pathlib.Path(sys.argv[1])
out = pathlib.Path(__file__).parent / ".local" / "admin-labels.json"


def load(lang):
    merged = {}
    def merge(a, b):
        for k, v in b.items():
            if isinstance(v, dict) and isinstance(a.get(k), dict):
                merge(a[k], v)
            else:
                a[k] = v
    files = [root / "config/locales" / f"{lang}.yml"] + sorted(
        pathlib.Path(p) for p in glob.glob(str(root / "config/locales/**" / f"*.{lang}.yml"), recursive=True))
    for f in files:
        try:
            data = yaml.safe_load(f.read_text()) or {}
        except Exception as e:
            print(f"skip {f}: {e}", file=sys.stderr)
            continue
        merge(merged, data.get(lang, {}) or {})
    return merged


def flat(d, prefix=""):
    for k, v in d.items():
        key = f"{prefix}.{k}" if prefix else str(k)
        if isinstance(v, dict):
            yield from flat(v, key)
        elif isinstance(v, str):
            yield key, v


en, fr = dict(flat(load("en"))), dict(flat(load("fr")))
pairs = {}
for k, v in en.items():
    if k in fr:
        pairs.setdefault(v.strip(), set()).add(fr[k].strip())
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps({k: sorted(v) for k, v in pairs.items()}, ensure_ascii=False))
print(f"{len(pairs)} labels -> {out}")
