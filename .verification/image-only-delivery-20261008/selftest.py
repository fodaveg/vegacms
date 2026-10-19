"""Small probes for the image-only metadata projector; no SSH/Docker."""

import base64
import importlib.util
import tempfile
from pathlib import Path
from unittest.mock import patch


SOURCE = Path(__file__).with_name("remote_preflight.py")
spec = importlib.util.spec_from_file_location("remote_preflight", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
wrapper_spec = importlib.util.spec_from_file_location("run_preflight", SOURCE.with_name("run_preflight.py"))
wrapper = importlib.util.module_from_spec(wrapper_spec)
wrapper_spec.loader.exec_module(wrapper)
passed = 0


def check(condition, reason):
    global passed
    if not condition:
        raise AssertionError(reason)
    passed += 1


check(".Config.Env" not in module.DOCKER_TEMPLATE, "Docker template requested environment")
check("caddy" not in module.DOCKER_TEMPLATE.lower(), "Docker template requested Caddy")
check(module.project_args(["serve", "--origins=https://admin.vegacms.com"])["unknownCount"] == 0,
      "public origins rejected")
projected = module.project_args(["serve", "--origins=https://hidden.example/?secret=x", "--private=password"])
check(projected == {"allowed": ["serve"], "unknownCount": 2}, "unknown argv leaked")
check(module.project_args(["/pb/fodaveg-pb", "--dir", "/pb/pb_data", "serve",
                           "--http=0.0.0.0:8090"])["unknownCount"] == 0,
      "Fodaveg child argv falsely rejected")
check(module.project_args(["/usr/bin/tini", "-g", "--", "./docker-entrypoint.sh"])["unknownCount"] == 0,
      "Fodaveg entrypoint falsely rejected")
check(module.project_args(["--dir", "/private/secret"])["unknownCount"] == 2,
      "private directory accepted")
check(module.project_args(["./other-script.sh"])["unknownCount"] == 1,
      "unknown entrypoint accepted")
check(module.project_image_cmd("fodaveg", None) == {"allowed": [], "unknownCount": 0} and
      module.project_image_cmd("vega-pb", None)["unknownCount"] == 1,
      "null CMD handling crossed image boundary")
check("/proc/[0-9]*/comm" in module.PROC_COMMAND and "cmdline" in module.PROC_COMMAND and
      "/proc/environ" not in module.PROC_COMMAND and "docker top" not in SOURCE.read_text(),
      "process reader escaped exact PB-only boundary")


def framed(*argv):
    raw = b"\0".join(value.encode("utf-8") for value in argv) + b"\0"
    return b"__PB_BEGIN__\n" + base64.b64encode(raw) + b"\n__PB_END__\n"


for name, argv in (
    ("vega-pb", ("/pb/pocketbase", *module.STOCK_OLD_CMD)),
    ("lumbre-admin-pb", ("/pb/lumbre-admin", "serve", "--http=0.0.0.0:8090",
                         "--dir=/pb/pb_data", "--publicDir=/pb/pb_public")),
    ("fodaveg", ("/pb/fodaveg-pb", "--dir", "/pb/pb_data", "serve", "--http=0.0.0.0:8090")),
):
    check(module.project_proc_output(framed(*argv), name) == {"allowed": list(argv), "unknownCount": 0},
          f"valid {name} PB argv rejected")
check(module.project_proc_output(b"", "vega-pb")["unknownCount"] == 1, "no PB accepted")
check(module.project_proc_output(framed("/pb/pocketbase", "serve") * 2, "vega-pb")["unknownCount"] == 1,
      "multiple PB processes accepted")
check(module.project_proc_output(b"__PB_BEGIN__\nnot-base64!\n__PB_END__\n", "vega-pb")["unknownCount"] == 1,
      "invalid base64 accepted")
check(module.project_proc_output(framed("/pb/fodaveg-pb", "serve"), "vega-pb")["unknownCount"] == 1,
      "cross-container PB executable accepted")
check(module.project_proc_output(framed("/pb/pocketbase", "--private=token"), "vega-pb") ==
      {"allowed": ["/pb/pocketbase"], "unknownCount": 1}, "unknown argument leaked")
with patch.object(module, "run", return_value=framed("/pb/pocketbase", "serve")) as mocked:
    check(module.project_process("vega-pb")["unknownCount"] == 0 and
          mocked.call_args.args[0][:4] == ["docker", "exec", "vega-pb", "/bin/sh"],
          "process reader did not use bounded Docker exec")
mounts, unknown = module.project_mounts([{"type": "bind", "name": "", "source": "/private/example",
                                          "dest": "/pb/pb_migrations", "rw": False}])
check(unknown == 0 and mounts[0]["sourceFingerprint"] and "/private/example" not in repr(mounts),
      "bind source leaked")
mounts, unknown = module.project_mounts([{"type": "volume", "name": "secret_volume",
                                          "source": "/var/lib/docker/volumes/secret_volume",
                                          "dest": "/pb/pb_data", "rw": True}])
check(unknown == 1 and not mounts, "unknown volume accepted")
check(not module.matches_mounts("vega-pb", [{"type": "volume", "name": "fodaveg_fodaveg_pb",
                                              "destination": "/pb/pb_data", "readWrite": True,
                                              "sourceFingerprint": "0" * 64}]),
      "foreign data volume accepted")
check(not module.matches_network("vega-pb", [{"name": "vega-edge", "aliases": ["vega-pb"]}]),
      "new network accepted")
check(module.STOCK_OLD_CMD == ["serve", "--http=0.0.0.0:8090", "--dir=/pb/pb_data",
                               "--publicDir=/pb/pb_public"], "stock CORS baseline changed")
check(module.selected_image_ref("vega-pb", {"VEGA_IMAGE_TAG": "a" * 40,
                                             "VEGA_GIT_SHA": "b" * 40}) is None,
      "mismatched stock selector accepted")

with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temp:
    path = Path(temp) / ".env"
    path.write_text("PB_ADMIN_PASSWORD=not-for-output\nFODAVEG_IMAGE=fodaveg:abcdef1\n")
    check(module.selected_env(str(path), ("FODAVEG_IMAGE",)) == {"FODAVEG_IMAGE": "fodaveg:abcdef1"},
          "selector scan exposed other key")
    path.write_text("FODAVEG_IMAGE=fodaveg:abcdef1\nFODAVEG_IMAGE=fodaveg:abcdef2\n")
    try:
        module.selected_env(str(path), ("FODAVEG_IMAGE",))
    except RuntimeError:
        passed += 1
    else:
        raise AssertionError("duplicate selector accepted")

with patch.object(module, "hash_file", return_value="0" * 64), \
     patch.object(module, "selected_env", return_value={"FODAVEG_IMAGE": "fodaveg:abcdef1"}), \
     patch.object(module.subprocess, "run", side_effect=RuntimeError("a secret-bearing error")):
    output = module.preflight()
    check(output["status"] == "STOP" and "secret-bearing" not in repr(output),
          "exception detail leaked")

valid_stop = {"schemaVersion": 1, "mode": "image-only-metadata-preflight",
              "remoteWrites": False, "caddyRead": False, "configEnvRequested": False,
              "dotenvSelectorScan": True, "composeMayInterpolateSecretsInRAM": True,
              "composeBodyParsed": False, "composeHashRead": True,
              "containers": {name: {"status": "STOP", "errorCode": "MetadataUnavailable"}
                             for name in ("vega-pb", "lumbre-admin-pb", "fodaveg")},
              "status": "STOP"}
check(wrapper.validate(valid_stop), "bounded STOP projection rejected")
invalid = {**valid_stop, "Config.Env": "password"}
check(not wrapper.validate(invalid), "unexpected secret field accepted")

print(f"PASS {passed} isolated probes; zero remote operations")
