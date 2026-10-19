"""Small offline regressions for public verification boundaries."""
import io
import json
import tarfile
import unittest
from unittest.mock import patch
import verify_served as verify


class PublicVerificationTests(unittest.TestCase):
    def archive(self, entries):
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w:gz') as archive:
            for name, value, kind in entries:
                member = tarfile.TarInfo(name); member.size = len(value); member.type = kind
                archive.addfile(member, io.BytesIO(value) if kind == tarfile.REGTYPE else None)
        return buffer.getvalue()

    def test_archive_identity_duplicates_and_links(self):
        data = b'public body'
        expected = {'index.html': verify.sha(data)}
        archive = self.archive([('./index.html', data, tarfile.REGTYPE)])
        self.assertEqual(verify.archive_files(archive, expected)['index.html']['bytes'], len(data))
        for entries in ([('./index.html', data, tarfile.REGTYPE)]*2,
                        [('./index.html', b'', tarfile.SYMTYPE)],
                        [('./index.html', b'changed', tarfile.REGTYPE)]):
            with self.assertRaises(ValueError):
                verify.archive_files(self.archive(entries), expected)

    def test_canonical_routes_and_mime_map(self):
        self.assertEqual(verify.path_for('index.html'), '/')
        self.assertEqual(verify.path_for('en/index.html'), '/en/')
        self.assertEqual(verify.path_for('de/apps/index.html'), '/de/apps/')
        self.assertEqual(verify.expected_mime('api/vega/discovery'), {'application/json'})
        self.assertEqual(verify.expected_mime('font.woff2'), {'font/woff2'})
        with self.assertRaises(ValueError):
            verify.expected_mime('unknown.bin')

    def test_static_wrong_mime_or_body_cannot_pass(self):
        expected = {'index.html': {'sha256': verify.sha(b'PUBLIC'), 'bytes': 6}}
        response = {'status': 200, 'mime': 'text/html', 'sha256': verify.sha(b'PUBLIC'), 'bytes': 6, 'error': None}
        with patch.object(verify, 'fetch', return_value=(response, b'PUBLIC')):
            row = verify.verify_static(expected)[0]
            self.assertTrue(row['bytesShaEqual'] and row['mimeCorrect'])
        response['mime'] = 'application/json'
        with patch.object(verify, 'fetch', return_value=(response, b'PUBLIC')):
            self.assertFalse(verify.verify_static(expected)[0]['mimeCorrect'])
        response['sha256'] = verify.sha(b'OTHER')
        with patch.object(verify, 'fetch', return_value=(response, b'OTHER')):
            self.assertFalse(verify.verify_static(expected)[0]['bytesShaEqual'])

    def test_preview_exports_no_body_hash_record_or_headers(self):
        response = {'status': 404, 'error': None, 'blocksPresent': False, 'sha256': verify.sha(b'PRIVATE_CANARY')}
        with patch.object(verify, 'fetch', return_value=(response, b'PRIVATE_CANARY')):
            rows = verify.verify_preview('publicrecordid01')
        self.assertEqual(len(rows), 4)
        self.assertTrue(all(row['expected404'] for row in rows))
        output = json.dumps(rows)
        for value in ('PRIVATE_CANARY', response['sha256'], 'publicrecordid01', 'headers'):
            self.assertNotIn(value, output)
        response['blocksPresent'] = True
        with patch.object(verify, 'fetch', return_value=(response, b'data-vega-blocks-root')):
            self.assertTrue(all(not row['expected404'] for row in verify.verify_preview('publicrecordid01')))

    def test_fetch_is_get_without_auth_cookies_or_redirects(self):
        class Response:
            status = 200
            headers = {'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'PRIVATE_CANARY'}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, limit): return b'PUBLIC'
        class Opener:
            def open(self, request, timeout):
                self.request = request; return Response()
        opener = Opener()
        with patch.object(verify, 'build_opener', return_value=opener):
            row, body = verify.fetch('lumbre.pro', '/')
        self.assertEqual(opener.request.method, 'GET')
        self.assertFalse(any(k.lower() in {'authorization', 'cookie'} for k in opener.request.headers))
        self.assertNotIn('PRIVATE_CANARY', json.dumps(row))
        self.assertIsNone(verify.NoRedirect().redirect_request(None, None, 302, None, None, 'https://foreign.invalid'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
