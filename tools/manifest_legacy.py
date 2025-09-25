import os, csv, json

master_path = 'C:\Users\seran\development\HL001-quiz-karacon-academia\docs\rename\109販促データのcsvコピー - master.csv'  # Sheets を CSV 出力
master_set = set()
with open(master_path, encoding='utf-8-sig') as f:
    rdr = csv.DictReader(f)
    for r in rdr:
        key = '|'.join([
            r['元品番'].strip(),
            r['ブランド(カナ)'].strip(),
            r['カラー(カナ)'].strip(),
            r['装用期間'].strip()
        ])
        master_set.add(key)

def parse_filename_eijk(filename):
    base = os.path.splitext(os.path.basename(filename))[0]
    parts = base.split('_')
    if len(parts) < 4: return None
    return tuple(p.strip() for p in parts[:4])  # (E,I,J,K)

image_dir = 'images/lens'
manifest = {}
for root, _, files in os.walk(image_dir):
    for fn in files:
        toks = parse_filename_eijk(fn)
        if not toks: continue
        key = '|'.join(toks)
        if key in master_set:
            manifest[key] = {
                "file": fn, "shard": "??", "sha256": "...", "w": 640, "h": 640
            }

with open('manifests/lens.json','w',encoding='utf-8') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
