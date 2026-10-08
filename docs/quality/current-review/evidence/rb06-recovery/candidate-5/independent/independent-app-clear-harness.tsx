import './independent-app-recovery-harness';
import {scenarioStore} from './src/storage/store';
const w=window as any;
const realClear=scenarioStore.clearImportDraft.bind(scenarioStore),realSave=scenarioStore.saveImportDraft.bind(scenarioStore);
let resolveClear:()=>void=()=>{};
w.controls.clearEvents=[];w.controls.clearHeld=false;w.controls.clearArmed=false;w.controls.armClear=()=>{w.controls.clearArmed=true;};w.controls.releaseClear=()=>resolveClear();
scenarioStore.clearImportDraft=async key=>{w.controls.clearEvents.push({stage:'clear-start',key});if(w.controls.clearArmed){w.controls.clearArmed=false;w.controls.clearHeld=true;await new Promise<void>(resolve=>{resolveClear=resolve;});w.controls.clearHeld=false;}await realClear(key);w.controls.clearEvents.push({stage:'clear-end',key});};
scenarioStore.saveImportDraft=async draft=>{w.controls.clearEvents.push({stage:'save-start',key:draft.key,sourceHash:draft.sourceHash});await realSave(draft);w.controls.clearEvents.push({stage:'save-end',key:draft.key,sourceHash:draft.sourceHash});};
