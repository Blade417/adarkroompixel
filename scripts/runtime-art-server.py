"""Loopback-only receiver for the visible browser baking tool. Requires Pillow/WebP."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from PIL import Image
from urllib.parse import unquote, urlsplit
import base64, hashlib, io, json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'assets/pixel/runtime/v1'
STAGING = ROOT/'.runtime-art-build'
OUT.mkdir(parents=True, exist_ok=True); STAGING.mkdir(parents=True, exist_ok=True)
manifest = {'version': 1, 'groups': {}, 'sourceHashes': {}}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def json_headers(self, code=200):
        self.send_response(code)
        self.send_header('Access-Control-Allow-Origin', 'http://127.0.0.1:5175')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
    def do_OPTIONS(self): self.json_headers()
    def do_POST(self):
        try:
            assert self.headers.get('Origin') == 'http://127.0.0.1:5175'
            size=int(self.headers.get('Content-Length','0')); assert 0<size<30_000_000
            body=json.loads(self.rfile.read(size))
            if self.path == '/group':
                group=body['group']; assert group in {'room','workshop','forest','village','expedition','later'}
                data=base64.b64decode(body['png'],validate=True)
                original=Image.open(io.BytesIO(data)).convert('RGBA')
                file=OUT/(group+'.webp')
                original.save(file,format='WEBP',lossless=True,exact=True,method=6)
                decoded=Image.open(file).convert('RGBA')
                assert original.size == decoded.size and original.tobytes() == decoded.tobytes()
                (STAGING/(group+'.png')).write_bytes(data)
                manifest['groups'][group]={'file':file.name,'width':original.width,'height':original.height,
                    'sprites':body['sprites'],'meta':body['meta'],'alphaPixels':body['alphaPixels'],'bytes':file.stat().st_size,
                    'rgbaSha256':hashlib.sha256(original.tobytes()).hexdigest(),
                    'sha256':hashlib.sha256(file.read_bytes()).hexdigest()}
                result={'group':group,'bytes':file.stat().st_size,'losslessVerified':True}
            elif self.path == '/finish':
                assert len(manifest['groups']) == 6
                paths=set()
                for url in body['urls']:
                    path=(ROOT/unquote(urlsplit(url).path).lstrip('/')).resolve()
                    assert path.is_relative_to(ROOT/'assets/pixel') and not path.is_relative_to(OUT) and path.is_file()
                    paths.add(path)
                original_bytes=sum(p.stat().st_size for p in paths)
                paths.update(p.parent/'manifest.json' for p in list(paths))
                paths.update(ROOT/'src/pixel'/f for f in ['artpack.ts','workshop.ts','forest.ts','village.ts','expedition.ts','endgame-art.ts','resample.ts'])
                manifest['sourceHashes']={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes() if p.suffix=='.png' else p.read_text(encoding='utf-8').encode('utf-8')).hexdigest() for p in sorted(paths)}
                manifest['originalBytes']=original_bytes
                manifest['runtimeBytes']=sum(g['bytes'] for g in manifest['groups'].values())
                (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
                result={k:manifest[k] for k in ['originalBytes','runtimeBytes']}
            elif self.path == '/verified':
                assert body['identical'] and body['differingChannels']==0
                (STAGING/'browser-pixel-verification.json').write_text(json.dumps(body,indent=2)+'\n')
                result=body
            else: raise ValueError('Unknown endpoint')
            self.json_headers(); self.wfile.write(json.dumps(result).encode())
        except Exception as exc:
            self.json_headers(400); self.wfile.write(json.dumps({'error':str(exc)}).encode())

print('Runtime art receiver: 127.0.0.1:4182',flush=True)
ThreadingHTTPServer(('127.0.0.1',4182),Handler).serve_forever()
