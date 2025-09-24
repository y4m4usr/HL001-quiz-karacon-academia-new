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


def sanitize(value):
    if value is None:
        return ''
    text = str(value).strip()
    text = text.replace('\u3000', '_').replace(' ', '_')
    text = re.sub(r'[・,、，/／]', '_', text)
    text = re.sub(r'[_]+', '_', text)
    return text.lower()


def norm_period(key):
    key = sanitize(key)
    return PERIOD_MAP.get(key, key)


def key_from_parts(code, brand, color, period):
    return '|'.join([
        sanitize(code),
        sanitize(brand),
        sanitize(color),
        norm_period(period),
    ])


rx_lens = re.compile(r'^(?P<code>.+?)_(?P<brand>.+?)_(?P<color>.+?)_(?P<per>.+?)_lens\.jpg$', re.I)
rx_samune = re.compile(r'^(?P<code>.+?)_(?P<brand>.+?)_(?P<color>.+?)_(?P<per>.+?)_samune\.jpg$', re.I)


def sha256sum(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(8192), b''):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    os.makedirs(os.path.join(ROOT, 'manifests'), exist_ok=True)
    out = {'lens': {}, 'samune': {}}
    for typ, directory in IMG_DIRS:
        if not os.path.isdir(directory):
            continue
        for filename in os.listdir(directory):
            if not filename.lower().endswith('.jpg'):
                continue
            matcher = rx_lens if typ == 'lens' else rx_samune
            match = matcher.match(filename)
            if not match:
                continue
            code = match['code']
            brand = match['brand']
            color = match['color']
            period = match['per']
            key = key_from_parts(code, brand, color, period)
            rel_path = f'images/{typ}/{filename}'
            out[typ][key] = {
                'file': filename,
                'path': rel_path,
                'shard': 'LEGACY',
                'sha256': sha256sum(os.path.join(directory, filename)),
                'w': 0,
                'h': 0,
            }
    with open(os.path.join(ROOT, 'manifests', 'lens.json'), 'w', encoding='utf-8') as handle:
        json.dump(out['lens'], handle, ensure_ascii=False, indent=2)
    with open(os.path.join(ROOT, 'manifests', 'samune.json'), 'w', encoding='utf-8') as handle:
        json.dump(out['samune'], handle, ensure_ascii=False, indent=2)
    print('generated counts:', len(out['lens']), len(out['samune']))


if __name__ == '__main__':
    main()
