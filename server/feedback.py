"""Private feedback inbox. Python 3.10+, standard library only; bind behind HTTPS Nginx."""
import base64
from contextlib import contextmanager
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import sqlite3
import time
from urllib.parse import parse_qs, urlsplit
import uuid

PREFIX = '/adarkroompixel/feedback'
MAX_BODY = 180_000
STATUSES = ('new', 'reviewing', 'resolved')
CATEGORIES = ('bug', 'stuck', 'suggestion', 'other')
ROOT = Path(__file__).resolve().parent


def validate(value):
    if not isinstance(value, dict):
        raise ValueError('object required')
    result = {}
    for key, low, high in [('requestId', 36, 36), ('category', 1, 20), ('message', 10, 3000),
                           ('steps', 0, 2000), ('contact', 0, 200), ('save', 0, 128_000)]:
        text = value.get(key, '')
        if not isinstance(text, str) or '\0' in text:
            raise ValueError(key)
        text = text.strip()
        if not low <= len(text) <= high:
            raise ValueError(key)
        result[key] = text
    if str(uuid.UUID(result['requestId'])) != result['requestId'] or result['category'] not in CATEGORIES:
        raise ValueError('id or category')
    context = value.get('context')
    if not isinstance(context, dict):
        raise ValueError('context')
    result['context'] = {}
    for key, maximum in [('version', 64), ('scene', 80), ('language', 10), ('browser', 500), ('viewport', 40), ('page', 300)]:
        text = context.get(key, '')
        if not isinstance(text, str) or len(text) > maximum or '\0' in text:
            raise ValueError('context.' + key)
        result['context'][key] = text
    return result


