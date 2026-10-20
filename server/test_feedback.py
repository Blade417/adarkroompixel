import base64
import hashlib
import http.client
import json
from pathlib import Path
import tempfile
import threading
import unittest
import uuid

from feedback import create_server, PREFIX


class FeedbackIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        salt = bytes.fromhex('01' * 16)
        self.server = create_server(('127.0.0.1', 0), Path(self.directory.name) / 'inbox.db',
                                    'test-only', salt.hex(), hashlib.pbkdf2_hmac('sha256', b'test-password', salt, 200_000).hex(),
                                    {'https://driftmsg.top', 'https://blade417.github.io'}, 'https://driftmsg.top')
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.authorization = 'Basic ' + base64.b64encode(b'owner:test-password').decode()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.directory.cleanup()

    def request(self, method, path='/api', body=None, origin='https://driftmsg.top', auth=False, headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        request_headers = {'Origin': origin, **(headers or {})}
        if auth:
            request_headers['Authorization'] = self.authorization
        if body is not None:
            request_headers['Content-Type'] = 'application/json'
        connection.request(method, PREFIX + path, json.dumps(body).encode() if body is not None else None, request_headers)
        response = connection.getresponse()
        data = response.read()
        result = response.status, dict(response.getheaders()), data
        connection.close()
        return result

    def payload(self, **changes):
        return dict(requestId=str(uuid.uuid4()), category='bug', message='This is a reproducible test issue.',
                    steps='Open the game.', contact='test-only@example.invalid',
                    context={'version': 'test', 'scene': 'title'}, **changes)

    def test_both_origins_can_submit_and_preflight(self):
        for origin in ('https://driftmsg.top', 'https://blade417.github.io'):
            status, headers, _ = self.request('OPTIONS', origin=origin)
            self.assertEqual(status, 204)
            self.assertEqual(headers['Access-Control-Allow-Origin'], origin)
            status, headers, data = self.request('POST', body=self.payload(), origin=origin)
            self.assertEqual(status, 201)
            self.assertEqual(headers['Cache-Control'], 'no-store')
            self.assertIn('id', json.loads(data))

    def test_unknown_origin_is_rejected(self):
        self.assertEqual(self.request('POST', body=self.payload(), origin='https://example.org')[0], 403)
        self.assertEqual(self.request('OPTIONS', origin='https://example.org')[0], 403)

    def test_public_cannot_read_any_feedback_or_save(self):
        payload = self.payload(save='optional-save')
        self.request('POST', body=payload)
        for path in ('/api', '/manage/api', '/manage/save/' + payload['requestId']):
            status, headers, data = self.request('GET', path)
            self.assertIn(status, (401, 404))
            self.assertNotIn(b'optional-save', data)
            self.assertNotIn(b'test-only@example.invalid', data)

    def test_admin_listing_status_filter_and_optional_save(self):
        payload = self.payload(save='optional-save')
        self.request('POST', body=payload)
        data = json.loads(self.request('GET', '/manage/api', auth=True)[2])
        self.assertEqual(data['total'], 1)
        self.assertTrue(data['items'][0]['hasSave'])
        self.assertNotIn('save', data['items'][0])
        self.assertEqual(self.request('GET', '/manage/save/' + payload['requestId'], auth=True)[2], b'optional-save')
        self.assertEqual(self.request('POST', '/manage/api', {'id': payload['requestId'], 'status': 'resolved'}, auth=True)[0], 200)
        data = json.loads(self.request('GET', '/manage/api?status=new', auth=True)[2])
        self.assertEqual(data['total'], 0)
        self.assertEqual(data['counts']['resolved'], 1)

    def test_admin_changes_reject_cross_origin_even_with_password(self):
        self.assertEqual(self.request('POST', '/manage/api', {'id': 'x', 'status': 'resolved'}, auth=True, origin='https://blade417.github.io')[0], 403)

    def test_retry_is_idempotent_and_conflict_does_not_overwrite(self):
        payload = self.payload()
        self.assertEqual(self.request('POST', body=payload)[0], 201)
        self.assertEqual(self.request('POST', body=payload)[0], 200)
        payload['message'] = 'A changed description with the same request id.'
        self.assertEqual(self.request('POST', body=payload)[0], 409)
        self.assertEqual(json.loads(self.request('GET', '/manage/api', auth=True)[2])['total'], 1)

    def test_validation_rejects_bad_types_short_messages_and_large_saves(self):
        for field, value in [('message', 'short'), ('message', {}), ('category', 'arbitrary'), ('requestId', 'x' * 36), ('save', 'x' * 128001), ('context', {'browser': 'x' * 501})]:
            payload = self.payload()
            payload[field] = value
            self.assertEqual(self.request('POST', body=payload)[0], 400)

    def test_body_size_and_content_type(self):
        self.assertEqual(self.request('POST', body={'text': 'x' * 181000})[0], 413)
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
        connection.request('POST', PREFIX + '/api', '{}', {'Origin': 'https://driftmsg.top', 'Content-Type': 'text/plain'})
        self.assertEqual(connection.getresponse().status, 415)
        connection.close()

    def test_submission_rate_limit_survives_new_connections(self):
        for _ in range(8):
            self.assertEqual(self.request('POST', body=self.payload())[0], 201)
        self.assertEqual(self.request('POST', body=self.payload())[0], 429)

    def test_inbox_persists_and_does_not_store_client_ip(self):
        payload = self.payload()
        self.request('POST', body=payload, headers={'X-Real-IP': '192.0.2.7'})
        with self.server.inbox.connect() as db:
            row = db.execute('SELECT payload FROM feedback').fetchone()
            self.assertNotIn('192.0.2.7', row['payload'])
            keys = [r[0] for r in db.execute('SELECT key FROM limits')]
            self.assertTrue(all(len(key) == 64 for key in keys))

    def test_admin_login_page_has_no_data_and_restricts_inline_scripts(self):
        status, headers, data = self.request('GET', '/manage/')
        self.assertEqual(status, 200)
        self.assertIn("script-src 'self'", headers['Content-Security-Policy'])
        self.assertNotIn(b'test-password', data)

    def test_json_null_and_arrays_are_rejected(self):
        for body in ('null', '[]', '{broken'):
            connection = http.client.HTTPConnection(*self.server.server_address, timeout=5)
            connection.request('POST', PREFIX + '/api', body, {'Origin': 'https://driftmsg.top', 'Content-Type': 'application/json'})
            response = connection.getresponse()
            self.assertEqual(response.status, 400)
            response.read()
            connection.close()

    def test_bad_admin_credentials_are_rate_limited(self):
        for _ in range(10):
            self.assertEqual(self.request('GET', '/manage/api')[0], 401)
        self.assertEqual(self.request('GET', '/manage/api')[0], 429)


if __name__ == '__main__':
    unittest.main()
