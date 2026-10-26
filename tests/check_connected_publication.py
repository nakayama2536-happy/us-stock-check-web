"""Fail-closed publication gate for the approved, pinned connected preview.

This is a saved 2026-10-16 market snapshot, not a live publication schedule.
The tested UI/data bytes stay unchanged; publication and iPhone acceptance are separate.
"""
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile

RELEASE = '2af493b55b4b7686b7c1e8dd13ab8b8f6309c1bb045945d124dcf3d4ff6b0d57'
SCOPE = '/us-stock-check-web/preview/connected/'
PRODUCER = 'be3c2189d6200cf306ca94f4bca30854f58b5bd4'
CONSUMER = '48475f9263bbad5aacb0bfe857a23b9554891327'
DATA = 'delivery/releases/' + RELEASE + '/'
EXPECTED = {
    'BUILD.json': '935f455f2f727e8b395a2874b1aa5a3734c73632f4d39626ef6b60f52536dba5',
    'assets.json': '527b4d5b286aa78ff2109354a1b2cd434e50014daf39b4c3e24f24b5cb4b44bf',
    'candidate.js': '13b142a0a758c6b300f6c02fb5dd4d7ec4695fed1369939c204998e9ad00fb58',
    'delivery.js': 'be405207f0524216026223f1f433a298b9bda6711b98c4580b82bfac18489f30',
    'delivery/current.json': 'c2949367242718f1f1c3bb9d15ace3043074b151c77b18e06443e4a4a5ff45b3',
    DATA + 'common_snapshot.json': 'dddd7cfb0a2d97e2f46e8007c7905d89e5d667336c10a9cd2d63daefd4eff06c',
    DATA + 'market.json': '6c5e1829f772cba542c6f8b2c7ddc9fd70f59d831b847e4d6a6c519176f1002f',
    DATA + 'ohlcv-history.json': '6b9f13ddbb535d54ece7e0a4c440e6878b486302bf03a823ca0a8912d6331187',
    DATA + 'status.json': '41ec20100a96751abb2871072f2e95a8ad023e6dc191b7a34f0c8f7c5738927c',
    'icons/us-stock-icon.png': '07eab8629467be85452199088598fc58fd6918e77d17ee9fe8bbaf7bb9314fed',
    'index.html': 'b2546b2934b3a6d226206924f45c71a5842d148703e2cc6613124dfd461d554b',
    'manifest.webmanifest': '944b3f77d4153300c565a3df9cccba7f9d18e636c2d3c47084c36be4268cf253',
    'preview-adapter.js': '3c40fb1fa86b01e4f1ce1044c853d801c807fc3384a2624652098233e82b97a5',
    'storage.js': '4df25b336da2a3d456679be31c7f72f11a188a117a86c80bdf2f75e23ef865e3',
    'sw-register.js': '6c4d6305675c1e6f4202c3a03e7417e1dbfb5b334d0f4f787b7087724c0479d5',
    'sw.js': 'b2f5e858a7a56b5667663ff2ea0801631cb252dc2cf790ead8a61de0cfbf5c10',
}
FORBIDDEN = set('shares quantity position_size average_cost cost_basis purchase_price account_type position_id planned_total_shares stage_size completed_stages max_stages opened_at closed_at brokerage_account brokerage_account_id portfolio_id api_key apikey access_token token password secret transactions transaction_history'.split())
CREDENTIAL = re.compile(r'(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|sk-[A-Za-z0-9_-]{20,})')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def privacy(value):
    if isinstance(value, dict):
        for key, nested in value.items():
            require(key.lower() not in FORBIDDEN, 'Forbidden private/credential key')
            privacy(nested)
    elif isinstance(value, list):
        for nested in value:
            privacy(nested)
    elif isinstance(value, str):
        require(not CREDENTIAL.search(value), 'Credential-like value')


