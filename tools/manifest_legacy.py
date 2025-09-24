import os
import re
import json
import hashlib


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
IMG_DIRS = [
    ('lens', os.path.join(ROOT, 'images', 'lens')),
    ('samune', os.path.join(ROOT, 'images', 'samune')),
]
PERIOD_MAP = {
    '1day': '1day',
    '1-day': '1day',
    'daily': '1day',
    '1_d': '1day',
    '2week': '2week',
    '2-weeks': '2week',
    'biweekly': '2week',
    '1month': '1month',
    'monthly': '1month',
}


def sanitize(s):
    if s is None:
        return ''
    s = str(s).strip()
    s = s.replace('\u3000', '_').replace(' ', '_')
    s = re.sub(r'[・,、，/／]', '_', s)
    s = re.sub(r'[_]+', '_', s)
    return s.lower()


def norm_period(k):
    k = sanitize(k)
    return PERIOD_MAP.get(k, k)


def key_from_parts(code, brand, color, period):
    return '|'.join([sanitize(code), sanitize(brand), sanitize(color), norm_period(period)])


rx_lens = re.compile(r'^(?P<code>.+?)_(?P<brand>.+?)_(?P<color>.+?)_(?P<per>.+?)_lens\.jpg$', re.I)
rx_samune = re.compile(r'^(?P<code>.+?)_(?P<brand>.+?)_(?P<color>.+?)_(?P<per>.+?)_samune\.jpg$', re.I)


def sha256sum(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    os.makedirs(os.path.join(ROOT, 'manifests'), exist_ok=True)
    out = {'lens': {}, 'samune': {}}
    for typ, d in IMG_DIRS:
        if not os.path.isdir(d):
            continue
        for fn in os.listdir(d):
            if not fn.lower().endswith('.jpg'):
                continue
            m = (rx_lens if typ == 'lens' else rx_samune).match(fn)
            if not m:
                continue
            code = m['code']
            brand = m['brand']
            color = m['color']
            per = m['per']
            k = key_from_parts(code, brand, color, per)
            rel = f'images/{typ}/{fn}'
            out[typ][k] = {
                'file': fn,
                'path': rel,
                'shard': 'LEGACY',
                'sha256': sha256sum(os.path.join(d, fn)),
                'w': 0,
                'h': 0,
            }
    with open(os.path.join(ROOT, 'manifests', 'lens.json'), 'w', encoding='utf-8') as f:
        json.dump(out['lens'], f, ensure_ascii=False, indent=2)
    with open(os.path.join(ROOT, 'manifests', 'samune.json'), 'w', encoding='utf-8') as f:
        json.dump(out['samune'], f, ensure_ascii=False, indent=2)
    print('generated counts:', len(out['lens']), len(out['samune']))


if __name__ == '__main__':
    main()
