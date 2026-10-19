"""Local one-shot launcher; DRAFT gate rejects before SSH until logger proof exists."""
import hashlib
import json
import os
from pathlib import Path
import sys
import uuid

HERE=Path(__file__).resolve().parent
BACKEND_STATUS='DRAFT_LOGGER_PROOF_PENDING'
FILES=('apply_engine.py','runtime_backend.py','remote_apply.py','remote_probe.py',
       'run_apply_once.py','test_apply_engine.py','test_runtime_backend.py',
       'apply-tests.log','backend-proposal.md','backend-verification.md')
INPUTS=('package.json','validation-manifest.json','validation-receipt.json',
        'validation-projection.json','transformer.py','validator.py')

def sha(data): return hashlib.sha256(data).hexdigest()

def authorize(operation):
    # DRAFT and incomplete packages never load executable transformer or open SSH.
    if BACKEND_STATUS!='FINAL_REVIEWED':
        raise ValueError('DRAFT_ZERO_CONNECTIONS')
    try:
        manifest_bytes=(HERE/'apply-manifest.json').read_bytes()
        manifest=json.loads(manifest_bytes)
        approval=json.loads((HERE/'execution-approval.json').read_bytes())
        files={name:(HERE/name).read_bytes() for name in FILES}
        inputs={name:(HERE/name).read_bytes() for name in INPUTS}
    except (OSError,ValueError):
        raise ValueError('NOT_AUTHORIZED_ZERO_CONNECTIONS') from None
    if (manifest.get('operationId')!=operation or manifest.get('status')!='FINAL_REVIEWED' or
            manifest.get('files')!={name:sha(data) for name,data in files.items()} or
            manifest.get('inputs')!={name:sha(data) for name,data in inputs.items()}):
        raise ValueError('SEAL_MISMATCH_ZERO_CONNECTIONS')
    if (approval.get('status')!='APPROVED' or approval.get('operationId')!=operation or
            approval.get('manifestSHA256')!=sha(manifest_bytes) or
            approval.get('scope')!={'fourSources':True,'adminRead':True,
                                   'sinkMetadataRead':True,'sinkRead':True,
                                   'reload':True,'publicSmoke':True,'noDataRestore':True} or
            not approval.get('runtimeApprovalReference') or
            not approval.get('applicationApprovalReference')):
        raise ValueError('NOT_AUTHORIZED_ZERO_CONNECTIONS')
    package=json.loads(inputs['package.json'])
    grants=approval['grants']
    if (not isinstance(grants,dict) or grants.get('adminRead') is not True or
            grants.get('sinkMetadataRead') is not True or grants.get('reload') is not True or
            grants.get('publicSmoke') is not True or grants.get('sinkRead') is not True or
            grants.get('loggerStimulusReviewed') is not True or
            grants.get('adminAddress')!='127.0.0.1:2019' or
            grants.get('sinkKind')!='DOCKER_STDERR' or
            grants.get('backupBase')!='/var/lib/caddy-active-apply'):
        raise ValueError('GRANT_INCOMPLETE_ZERO_CONNECTIONS')
    engine={'__name__':'local_engine_gate'}
    exec(compile(files['apply_engine.py'],'<sealed-engine>','exec'),engine)
    engine['require_ready'](package,{'manifest':inputs['validation-manifest.json'],
        'receipt':inputs['validation-receipt.json'],
        'projection':inputs['validation-projection.json'],
        'transformer':inputs['transformer.py']})
    if sha(inputs['validator.py'])!=package.get('validatorSHA256'):
        raise ValueError('VALIDATOR_SEAL_ZERO_CONNECTIONS')
    return files,inputs,package,grants

def main():
    try:
        operation=str(uuid.UUID(sys.argv[1]))
        files,inputs,package,grants=authorize(operation)
    except Exception:
        print('NOT_AUTHORIZED_OR_DRAFT_ZERO_CONNECTIONS')
        return 1
    marker=HERE/'apply-request-started.json'
    try:
        descriptor=os.open(marker,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(descriptor,'w') as stream:
            json.dump({'operationId':operation,'attempts':1},stream)
    except OSError:
        print('CONSUMED_OR_UNAVAILABLE_ZERO_CONNECTIONS')
        return 1
    payload=b''
    for variable,data in (('ENGINE_SOURCE',files['apply_engine.py']),
                          ('BACKEND_SOURCE',files['runtime_backend.py']),
                          ('PROBE_SOURCE',files['remote_probe.py']),
                          ('VALIDATOR_SOURCE',inputs['validator.py']),
                          ('TRANSFORMER_SOURCE',inputs['transformer.py']),
                          ('VALIDATION_MANIFEST',inputs['validation-manifest.json']),
                          ('VALIDATION_RECEIPT',inputs['validation-receipt.json']),
                          ('VALIDATION_PROJECTION',inputs['validation-projection.json'])):
        payload+=variable.encode()+b' = '+repr(data).encode()+b'\n'
    payload+=b'PACKAGE = '+repr(package).encode()+b'\nGRANTS = '+repr(grants).encode()+b'\n'
    payload+=files['remote_apply.py']
    receipt={'operationId':operation,'status':'TRANSPORT_OR_PROJECTION_ERROR_NO_RETRY'}
    try:
        validator={'__name__':'sealed_capture'}
        exec(compile(inputs['validator.py'],'<sealed-validator>','exec'),validator)
        response=validator['capture_process'](['ssh','-o','BatchMode=yes',
             '-o','StrictHostKeyChecking=yes','lumbre','python3','-B','-'],
             input=payload,timeout=900,limit=4096)
        receipt['transportExit']=response.returncode
        if response.returncode==0:
            result=json.loads(response.stdout)
            allowed={'operationId','phase','failureClass','backupVerified','rollbackVerified'}
            if (set(result)==allowed and result['operationId']==operation and
                    result['phase'] in {'PREPARED','STAGED','INSTALLED_UNLOADED','RELOADED',
                    'SMOKED','ACCEPTED','ROLLED_BACK','STOP_NEEDS_OPERATOR'} and
                    result['failureClass'] in {'NONE','INPUT','GUARD','SOURCE','VALIDATE',
                    'RELOAD','SMOKE','CAS','UNKNOWN'} and
                    type(result['backupVerified']) is bool and type(result['rollbackVerified']) is bool):
                (HERE/'apply-projection.json').write_text(json.dumps(result,sort_keys=True,indent=2)+'\n')
                receipt['status']='PROJECTED'
    except Exception:
        pass
    (HERE/'apply-execution-receipt.json').write_text(json.dumps(receipt,sort_keys=True,indent=2)+'\n')
    print(json.dumps(receipt,sort_keys=True))
    return 0 if receipt['status']=='PROJECTED' else 1

if __name__=='__main__': sys.exit(main())
