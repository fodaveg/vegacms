"""Closed public projection for selected runtime metadata."""
FIELDS = {'status','failureClass','validatorMatched','runtimeIdentityMatched',
          'commandVerified','configMapped','mountShape'}
FAILURES = {'UNKNOWN','VALIDATOR_CHANGED','IDENTITY_CHANGED','COMMAND_UNKNOWN',
            'MAPPING_UNKNOWN','IMAGE_SOURCE_UNVERIFIED','VERSION_UNKNOWN','GUARD_CHANGED',
            'UNSAFE_OR_MISSING_PATH','EXECUTABLE_MOUNT_SHADOW','CLI_FAILED',
            'CAPTURE_LIMIT_OR_TIMEOUT','PROVENANCE_STOP','OPERATION_ERROR','NONE'}
MOUNTS = {'UNKNOWN','OTHER','FILE_BIND_OR_SHADOW','DIRECTORY_BIND_ALL',
          'MISSING_ROOT_DIRECTORY_BIND','CONFIG_OUTSIDE_ROOT_BIND'}

def validate(value):
    if (not isinstance(value,dict) or set(value)!=FIELDS or
            value['status'] not in {'STOPPED','DIAGNOSED'} or
            value['failureClass'] not in FAILURES or value['mountShape'] not in MOUNTS or
            any(type(value[key]) is not bool for key in
                ('validatorMatched','runtimeIdentityMatched','commandVerified','configMapped'))):
        raise ValueError('PROJECTION_REJECTED')
    if value['status']=='DIAGNOSED' and not (value['failureClass']=='NONE' and
            value['validatorMatched'] and value['runtimeIdentityMatched'] and
            value['commandVerified'] and value['configMapped']):
        raise ValueError('PROJECTION_REJECTED')
    return value
