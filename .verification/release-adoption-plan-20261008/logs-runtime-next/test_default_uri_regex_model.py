"""Small syntax-semantic model only; real Caddy adapt/serve is still required."""
import re
import unittest


PATTERN = re.compile(r"(?s)[?].*")
REPLACEMENT = "?REDACTED"
MARKER = "synthetic-marker-never-a-credential"


class UriFilterModelTests(unittest.TestCase):
    def test_query_variants_keep_path_without_marker(self):
        cases = (
            ("/api/backups/file.zip?token=" + MARKER, "/api/backups/file.zip"),
            ("/api/backups/file.zip?%74oken=" + MARKER, "/api/backups/file.zip"),
            ("/api/backups/file.zip?token=" + MARKER + "&token=" + MARKER,
             "/api/backups/file.zip"),
            ("/api/backups/file.zip?token=" + MARKER + "&bad=%zz",
             "/api/backups/file.zip"),
            ("/api/backups/file.zip?bad=%zz&token=" + MARKER,
             "/api/backups/file.zip"),
            ("/api/backups/file.zip?token=" + MARKER + "\nextra=" + MARKER,
             "/api/backups/file.zip"),
        )
        for original, path in cases:
            with self.subTest(original=original.split("?", 1)[0]):
                result = PATTERN.sub(REPLACEMENT, original)
                self.assertEqual(result, path + REPLACEMENT)
                self.assertNotIn(MARKER, result)

    def test_uri_without_query_stays_unchanged(self):
        value = "/api/backups/file.zip"
        self.assertEqual(PATTERN.sub(REPLACEMENT, value), value)

    def test_scope_is_only_structured_request_uri(self):
        # A producer that embeds a URL in msg bypasses an encoder field filter.
        message = "upstream failed /api/backups/file.zip?token=" + MARKER
        self.assertIn(MARKER, message)


if __name__ == "__main__":
    unittest.main()
