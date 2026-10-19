"""Identify a bounded mismatch in the public Vega asset manifest without bodies."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import types
from urllib.parse import quote

from served_cors_smoke import OPENER

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent.parent / "image-only-delivery-20261008" / "served_smoke.py"
SOURCE_SHA = "04be908ba8eae67ce42db644ad98efc9ef1c3aa2d46b5e1921e9e5d6f88e7e23"
SAFE_PATH = re.compile(r"[A-Za-z0-9_./@-]+\Z")
HEX = re.compile(r"[0-9a-f]{64}\Z")
MIMES = {".js": {"application/javascript", "text/javascript"},
         ".css": {"text/css"}, ".json": {"application/json"},
         ".html": {"text/html"}}


def digest(body):
    return hashlib.sha256(body).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    source = SOURCE.read_bytes()
    if (args.out.exists() or args.out.parent.resolve() != HERE or
            args.out.suffix != ".json" or digest(source) != SOURCE_SHA or
            digest(Path(__file__).read_bytes()) != args.script_sha256):
        raise SystemExit("STOP: source/output seal")
    smoke = types.ModuleType("sealed_served_smoke")
    smoke.__file__ = str(SOURCE)
    exec(compile(source, str(SOURCE), "exec"), smoke.__dict__)
    smoke.urlopen = OPENER.open
    try:
        files, manifest_sha = smoke.manifest_for("vega-pb")
        if len(files) != 153 or any(not SAFE_PATH.fullmatch(path) for path in files):
            raise RuntimeError("ManifestShapeUnknown")

        def check(item):
            path, expected = item
            response = smoke.fetch("admin.vegacms.com", "/" + quote(path, safe="/"))
            mime = response.get("contentType")
            allowed = MIMES.get(Path(path).suffix)
            if (response.get("status") == 200 and response.get("bodySha256") == expected and
                    (allowed is None or mime in allowed)):
                return None
            status = response.get("status")
            served_sha = response.get("bodySha256")
            return {"path": path, "expectedSha256": expected,
                    "servedSha256": served_sha if isinstance(served_sha, str) and
                    HEX.fullmatch(served_sha) else None,
                    "status": status if type(status) is int and 100 <= status <= 599 else None,
                    "mime": mime if mime in {"application/javascript", "text/javascript",
                                               "text/css", "application/json", "text/html"}
                    else "OTHER" if isinstance(mime, str) else None,
                    "networkError": response.get("networkError") is True}

        with ThreadPoolExecutor(max_workers=8) as pool:
            failures = [value for value in pool.map(check, files.items()) if value]
        result = {"status": "ONE_ASSET_MISMATCH" if len(failures) == 1 else
                  "ALL_ASSETS_MATCH" if not failures else "MULTIPLE_ASSETS_MISMATCH",
                  "checked": 153, "matched": 153 - len(failures),
                  "mismatchCount": len(failures), "mismatches": failures[:3],
                  "manifestSha256": manifest_sha, "credentialsSent": False,
                  "bodyValuesStored": False, "redirectsFollowed": False}
    except Exception:
        result = {"status": "STOP_PUBLIC_UNAVAILABLE", "checked": 0, "matched": 0,
                  "mismatchCount": 0, "mismatches": [], "manifestSha256": None,
                  "credentialsSent": False, "bodyValuesStored": False,
                  "redirectsFollowed": False}
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(result, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(result["status"])
    return 0 if result["status"] in ("ONE_ASSET_MISMATCH", "ALL_ASSETS_MATCH") else 2


if __name__ == "__main__":
    sys.exit(main())
