import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {execFileSync} from 'node:child_process';
let commit='unknown',tree='unknown',dirty=true;
try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim();dirty=!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();}catch{/* Unavailable metadata is never a clean-build claim. */}
export default defineConfig({plugins:[react()],base:process.env.APP_BASE || '/shinariokanri/',define:{'import.meta.env.SCENARIO_BUILD_COMMIT':JSON.stringify(commit),'import.meta.env.SCENARIO_BUILD_TREE':JSON.stringify(tree),'import.meta.env.SCENARIO_BUILD_DIRTY':JSON.stringify(dirty)},build:{sourcemap:false}});
