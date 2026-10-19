import { spawn } from 'node:child_process';
import { createWriteStream, writeFileSync } from 'node:fs';
const cwd='/private/tmp/vegacms-ui-publish-icons-20261007';
const evidence='/Users/david/code/vegacms/.verification/ui-publish-icons-20261007';
const changed=['src/lib/form/RecordBlocks.svelte','src/lib/form/RecordForm.publish.svelte.test.ts','src/lib/form/RecordForm.review.svelte.test.ts','src/lib/form/RecordForm.schedule.svelte.test.ts','src/lib/form/RecordForm.svelte','src/lib/icons/Icon.svelte','src/lib/icons/registry.ts','src/lib/richtext/EditorToolbar.svelte','src/lib/shell/PublishButton.svelte','src/lib/visual/VisualPublishControl.svelte'];
const suites=['src/lib/form/RecordForm.publish.svelte.test.ts','src/lib/form/RecordForm.schedule.svelte.test.ts','src/lib/form/RecordForm.review.svelte.test.ts','src/lib/visual/VisualPublishControl.svelte.test.ts','src/lib/form/RecordBlocks.svelte.test.ts','tests/shell/icons.test.ts','src/lib/revisions/with-revisions.test.ts','src/lib/form/widgets/richtext-link.test.ts','src/lib/form/widgets/markdown-commands.test.ts'];
const steps=[['prettier-recovery',process.execPath,['node_modules/prettier/bin/prettier.cjs','--check',...changed]],['eslint-recovery',process.execPath,['node_modules/eslint/bin/eslint.js',...changed]],['check-recovery','pnpm',['--config.verifyDepsBeforeRun=warn','check']],['focal-recovery',process.execPath,['node_modules/vitest/vitest.mjs','run','--maxWorkers=2','--reporter=dot',...suites]]];
const results=[];
for (const [name,cmd,args] of steps) {
 const log=createWriteStream(`${evidence}/${name}.log`);
 const started=new Date().toISOString();
 const child=spawn(cmd,args,{cwd,env:{...process.env,PATH:`/Users/david/.nvm/versions/node/v22.22.3/bin:${process.env.PATH}`},stdio:['ignore','pipe','pipe']});
 child.stdout.pipe(log);child.stderr.pipe(log);
 const exit_code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
 await new Promise(resolve=>log.end(resolve));
 results.push({name,argv:[cmd,...args],cwd,started,finished:new Date().toISOString(),exit_code});
 writeFileSync(`${evidence}/recovery-results.json`,JSON.stringify({tree:'ed22ce2b5c13371ab02157ad9a96151d33b44533',results},null,2));
 console.log(`${name}: exit ${exit_code}`);
 if(exit_code!==0)process.exit(exit_code);
}
