"""Targeted public CORS and immutable-asset check around one PB command cutover."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

HERE = Path(__file__).resolve().parent
SMOKE_SOURCE = HERE.parent.parent / "image-only-delivery-20261008" / "served_smoke.py"
SMOKE_SHA = "04be908ba8eae67ce42db644ad98efc9ef1c3aa2d46b5e1921e9e5d6f88e7e23"
HOSTS = {"vega-pb": "admin.vegacms.com", "lumbre-admin-pb": "admin.lumbre.pro"}
DISCOVERY = "/api/vega/discovery"
NORMAL_API = "/api/collections/_superusers/records"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = build_opener(ProxyHandler({}), NoRedirect)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def preflight(host, origin, method, path):
    """Classify an unauthenticated PB preflight; never export raw headers."""
    req = Request("https://" + host + path, method="OPTIONS", headers={
        "Origin": origin,
        "Access-Control-Request-Method": method,
        "Access-Control-Request-Headers": "authorization,content-type",
        "Accept-Encoding": "identity",
        "User-Agent": "VegaCorsSmoke/1",
    })
    try:
        response = OPENER.open(req, timeout=12)
    except HTTPError as failure:
        response = failure
    except (URLError, TimeoutError, OSError):
        return {"status": None, "origin": "UNAVAILABLE", "methodAllowed": False,
                "headersAllowed": False}
    with response:
        final = urlsplit(response.url)
        if final.scheme != "https" or final.hostname != host:
            return {"status": None, "origin": "UNAVAILABLE", "methodAllowed": False,
                    "headersAllowed": False}
        allowed = response.headers.get("Access-Control-Allow-Origin")
        origin_class = "ABSENT" if allowed is None else "MATCH" if allowed == origin else \
            "WILDCARD" if allowed == "*" else "OTHER"
        methods = {part.strip().lower() for part in
                   response.headers.get("Access-Control-Allow-Methods", "").split(",")}
        headers = {part.strip().lower() for part in
                   response.headers.get("Access-Control-Allow-Headers", "").split(",")}
        return {"status": response.status, "origin": origin_class,
                "methodAllowed": method.lower() in methods,
                "headersAllowed": {"authorization", "content-type"}.issubset(headers)}


def discovery_json(host):
    """Require real bounded JSON from the known discovery endpoint, not HTML fallback."""
    req = Request("https://" + host + DISCOVERY, method="GET", headers={
        "Accept": "application/json", "Accept-Encoding": "identity",
        "User-Agent": "VegaCorsSmoke/1"})
    try:
        response = OPENER.open(req, timeout=12)
    except HTTPError as failure:
        response = failure
    except (URLError, TimeoutError, OSError):
        return False
    with response:
        final = urlsplit(response.url)
        if final.scheme != "https" or final.hostname != host or response.status != 200 or \
                response.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != \
                "application/json":
            return False
        body = response.read(8193)
        if len(body) > 8192:
            return False
        try:
            return isinstance(json.loads(body), dict)
        except (UnicodeError, ValueError):
            return False


def canonical_index_alias(host):
    """Accept only a known index-file redirect to this host's verified root."""
    url = "https://" + host + "/index.html"
    request = Request(url, method="GET", headers={
        "Accept-Encoding": "identity", "User-Agent": "VegaCorsSmoke/1"})
    try:
        response = OPENER.open(request, timeout=12)
    except HTTPError as failure:
        response = failure
    except (URLError, TimeoutError, OSError):
        return False
    with response:
        location = response.headers.get("Location")
        return (response.status in (301, 308) and isinstance(location, str) and
                len(location) <= 512 and urljoin(url, location) == "https://" + host + "/")


def verified_assets(smoke, service, target):
    """Count a canonical index alias only when root bytes match the sealed manifest."""
    assets = smoke.verify_assets(service)
    expected = smoke.manifest_for(service)[0]["index.html"]
    alias = (assets["failedPaths"] == ["index.html"] and
             target["paths"]["root"]["status"] == 200 and
             target["paths"]["root"]["bodySha256"] == expected and
             canonical_index_alias(HOSTS[service]))
    return assets["checked"], assets["matched"] + int(alias), alias


