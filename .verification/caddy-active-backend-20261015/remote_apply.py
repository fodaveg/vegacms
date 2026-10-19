"""One-shot remote bootstrap. Sources and artifacts are embedded by the sealed launcher."""
import json
from pathlib import Path

def main():
    result={'operationId':PACKAGE.get('operationId'),'phase':'STOP_NEEDS_OPERATOR',
            'failureClass':'UNKNOWN','backupVerified':False,'rollbackVerified':False}
    try:
        engine={'__name__':'apply_engine'}
        exec(compile(ENGINE_SOURCE,'<sealed-engine>','exec'),engine)
        artifacts={'manifest':VALIDATION_MANIFEST,'receipt':VALIDATION_RECEIPT,
                   'projection':VALIDATION_PROJECTION,'transformer':TRANSFORMER_SOURCE}
        engine['require_ready'](PACKAGE,artifacts)
        probe={'__name__':'metadata_classifier'}
        exec(compile(PROBE_SOURCE,'<sealed-metadata-classifier>','exec'),probe)
        backend={'__name__':'runtime_backend'}
        exec(compile(BACKEND_SOURCE,'<sealed-runtime-backend>','exec'),backend)
        with backend['Runtime'](VALIDATOR_SOURCE,PACKAGE,GRANTS,engine,
                                probe['classify_mounts']) as runtime:
            worker=engine['Engine'](Path('/srv/edge'),Path(GRANTS['backupBase']),PACKAGE,
                                     artifacts,runtime.observe,runtime.validate,
                                     runtime.reload,runtime.smoke,runtime.rollback_smoke)
            result=worker.run()
    except Exception:
        pass
    print(json.dumps(result,sort_keys=True))

if __name__=='__main__':
    main()