class Inbox:
    def __init__(self, database, secret):
        self.database = str(database)
        self.secret = secret.encode()
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS feedback (
                  id TEXT PRIMARY KEY, created TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
                  payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS limits (
                  key TEXT PRIMARY KEY, bucket INTEGER NOT NULL, count INTEGER NOT NULL
                );
            ''')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def limited(self, address, purpose, maximum, window, consume=True):
        key = hmac.new(self.secret, (purpose + ':' + address).encode(), 'sha256').hexdigest()
        now = int(time.time())
        bucket = now // window * window
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('DELETE FROM limits WHERE bucket < ?', (now - 86400,))
            row = db.execute('SELECT bucket, count FROM limits WHERE key=?', (key,)).fetchone()
            count = row['count'] if row and row['bucket'] == bucket else 0
            if count >= maximum:
                return True
            if consume:
                db.execute('INSERT OR REPLACE INTO limits VALUES (?,?,?)', (key, bucket, count + 1))
        return False

    def submit(self, payload, address):
        encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT payload FROM feedback WHERE id=?', (payload['requestId'],)).fetchone()
            if row:
                return 200 if row['payload'] == encoded else 409
            if db.execute('SELECT count(*) FROM feedback').fetchone()[0] >= 10000:
                return 503
        if self.limited(address, 'submit', 8, 3600):
            return 429
        with self.connect() as db:
            # The same request can race after a network retry: never create a second row.
            db.execute('INSERT OR IGNORE INTO feedback (id,created,payload) VALUES (?,?,?)',
                       (payload['requestId'], time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), encoded))
            row = db.execute('SELECT payload FROM feedback WHERE id=?', (payload['requestId'],)).fetchone()
            return 201 if row['payload'] == encoded else 409

    def listing(self, page, status):
        where = ' WHERE status=?' if status else ''
        params = (status,) if status else ()
        with self.connect() as db:
            counts = {s: 0 for s in STATUSES}
            counts.update({r['status']: r['n'] for r in db.execute('SELECT status,count(*) AS n FROM feedback GROUP BY status')})
            total = db.execute('SELECT count(*) FROM feedback' + where, params).fetchone()[0]
            rows = db.execute('SELECT * FROM feedback' + where + ' ORDER BY created DESC, rowid DESC LIMIT 30 OFFSET ?', (*params, page * 30)).fetchall()
        items = []
        for row in rows:
            payload = json.loads(row['payload'])
            has_save = bool(payload.pop('save', ''))
            payload.pop('requestId')
            items.append(dict(id=row['id'], created=row['created'], status=row['status'], hasSave=has_save, **payload))
        return dict(items=items, counts=counts, total=total, page=page)


class Handler(BaseHTTPRequestHandler):
    server_version = 'Feedback'

    def setup(self):
        super().setup()
        self.connection.settimeout(15)

    def log_message(self, *_):
        pass  # Never put contact details, saves, or authorization into logs.

    @property
    def path_only(self):
        return urlsplit(self.path).path

    def respond(self, status, body=None, content_type='application/json; charset=utf-8', extra=None):
        data = json.dumps(body, ensure_ascii=False).encode() if content_type.startswith('application/json') else body or b''
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if self.path_only == PREFIX + '/api' and self.headers.get('Origin') in self.server.origins:
            self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
            self.send_header('Vary', 'Origin')
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(data)

    def address(self):
        # Only the loopback Nginx proxy may supply the single overwritten client address.
        return self.headers.get('X-Real-IP', self.client_address[0]) if self.client_address[0] == '127.0.0.1' else self.client_address[0]

    def authorized(self):
        if self.server.inbox.limited(self.address(), 'login', 10, 600, consume=False):
            self.respond(429, {'error': 'try_later'})
            return False
        try:
            scheme, encoded = self.headers.get('Authorization', '').split(' ', 1)
            username, password = base64.b64decode(encoded, validate=True).decode().split(':', 1)
            digest = hashlib.pbkdf2_hmac('sha256', password.encode(), self.server.salt, 200_000).hex()
            valid = scheme == 'Basic' and hmac.compare_digest(username, 'owner') and hmac.compare_digest(digest, self.server.password_hash)
        except (ValueError, UnicodeError):
            valid = False
        if not valid:
            self.server.inbox.limited(self.address(), 'login', 10, 600)
            self.respond(401, {'error': 'unauthorized'})
        return valid

    def read_json(self):
        try:
            length = int(self.headers.get('Content-Length', '-1'))
        except ValueError:
            length = -1
        if not 0 < length <= MAX_BODY:
            self.respond(413, {'error': 'body_size'})
            return None
        if self.headers.get_content_type() != 'application/json':
            self.respond(415, {'error': 'json_required'})
            return None
        try:
            value = json.loads(self.rfile.read(length))
            if not isinstance(value, dict):
                raise ValueError('object required')
            return value
        except (ValueError, UnicodeError, RecursionError):
            self.respond(400, {'error': 'invalid_json'})
            return None

    def do_OPTIONS(self):
        if self.path_only != PREFIX + '/api' or self.headers.get('Origin') not in self.server.origins:
            return self.respond(403, {'error': 'origin'})
        self.respond(204, b'', 'text/plain', {'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600'})

    def do_GET(self):
        path = self.path_only
        static = {PREFIX + '/manage/': ('admin.html', 'text/html; charset=utf-8'),
                  PREFIX + '/manage/admin.js': ('admin.js', 'text/javascript; charset=utf-8'),
                  PREFIX + '/manage/admin.css': ('admin.css', 'text/css; charset=utf-8')}
        if path == PREFIX + '/manage':
            return self.respond(302, b'', 'text/plain', {'Location': PREFIX + '/manage/'})
        if path in static:
            name, mime = static[path]
            return self.respond(200, (ROOT / name).read_bytes(), mime)
        if path.startswith(PREFIX + '/manage/'):
            if not self.authorized():
                return
            if path == PREFIX + '/manage/api':
                query = parse_qs(urlsplit(self.path).query)
                try:
                    page = int(query.get('page', ['0'])[0])
                    status = query.get('status', [''])[0]
                    if not 0 <= page <= 1000 or status not in ('', *STATUSES):
                        raise ValueError()
                except ValueError:
                    return self.respond(400, {'error': 'query'})
                return self.respond(200, self.server.inbox.listing(page, status))
            match = re.fullmatch(re.escape(PREFIX) + r'/manage/save/([a-f0-9-]{36})', path)
            if match:
                with self.server.inbox.connect() as db:
                    row = db.execute('SELECT payload FROM feedback WHERE id=?', (match[1],)).fetchone()
                save = json.loads(row['payload']).get('save') if row else None
                if save:
                    return self.respond(200, save.encode(), 'application/octet-stream', {'Content-Disposition': 'attachment; filename="feedback-save.txt"'})
        self.respond(404, {'error': 'not_found'})

    def do_POST(self):
        path = self.path_only
        public = path == PREFIX + '/api'
        admin = path == PREFIX + '/manage/api'
        if not public and not admin:
            return self.respond(404, {'error': 'not_found'})
        allowed = self.server.origins if public else {self.server.admin_origin}
        if self.headers.get('Origin') not in allowed:
            return self.respond(403, {'error': 'origin'})
        if admin and not self.authorized():
            return
        value = self.read_json()
        if value is None:
            return
        if public:
            try:
                payload = validate(value)
            except (ValueError, AttributeError):
                return self.respond(400, {'error': 'validation'})
            status = self.server.inbox.submit(payload, self.address())
            return self.respond(status, {'id': payload['requestId']} if status in (200, 201) else {'error': 'try_later' if status in (429, 503) else 'conflict'})
        if not isinstance(value, dict) or value.get('status') not in STATUSES or not isinstance(value.get('id'), str):
            return self.respond(400, {'error': 'validation'})
        with self.server.inbox.connect() as db:
            changed = db.execute('UPDATE feedback SET status=? WHERE id=?', (value['status'], value['id'])).rowcount
        self.respond(200 if changed else 404, {'ok': bool(changed)})


def create_server(address, database, secret, salt, password_hash, origins, admin_origin):
    service = ThreadingHTTPServer(address, Handler)
    service.timeout = 15
    service.inbox = Inbox(database, secret)
    service.salt = bytes.fromhex(salt)
    service.password_hash = password_hash
    service.origins = set(origins)
    service.admin_origin = admin_origin
    return service


if __name__ == '__main__':
    os.umask(0o077)
    create_server(('127.0.0.1', int(os.environ.get('FEEDBACK_PORT', '8766'))),
                  os.environ['FEEDBACK_DB'], os.environ['FEEDBACK_SECRET'], os.environ['FEEDBACK_SALT'],
                  os.environ['FEEDBACK_PASSWORD_HASH'], os.environ['FEEDBACK_ORIGINS'].split(','),
                  os.environ.get('FEEDBACK_ADMIN_ORIGIN', 'https://driftmsg.top')).serve_forever()