def stable_paths(smoke, observation):
    value = smoke.peer_signature(observation)["paths"]
    for key in ("missing", "panel"):
        value[key].pop("bodySha256", None)
    return digest(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def stable_peer(smoke, observation):
    value = smoke.peer_signature(observation)
    return digest(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def stable_cors(smoke, observation):
    value = smoke.cors_signature(observation["cors"])
    return digest(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


def observe(smoke, service):
    hosts = {name: smoke.shallow(host) for name, host in smoke.HOSTS.items()}
    if any(item.get("networkError") or item.get("status") is None
           for view in hosts.values() for item in (*view["paths"].values(), *view["cors"].values())):
        raise RuntimeError("PublicPathUnavailable")
    target = hosts[service]
    expected = smoke.manifest_for(service)[0]["index.html"]
    if (target["paths"]["root"]["status"] != 200 or
            target["paths"]["root"]["bodySha256"] != expected or
            target["paths"]["root"]["contentType"] != "text/html" or
            target["paths"]["deep"]["status"] != 200 or
            target["paths"]["deep"]["bodySha256"] != expected or
            target["paths"]["deep"]["contentType"] != "text/html" or
            target["paths"]["health"]["status"] != 200):
        raise RuntimeError("TargetPathsUnknown")
    return hosts


def cors_after(smoke, service, observation):
    """Check public PB CORS; stock discovery may use the sealed SPA fallback."""
    host = HOSTS[service]
    own = "https://" + host
    foreign = "https://not-authorized.invalid"
    base = observation["cors"]
    null_get = smoke.fetch(host, "/api/health", "GET", "null")
    null_options = smoke.fetch(host, "/api/health", "OPTIONS", "null")
    methods = ("GET", "POST", "PATCH", "DELETE")
    requested = {(path, key, method): preflight(host, origin, method, path)
                 for path in ("/api/health", DISCOVERY, NORMAL_API)
                 for key, origin in (("own", own), ("foreign", foreign), ("null", "null"))
                 for method in methods}
    origins = (("own", own), ("foreign", foreign), ("null", "null"),
               ("without", None))
    cors_origins = origins[:-1]
    discovery = {key: smoke.fetch(host, DISCOVERY, "GET", origin)
                 for key, origin in origins}
    discovery_options = {key: smoke.fetch(host, DISCOVERY, "OPTIONS", origin)
                         for key, origin in cors_origins}
    normal_api = {key: smoke.fetch(host, NORMAL_API, "GET", origin)
                  for key, origin in origins}
    normal_options = {key: smoke.fetch(host, NORMAL_API, "OPTIONS", origin)
                      for key, origin in cors_origins}
    own_ok = all(base[key]["status"] is not None and base[key]["cors"] == own
                 for key in ("getOwn", "optionsOwn"))
    foreign_denied = all(base[key]["cors"] is None for key in
                         ("getForeign", "optionsForeign"))
    null_denied = all(item["status"] is not None and item.get("cors") is None for item in
                      (null_get, null_options))
    if service == "vega-pb":
        expected_mime = "text/html"
        expected_sha = smoke.manifest_for(service)[0]["index.html"]
        discovery_body_ok = all(discovery[key].get("bodySha256") == expected_sha
                                for key, _ in origins)
    else:
        expected_mime = "application/json"
        discovery_body_ok = discovery_json(host)
    discovery_ok = discovery_body_ok and all(
        discovery[key].get("status") == 200 and
        discovery[key].get("contentType") == expected_mime and
        discovery[key].get("cors") == (own if key == "own" else None) and
        (key == "without" or
         (discovery_options[key].get("status") is not None and
          200 <= discovery_options[key]["status"] < 300 and
          discovery_options[key].get("cors") == (own if key == "own" else None)))
        for key, _ in origins)
    discovery_mode = ("LEGACY_SPA_FALLBACK" if service == "vega-pb" else "JSON") \
        if discovery_ok else "UNKNOWN"
    normal_api_ok = all(
        normal_api[key].get("status") in (401, 403) and
        normal_api[key].get("contentType") == "application/json" and
        normal_api[key].get("cors") == (own if key == "own" else None) and
        (key == "without" or
         (normal_options[key].get("status") is not None and
          200 <= normal_options[key]["status"] < 300 and
          normal_options[key].get("cors") == (own if key == "own" else None)))
        for key, _ in origins)
    preflight_ok = all(
        requested[(path, "own", method)]["status"] is not None and
        200 <= requested[(path, "own", method)]["status"] < 300 and
        requested[(path, "own", method)]["origin"] == "MATCH" and
        requested[(path, "own", method)]["methodAllowed"] and
        requested[(path, "own", method)]["headersAllowed"] and
        all(requested[(path, key, method)]["status"] is not None and
            not 300 <= requested[(path, key, method)]["status"] < 400 and
            requested[(path, key, method)]["origin"] == "ABSENT"
            for key in ("foreign", "null"))
        for path in ("/api/health", DISCOVERY, NORMAL_API) for method in methods)
    return ({"ownOrigin": own_ok, "foreignDenied": foreign_denied,
             "nullDenied": null_denied, "discoveryAndCors": discovery_ok,
             "normalApiAndCors": normal_api_ok, "methodHeaderPreflights": preflight_ok,
             "withoutOrigin": observation["paths"]["health"]["status"] == 200},
            discovery_mode)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=("baseline", "after", "rollback"), required=True)
    parser.add_argument("--service", choices=tuple(HOSTS), required=True)
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    smoke_source = SMOKE_SOURCE.read_bytes()
    if args.out.exists() or args.out.parent.resolve() != HERE or args.out.suffix != ".json" or \
            (args.stage != "baseline") != bool(args.baseline) or \
            digest(Path(__file__).read_bytes()) != args.script_sha256 or \
            digest(smoke_source) != SMOKE_SHA:
        raise SystemExit("STOP: local source/baseline/output guard")
    import types
    smoke = types.ModuleType("sealed_served_smoke")
    smoke.__file__ = str(SMOKE_SOURCE)
    exec(compile(smoke_source, str(SMOKE_SOURCE), "exec"), smoke.__dict__)
    smoke.urlopen = OPENER.open
    try:
        hosts = observe(smoke, args.service)
        target = hosts[args.service]
        paths_hash = stable_paths(smoke, target)
        cors_hash = stable_cors(smoke, target)
        peers = {name: stable_peer(smoke, value) for name, value in hosts.items()
                 if name != args.service}
        if args.stage == "baseline":
            result = {"status": "CORS_BASELINE_CAPTURED", "stage": args.stage,
                      "service": args.service, "targetPathsSha": paths_hash,
                      "targetCorsSha": cors_hash, "peerShas": peers,
                      "credentialsSent": False, "bodyValuesStored": False}
        else:
            if args.baseline.parent.resolve() != HERE or args.baseline.suffix != ".json":
                raise RuntimeError("BaselinePathUnknown")
            if args.baseline.stat().st_size > 8192 or args.baseline.is_symlink():
                raise RuntimeError("BaselineSizeOrTypeUnknown")
            baseline = json.loads(args.baseline.read_bytes())
            if (not isinstance(baseline, dict) or set(baseline) != {
                    "status", "stage", "service", "targetPathsSha", "targetCorsSha", "peerShas",
                    "credentialsSent", "bodyValuesStored"} or
                    baseline["status"] != "CORS_BASELINE_CAPTURED" or
                    baseline["stage"] != "baseline" or baseline["service"] != args.service or
                    baseline["credentialsSent"] is not False or
                    baseline["bodyValuesStored"] is not False or
                    not isinstance(baseline["targetPathsSha"], str) or
                    not re.fullmatch(r"[0-9a-f]{64}", baseline["targetPathsSha"]) or
                    not isinstance(baseline["targetCorsSha"], str) or
                    not re.fullmatch(r"[0-9a-f]{64}", baseline["targetCorsSha"]) or
                    not isinstance(baseline["peerShas"], dict) or
                    set(baseline["peerShas"]) != set(smoke.HOSTS) - {args.service} or
                    any(not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value)
                        for value in baseline["peerShas"].values())):
                raise RuntimeError("BaselineUnknown")
            assets_checked, assets_matched, canonical_alias = verified_assets(
                smoke, args.service, target)
            paths_ok = paths_hash == baseline["targetPathsSha"]
            peers_ok = peers == baseline["peerShas"]
            assets_ok = assets_checked == assets_matched and assets_checked == 153
            if args.stage == "after":
                cors, discovery_mode = cors_after(smoke, args.service, target)
                passed = paths_ok and peers_ok and assets_ok and all(cors.values())
                result = {"status": "CORS_PUBLIC_OK" if passed else "STOP_CORS_PUBLIC",
                          "stage": args.stage, "service": args.service,
                          "pathsUnchanged": paths_ok, "peersUnchanged": peers_ok,
                          "assetsChecked": assets_checked, "assetsMatched": assets_matched,
                          "canonicalIndexAlias": canonical_alias,
                          "cors": cors, "discoveryMode": discovery_mode,
                          "credentialsSent": False, "bodyValuesStored": False}
            else:
                cors_ok = cors_hash == baseline["targetCorsSha"]
                passed = paths_ok and peers_ok and assets_ok and cors_ok
                result = {"status": "CORS_ROLLBACK_PUBLIC_OK" if passed else "STOP_CORS_ROLLBACK_PUBLIC",
                          "stage": args.stage, "service": args.service,
                          "pathsUnchanged": paths_ok, "peersUnchanged": peers_ok,
                          "assetsChecked": assets_checked, "assetsMatched": assets_matched,
                          "canonicalIndexAlias": canonical_alias,
                          "corsRestored": cors_ok, "credentialsSent": False,
                          "bodyValuesStored": False}
    except Exception:
        result = {"status": "STOP_PUBLIC_UNAVAILABLE", "stage": args.stage,
                  "service": args.service, "credentialsSent": False,
                  "bodyValuesStored": False}
    descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(result, stream, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    print(result["status"])
    return 0 if result["status"] in (
        "CORS_BASELINE_CAPTURED", "CORS_PUBLIC_OK", "CORS_ROLLBACK_PUBLIC_OK") else 2


if __name__ == "__main__":
    sys.exit(main())
