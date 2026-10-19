"""Offline forward public CORS and discovery failure boundaries."""
import io,unittest
from unittest.mock import patch
import served_smoke as served_cors_smoke
class PublicTests(unittest.TestCase):
    def test_discovery_rejects_html_and_redirect_without_following(self):
        class Response(io.BytesIO):
            status = 200
            url = "https://admin.fodaveg.net/api/vega/discovery"
            headers = {"Content-Type": "text/html"}
        class Opener:
            calls = 0
            def open(self, *_args, **_kwargs):
                self.calls += 1
                return Response(b"<html>fallback</html>")
        opener = Opener()
        with patch.object(served_cors_smoke, "OPENER", opener):
            self.assertFalse(served_cors_smoke.discovery_json("admin.fodaveg.net"))
            self.assertEqual(opener.calls, 1)
        self.assertIsNone(served_cors_smoke.NoRedirect().redirect_request(
            None, None, 302, "redirect", {}, "https://foreign.invalid/"))

    def test_public_cors_requires_foreign_and_null_denial(self):
        class Smoke:
            @staticmethod
            def fetch(host, path, method, origin):
                return {"status": 200, "contentType": "application/json",
                        "cors": origin if origin == "https://" + host else None}

        original = served_cors_smoke.preflight
        old_discovery = served_cors_smoke.discovery_json
        served_cors_smoke.preflight = lambda host, origin, method, path: {
            "status": 204, "origin": "MATCH" if origin == "https://" + host else "ABSENT",
            "methodAllowed": True, "headersAllowed": True}
        served_cors_smoke.discovery_json = lambda host: True
        try:
            host = "admin.fodaveg.net"
            observation = {"paths": {"health": {"status": 200}},
                           "cors": {"getOwn": {"status": 200, "cors": "https://" + host},
                                    "optionsOwn": {"status": 204, "cors": "https://" + host},
                                    "getForeign": {"status": 200, "cors": None},
                                    "optionsForeign": {"status": 204, "cors": None}}}
            result = served_cors_smoke.cors_after(Smoke, host, observation)
            self.assertTrue(all(result.values()))
            observation["cors"]["getForeign"]["cors"] = "*"
            self.assertFalse(served_cors_smoke.cors_after(Smoke, host, observation)["foreignDenied"])
        finally:
            served_cors_smoke.preflight = original
            served_cors_smoke.discovery_json = old_discovery

    def test_index_alias_requires_known_redirect_and_sealed_root_bytes(self):
        class Response(io.BytesIO):
            status = 301
            headers = {"Location": "./"}
        class Opener:
            def open(self, *_args, **_kwargs):
                return Response(b"")
        class Smoke:
            @staticmethod
            def verify_assets(_):
                return {"checked": 155, "matched": 154, "failedPaths": ["index.html"]}
            @staticmethod
            def manifest_for(_):
                return {"index.html": "a" * 64}, None
        target = {"paths": {"root": {"status": 200, "bodySha256": "a" * 64}}}
        with patch.object(served_cors_smoke, "OPENER", Opener()):
            self.assertTrue(served_cors_smoke.canonical_index_alias("admin.fodaveg.net"))
            self.assertEqual(served_cors_smoke.verified_assets(Smoke, "fodaveg", target),
                             (155, 155, True))
            Response.headers = {"Location": "https://foreign.invalid/"}
            self.assertFalse(served_cors_smoke.canonical_index_alias("admin.fodaveg.net"))
            self.assertEqual(served_cors_smoke.verified_assets(Smoke, "fodaveg", target),
                             (155, 154, False))
            Response.headers = {"Location": "./"}
            target["paths"]["root"]["bodySha256"] = "b" * 64
            self.assertEqual(served_cors_smoke.verified_assets(Smoke, "fodaveg", target),
                             (155, 154, False))

if __name__ == "__main__": unittest.main()