def verify(site):
    site = Path(site)
    require(site.is_dir() and not site.is_symlink(), 'Missing or linked connected site')
    for item in site.rglob('*'):
        require(not item.is_symlink(), 'Linked payload refused')
    actual = {p.relative_to(site).as_posix() for p in site.rglob('*') if p.is_file()}
    require(actual == set(EXPECTED), 'Connected publication file allowlist mismatch')
    objects = {}
    for name, expected in EXPECTED.items():
        data = (site / name).read_bytes()
        require(hashlib.sha256(data).hexdigest() == expected, 'Unreviewed connected bytes: ' + name)
        if name.endswith(('.json', '.webmanifest')):
            objects[name] = json.loads(data)
            privacy(objects[name])
        if name.endswith(('.js', '.html')):
            require(not CREDENTIAL.search(data.decode('utf-8')), 'Credential-like code content')
    manifest = objects['delivery/current.json']
    require(manifest['release'] == RELEASE and manifest['source_revision'] == PRODUCER, 'Producer revision mismatch')
    descriptor = {k: manifest[k] for k in ('schema', 'source_repository', 'source_revision', 'files')}
    encoded = json.dumps(descriptor, ensure_ascii=False, separators=(',', ':')).encode()
    require(hashlib.sha256(encoded).hexdigest() == RELEASE, 'Release digest mismatch')
    names = {'status.json', 'market.json', 'common_snapshot.json', 'ohlcv-history.json'}
    require(set(manifest['files']) == names, 'Data manifest allowlist mismatch')
    for name, meta in manifest['files'].items():
        data = (site / DATA / name).read_bytes()
        require(len(data) == meta['bytes'] and hashlib.sha256(data).hexdigest() == meta['sha256'], 'Data digest mismatch')
    status, common, history = (objects[DATA + n] for n in ('status.json', 'common_snapshot.json', 'ohlcv-history.json'))
    require(status['app_state'] == 'SHADOW' and status['run_state'] == 'NO_CHANGE', 'Saved state mismatch')
    require(status['us_trade_date'] == '2026-10-16' and status['generated_at_jst'] == '2026-10-18T16:19:34+09:00', 'Saved timestamp mismatch')
    require(status['quality']['qc'] == 'PASS' and status['quality']['source_crosscheck'] == 'PASS', 'Saved QC mismatch')
    require(status['quality']['session'] == 'REGULAR' and status['quality']['completeness'] == '5/5', 'Saved session/universe mismatch')
    items = common['decision_items']
    require(len(items) == 5 and all(i['formal_action'] is None for i in items), 'Unexpected formal action')
    require(history['capture']['code_sha'] == PRODUCER and history['capture']['run_id'] == '39107207385', 'Capture identity mismatch')
    require(set(history['securities']) == {'PLTR', 'LLY', 'BSY', 'MSTR', 'SOXL'}, 'Ticker mismatch')
    require(all(len(s['rows']) == 250 for s in history['securities'].values()), 'OHLCV length mismatch')
    build = objects['BUILD.json']
    require(build['consumer_revision'] == CONSUMER and build['scope'] == SCOPE, 'UI identity mismatch')
    app = objects['manifest.webmanifest']
    require(all(app[k] == SCOPE for k in ('id', 'scope', 'start_url')), 'App scope mismatch')
    for name, digest in build['sha256'].items():
        require(hashlib.sha256((site / name).read_bytes()).hexdigest() == digest, 'UI digest mismatch')
    return len(actual)


def rejection_tests(site):
    for mutate in ('changed', 'extra', 'symlink'):
        with tempfile.TemporaryDirectory(prefix='connected-gate-') as temp:
            candidate = Path(temp) / 'site'
            shutil.copytree(site, candidate)
            target = candidate / (DATA + 'status.json')
            if mutate == 'changed':
                target.write_text('{}')
            elif mutate == 'extra':
                (candidate / 'unreviewed.json').write_text('{}')
            else:
                target.unlink()
                target.symlink_to(candidate / 'BUILD.json')
            try:
                verify(candidate)
            except ValueError:
                continue
            raise ValueError('Publication negative test did not fail: ' + mutate)
    print('PUBLICATION GUARD: modified bytes, unexpected file, symlink rejected (3/3)')


if __name__ == '__main__':
    site = Path('docs/preview/connected')
    try:
        count = verify(site)
        rejection_tests(site)
        print('CONNECTED PUBLICATION PASS:', count, 'exact approved files; saved market date 2026-10-16; SHADOW; no device acceptance or daily feed claimed')
    except (ValueError, KeyError, OSError, TypeError) as error:
        print('CONNECTED PUBLICATION BLOCKED:', type(error).__name__)
        sys.exit(1)
