"""Build the end-user ZIP, with Russian instructions and only runtime files."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'extension/manifest.json').read_text(encoding='utf-8'))
version = manifest['version']
dist = root / 'dist'
dist.mkdir(exist_ok=True)
archive = dist / f'VK-Photo-Fullscreen-{version}-RU.zip'
contents = {}
for item in sorted((root / 'extension').rglob('*')):
    if item.is_file():
        contents[item.relative_to(root).as_posix()] = item.read_bytes()
for source, name in [('INSTALL_RU.txt', 'НАЧНИ ЗДЕСЬ.txt'),
                     ('TELEGRAM_RU.txt', 'ТЕКСТ ДЛЯ TELEGRAM.txt')]:
    text = (root / 'docs/distribution' / source).read_text(encoding='utf-8')
    payload = text.replace('\r\n', '\n').replace('\n', '\r\n').encode('utf-8-sig')
    contents[name] = payload
    (dist / name).write_bytes(payload)

with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as output:
    for name, data in contents.items():
        output.writestr(name, data)

with zipfile.ZipFile(archive) as check:
    assert check.testzip() is None
    assert set(check.namelist()) == set(contents)
    for name, data in contents.items():
        assert check.read(name) == data, name
    for block in manifest['content_scripts']:
        for name in block['js']:
            assert 'extension/' + name in contents
    assert 'extension/' + manifest['background']['service_worker'] in contents
    for scale in (2, 3, 4):
        prefix = f'extension/models/esrgan-slim-{scale}x/'
        model = json.loads(contents[prefix + 'model.json'])
        for group in model['weightsManifest']:
            for name in group['paths']:
                assert prefix + name in contents

print(json.dumps({'archive': str(archive), 'bytes': archive.stat().st_size,
                  'files': len(contents), 'version': version, 'result': 'PASS',
                  'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()}, indent=2))
