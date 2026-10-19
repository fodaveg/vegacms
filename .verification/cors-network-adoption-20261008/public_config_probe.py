"""Classify three public Vega runtime configs without exporting response bodies."""

import json
import sys
from urllib import error, request

PAGES = {
    "vega": "https://admin.vegacms.com",
    "lumbre": "https://admin.lumbre.pro",
    "fodaveg": "https://admin.fodaveg.net",
}
LIMIT = 8192


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def classify_body(body, status, content_type, page):
    """Mirror fetchVegaConfig/resolveBackendUrl for the observable public input."""
    mime = content_type.split(";", 1)[0].strip().lower()
    mime_class = "JSON" if mime == "application/json" else "HTML" if mime == "text/html" else "OTHER"
    base = {"httpStatus": status, "mime": mime_class, "shape": None,
            "backend": None, "overrideUninspected": True}
    if 300 <= status < 400:
        return {**base, "shape": "REDIRECT_UNFOLLOWED", "backend": "UNDETERMINED"}
    if not 200 <= status < 300:
        return {**base, "shape": "HTTP_NON_OK", "backend": "SAME_ORIGIN"}
    if len(body) > LIMIT:
        return {**base, "shape": "OVERSIZED", "backend": "UNDETERMINED"}
    try:
        value = json.loads(body)
    except (UnicodeError, ValueError):
        return {**base, "shape": "PARSE_FAILURE", "backend": "SAME_ORIGIN"}
    if value is None or not isinstance(value, (dict, list)):
        return {**base, "shape": "JSON_PRIMITIVE", "backend": "SAME_ORIGIN"}
    if isinstance(value, list):
        return {**base, "shape": "JSON_ARRAY", "backend": "SAME_ORIGIN"}
    backend = value.get("backendUrl")
    if backend is None or backend == "":
        return {**base, "shape": "JSON_OBJECT_NO_BACKEND", "backend": "SAME_ORIGIN"}
    if not isinstance(backend, str):
        return {**base, "shape": "JSON_OBJECT_BACKEND_OTHER", "backend": "UNDETERMINED"}
    if backend.strip() == page:
        return {**base, "shape": "JSON_OBJECT_BACKEND_PUBLIC", "backend": "SAME_ORIGIN"}
    if backend.strip() in PAGES.values():
        return {**base, "shape": "JSON_OBJECT_BACKEND_PUBLIC", "backend": "KNOWN_OTHER_ORIGIN"}
    return {**base, "shape": "JSON_OBJECT_BACKEND_OTHER", "backend": "UNDETERMINED"}


def classify(page):
    opener = request.build_opener(request.ProxyHandler({}), NoRedirect)
    req = request.Request(page + "/vega.config.json", method="GET")
    try:
        with opener.open(req, timeout=8) as response:
            return classify_body(response.read(LIMIT + 1), response.status,
                                 response.headers.get("Content-Type", ""), page)
    except error.HTTPError as failure:
        return classify_body(b"", failure.code, failure.headers.get("Content-Type", ""), page)
    except Exception:
        return {"httpStatus": None, "mime": "UNAVAILABLE", "shape": "UNAVAILABLE",
                "backend": "UNDETERMINED", "overrideUninspected": True}


def main():
    result = {"schemaVersion": 1, "mode": "PUBLIC_VEGA_CONFIG_CLASSIFIER",
              "status": "PROJECTED", "remoteWrites": False,
              "pages": {name: classify(page) for name, page in PAGES.items()}}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
