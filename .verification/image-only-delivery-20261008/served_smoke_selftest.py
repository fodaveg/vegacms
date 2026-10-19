"""Offline fixtures for exact served-manifest and policy projection logic."""

import unittest
from unittest.mock import patch

import served_smoke as smoke


class ServedSmokeTests(unittest.TestCase):
    def test_pinned_manifest_counts_and_index(self):
        for service, count in (("vega-pb", 153), ("lumbre-admin-pb", 153), ("fodaveg", 155)):
            with self.subTest(service=service):
                files, manifest_hash = smoke.manifest_for(service)
                self.assertEqual(len(files), count)
                self.assertEqual(len(manifest_hash), 64)
                self.assertIn("index.html", files)

    def test_assets_compare_each_own_manifest(self):
        files = {"index.html": "a" * 64, "_app/test.js": "b" * 64}

        def fake_fetch(_host, path):
            return {"status": 200, "bodySha256": files[path[1:]],
                    "contentType": "text/html" if path.endswith(".html") else "application/javascript"}

        with patch.object(smoke, "manifest_for", return_value=(files, "c" * 64)), \
                patch.object(smoke, "fetch", side_effect=fake_fetch):
            value = smoke.verify_assets("fodaveg")
        self.assertEqual((value["checked"], value["matched"], value["failedPaths"]), (2, 2, []))

    def test_bad_asset_is_reported_without_body(self):
        with patch.object(smoke, "manifest_for", return_value=({"index.html": "a" * 64}, "c" * 64)), \
                patch.object(smoke, "fetch", return_value={"status": 200, "bodySha256": "b" * 64}):
            value = smoke.verify_assets("vega-pb")
        self.assertEqual(value["failedPaths"], ["index.html"])
        self.assertNotIn("body", value)

    def test_exact_bytes_with_wrong_mime_fails(self):
        with patch.object(smoke, "manifest_for", return_value=({"_app/app.js": "a" * 64}, "c" * 64)), \
                patch.object(smoke, "fetch", return_value={"status": 200,
                                                            "bodySha256": "a" * 64,
                                                            "contentType": "text/html"}):
            value = smoke.verify_assets("vega-pb")
        self.assertEqual(value["failedPaths"], ["_app/app.js"])

    def test_missing_policy_signature_ignores_body_but_rejects_status_change(self):
        old = {"status": 404, "contentType": "text/html", "bodySha256": "a" * 64}
        new = {"status": 404, "contentType": "text/html", "bodySha256": "b" * 64}
        self.assertEqual(smoke.response_signature(old), smoke.response_signature(new))
        new["status"] = 200
        self.assertNotEqual(smoke.response_signature(old), smoke.response_signature(new))

    def test_health_body_changes_are_ignored_for_cors_policy_comparison(self):
        before = {"getOwn": {"status": 200, "cors": "*", "bodySha256": "a" * 64}}
        after = {"getOwn": {"status": 200, "cors": "*", "bodySha256": "b" * 64}}
        self.assertEqual(smoke.cors_signature(before), smoke.cors_signature(after))
        after["getOwn"]["cors"] = None
        self.assertNotEqual(smoke.cors_signature(before), smoke.cors_signature(after))


if __name__ == "__main__":
    unittest.main()
