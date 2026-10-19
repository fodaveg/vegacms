"""Public, image-only served checks; run by the release owner between services.

This measures current edge behavior separately from the full production smoke
contract. It never sends credentials or records response bodies or cookies.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen


HERE = Path(__file__).resolve().parent
HOSTS = {"vega-pb": "admin.vegacms.com", "lumbre-admin-pb": "admin.lumbre.pro",
         "fodaveg": "admin.fodaveg.net"}
MANIFESTS = {
    "vega-pb": (HERE.parent / "release-stock-image-a51b-20261008" / "frontend-manifest.json",
                "3b1ab3a9090c47da65b90c2234dc5dbf22eebcc0e15a351752a1f7a02223067e", 153),
    "lumbre-admin-pb": (HERE.parent / "release-stock-image-a51b-20261008" / "frontend-manifest.json",
                        "3b1ab3a9090c47da65b90c2234dc5dbf22eebcc0e15a351752a1f7a02223067e", 153),
    "fodaveg": (HERE.parent / "fodaveg-admin-adoption-20261008" / "release-0.11.0-manifest.json",
                "0f776edfbbed5886a858238317ce3b6742bbcba881824ce5b775677f669be82e", 155),
}
PATHS = {"root": "/", "deep": "/settings", "missing": "/_app/immutable/__vega_image_only_missing__.js",
         "health": "/api/health", "panel": "/_/"}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def selected_headers(headers):
    """Project only stable public policy signals; never retain Set-Cookie."""
    return {"contentType": headers.get("Content-Type", "").split(";", 1)[0].strip().lower(),
            "cspSha256": digest(headers["Content-Security-Policy"].encode()) if
            headers.get("Content-Security-Policy") else None,
            "hsts": bool(headers.get("Strict-Transport-Security")),
            "nosniff": headers.get("X-Content-Type-Options", "").lower() == "nosniff",
            "referrerPolicySha256": digest(headers["Referrer-Policy"].encode()) if
            headers.get("Referrer-Policy") else None}


def fetch(host, path, method="GET", origin=None):
    """Read one bounded public response with redirects confined to its host."""
    headers = {"Accept-Encoding": "identity", "User-Agent": "VegaImageOnlySmoke/1"}
    if origin:
        headers["Origin"] = origin
    if method == "OPTIONS":
        headers["Access-Control-Request-Method"] = "GET"
    request = Request("https://" + host + path, headers=headers, method=method)
    try:
        response = urlopen(request, timeout=12)
    except HTTPError as error:
        response = error
    except (URLError, TimeoutError, OSError):
        return {"status": None, "networkError": True}
    with response:
        final = urlsplit(response.url)
        if final.scheme != "https" or final.hostname != host:
            return {"status": None, "networkError": True}
        body = response.read(12 * 1024 * 1024 + 1) if method == "GET" else b""
        if len(body) > 12 * 1024 * 1024:
            return {"status": None, "networkError": True}
        result = {"status": response.status, "networkError": False,
                  "bodySha256": digest(body) if method == "GET" else None,
                  **selected_headers(response.headers)}
        if origin:
            allowed = response.headers.get("Access-Control-Allow-Origin")
            result["cors"] = allowed if allowed in (None, origin, "*") else "OTHER"
        return result


def shallow(host):
    """Capture root, deep route, missing asset, health, panel and CORS policy."""
    paths = {name: fetch(host, path) for name, path in PATHS.items()}
    own_origin = "https://" + host
    foreign_origin = "https://not-authorized.invalid"
    cors = {}
    for method in ("GET", "OPTIONS"):
        for label, origin in (("own", own_origin), ("foreign", foreign_origin)):
            cors[method.lower() + label.title()] = fetch(host, "/api/health", method, origin)
    return {"paths": paths, "cors": cors}


def manifest_for(service):
    path, expected_hash, expected_count = MANIFESTS[service]
    body = path.read_bytes()
    if digest(body) != expected_hash:
        raise RuntimeError("ManifestDrift")
    data = json.loads(body)
    files = data["files"] if service == "fodaveg" else data
    if (not isinstance(files, dict) or len(files) != expected_count or
            any(not isinstance(name, str) or name.startswith("/") or ".." in name.split("/") or
                not re.fullmatch(r"[0-9a-f]{64}", value) for name, value in files.items())):
        raise RuntimeError("ManifestShapeUnknown")
    return files, expected_hash


def verify_assets(service):
    """Compare every manifest path against bytes served by its own host."""
    files, manifest_hash = manifest_for(service)
    host = HOSTS[service]

    def check(item):
        path, expected = item
        encoded = "/" + quote(path, safe="/")
        response = fetch(host, encoded)
        mime = response.get("contentType")
        expected_mimes = ({".js": {"application/javascript", "text/javascript"},
                          ".css": {"text/css"}, ".json": {"application/json"},
                          ".html": {"text/html"}})
        suffix = Path(path).suffix
        mime_ok = suffix not in expected_mimes or mime in expected_mimes[suffix]
        return path if response.get("status") != 200 or response.get("bodySha256") != expected or \
            not mime_ok else None

    with ThreadPoolExecutor(max_workers=8) as pool:
        failures = [result for result in pool.map(check, files.items()) if result]
    return {"manifestSha256": manifest_hash, "checked": len(files),
            "matched": len(files) - len(failures), "failedPaths": failures}


def peer_signature(observation):
    """Exclude time-varying health bodies while preserving status and policy."""
    value = json.loads(json.dumps(observation))
    value["paths"]["health"].pop("bodySha256", None)
    for response in value["cors"].values():
        response.pop("bodySha256", None)
    return value


def cors_signature(cors):
    value = json.loads(json.dumps(cors))
    for response in value.values():
        response.pop("bodySha256", None)
    return value


def response_signature(response):
    """Compare status and policy while allowing a new SPA fallback body."""
    value = dict(response)
    value.pop("bodySha256", None)
    return value


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=("baseline", "after"), required=True)
    parser.add_argument("--service", choices=tuple(HOSTS))
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json":
        raise SystemExit("STOP: output must be a new JSON in this evidence directory")
    if not args.service or (args.stage == "baseline" and args.baseline) or \
            (args.stage == "after" and not args.baseline):
        raise SystemExit("STOP: invalid stage arguments")
    hosts = {name: shallow(host) for name, host in HOSTS.items()}
    if args.stage == "baseline":
        reachable = all(observation["paths"]["root"]["status"] == 200 and
                        observation["paths"]["health"]["status"] == 200 and
                        all(item["status"] is not None for item in observation["paths"].values()) and
                        all(item["status"] is not None for item in observation["cors"].values())
                        for observation in hosts.values())
        result = {"status": "BASELINE_CAPTURED" if reachable else "STOP_BASELINE",
                  "stage": "baseline", "service": args.service, "hosts": hosts,
                  "bodyValuesStored": False, "credentialsSent": False}
    else:
        if args.baseline.parent.resolve() != HERE or args.baseline.suffix != ".json":
            raise SystemExit("STOP: baseline receipt outside evidence directory")
        baseline = json.loads(args.baseline.read_bytes())
        if (baseline.get("status") != "BASELINE_CAPTURED" or
                baseline.get("service") != args.service or
                set(baseline.get("hosts", {})) != set(HOSTS) or
                baseline.get("bodyValuesStored") is not False or baseline.get("credentialsSent") is not False):
            raise SystemExit("STOP: baseline receipt invalid")
        peers_equal = {name: peer_signature(hosts[name]) == peer_signature(baseline["hosts"][name])
                       for name in HOSTS if name != args.service}
        assets = verify_assets(args.service)
        target = hosts[args.service]
        expected_index = manifest_for(args.service)[0]["index.html"]
        root_ok = target["paths"]["root"]["status"] == 200 and \
            target["paths"]["root"]["bodySha256"] == expected_index and \
            target["paths"]["root"]["contentType"] == "text/html"
        deep_ok = target["paths"]["deep"]["status"] == 200 and \
            target["paths"]["deep"]["bodySha256"] == expected_index and \
            target["paths"]["deep"]["contentType"] == "text/html"
        health_ok = target["paths"]["health"]["status"] == 200
        cors_unchanged = cors_signature(target["cors"]) == \
            cors_signature(baseline["hosts"][args.service]["cors"])
        missing_404 = target["paths"]["missing"]["status"] == 404
        panel_404 = target["paths"]["panel"]["status"] == 404
        missing_unchanged = response_signature(target["paths"]["missing"]) == \
            response_signature(baseline["hosts"][args.service]["paths"]["missing"])
        panel_unchanged = response_signature(target["paths"]["panel"]) == \
            response_signature(baseline["hosts"][args.service]["paths"]["panel"])
        all_ok = all(peers_equal.values()) and assets["checked"] == assets["matched"] and \
            root_ok and deep_ok and health_ok and cors_unchanged and \
            missing_unchanged and panel_unchanged
        result = {"status": "IMAGE_ONLY_SERVING_OK" if all_ok else "STOP_SERVED_REGRESSION",
                  "stage": "after", "service": args.service, "hosts": hosts,
                  "peersEqualBaseline": peers_equal, "assets": assets,
                  "root200": root_ok, "deep200": deep_ok, "health200": health_ok,
                  "corsUnchanged": cors_unchanged,
                  "missingAsset404": missing_404, "panel404": panel_404,
                  "missingBehaviorUnchanged": missing_unchanged,
                  "panelBehaviorUnchanged": panel_unchanged,
                  "fullSmokeContractPassed": False, "bodyValuesStored": False,
                  "credentialsSent": False}
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(result, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(result["status"])
    return 0 if result["status"] in ("BASELINE_CAPTURED", "IMAGE_ONLY_SERVING_OK") else 2


if __name__ == "__main__":
    sys.exit(main())
