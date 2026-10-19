# Local verification

`python3 -B .verification/caddy-active-backend-20261015/probe.py` → 12 tests OK, exit 0 ([probe.log](probe.log)). Cases cover directory bind, file/directory or foreign-source destination shadow, absent/nonbind mount, schema rejection, validator guard, private projection rejection and zero-connection missing approval. No Docker/SSH/admin/log read occurred locally.
