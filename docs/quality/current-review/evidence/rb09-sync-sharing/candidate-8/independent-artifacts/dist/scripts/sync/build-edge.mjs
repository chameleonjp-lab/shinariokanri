import {rolldown} from 'rolldown';
import {writeFile} from 'node:fs/promises';
const bundle=await rolldown({input:'src/sync/edgeEntry.ts',platform:'browser',treeshake:true});
try{
 const output=await bundle.generate({format:'esm',codeSplitting:false,minify:false});
 if(output.output.length!==1||output.output[0].type!=='chunk')throw Error('Edge core must be self-contained');
 await writeFile('supabase/functions/scenario-sync/core.js',output.output[0].code);
 console.log(JSON.stringify({artifact:'supabase/functions/scenario-sync/core.js',bytes:new TextEncoder().encode(output.output[0].code).length}));
}finally{await bundle.close();}
