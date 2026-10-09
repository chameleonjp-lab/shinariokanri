import { rolldown } from 'rolldown';
import { mkdir, writeFile,copyFile } from 'node:fs/promises';
const bundle=await rolldown({input:'src/portable/entry.ts',platform:'browser',treeshake:true});
const result=await bundle.generate({format:'iife',name:'ScenarioPortable',codeSplitting:false,minify:true});
if(result.output.length!==1||result.output[0].type!=='chunk')throw new Error('Portable engine must be one self-contained browser script');
await mkdir('src/portable/generated',{recursive:true});
await writeFile('src/portable/generated/runtime.js',result.output[0].code);
await bundle.close();
console.log(`Production portable runtime generated: ${result.output[0].code.length} characters`);

// The receiver is a separate game application with its own action handler and reception log.
const game=await rolldown({input:'src/portable/gameReceiver.ts',platform:'browser',treeshake:true});
const output=await game.generate({format:'iife',name:'IndependentGameReceiver',codeSplitting:false,minify:true});
if(output.output.length!==1||output.output[0].type!=='chunk')throw Error('Receiver must be self-contained');
await mkdir('examples/browser-game/generated',{recursive:true});
await writeFile('examples/browser-game/generated/game.js',output.output[0].code);
await game.close();
await mkdir('public/examples/browser-game',{recursive:true});
await copyFile('examples/browser-game/index.html','public/examples/browser-game/index.html');
await copyFile('examples/browser-game/generated/game.js','public/examples/browser-game/game.js');
await copyFile('examples/browser-game/generated/game.js','examples/browser-game/game.js');
