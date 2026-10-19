"""Read only five frozen edge file hashes for the image-only invariance gate."""

import hashlib
import json
import os
from pathlib import Path
import stat


EXPECTED = {
    "/srv/edge/compose.yml": "c6c47d481ff63296d8818680e6b20d351a73b34d00b9339b2654df7679abbee2",
    "/srv/edge/conf.d/fodaveg.caddy": "0bdaa9f5ef1af907f7a4746ad2be5af22c7553457af8871563de00fe56e171f0",
    "/srv/edge/conf.d/admin-lumbre-pro.caddy": "9a3322ce14562e20bfb5bdc10eac6a63c077120a327aafcf4a222492cc0c1f53",
    "/srv/edge/conf.d/vega.caddy": "772440180332741a8716b440cc699dfe117f1fe716ab7a38458a9e7eea9c7b06",
    "/srv/edge/Caddyfile": "ff093f30330f8a7fa536bffcafb12cc316b096e4210142461889da66eaabb09b",
}


def hash_regular(path):
    """Hash bytes in RAM with a bounded, final-symlink-free descriptor."""
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or before.st_size > 2 * 1024 * 1024:
            raise RuntimeError("EdgeFileUnknown")
        hasher = hashlib.sha256()
        total = 0
        for chunk in iter(lambda: stream.read(65536), b""):
            total += len(chunk)
            if total > 2 * 1024 * 1024:
                raise RuntimeError("EdgeFileUnknown")
            hasher.update(chunk)
        after = os.fstat(stream.fileno())
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError("ConcurrentEdgeChange")
    return hasher.hexdigest()


def main():
    try:
        matched = {path: hash_regular(Path(path)) == expected for path, expected in EXPECTED.items()}
        result = {"status": "EDGE_UNCHANGED" if all(matched.values()) else "STOP_EDGE_DRIFT",
                  "schemaVersion": 1, "matches": matched, "targetFileCount": 5,
                  "remoteWrites": False, "configEnvRead": False, "fileBodiesProjected": False}
    except Exception:
        result = {"status": "STOP_EDGE_READ", "schemaVersion": 1, "matches": None,
                  "targetFileCount": 5, "remoteWrites": False, "configEnvRead": False,
                  "fileBodiesProjected": False}
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0 if result["status"] == "EDGE_UNCHANGED" else 2


if __name__ == "__main__":
    raise SystemExit(main())
