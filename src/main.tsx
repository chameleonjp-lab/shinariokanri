import React from 'react';
import {recordDiagnostic} from './diagnostics';
import {WorkspaceErrorBoundary} from './ui/DiagnosticPanel';
import { createRoot } from 'react-dom/client';
import {AccountWorkspace} from './ui/AccountWorkspace';
import './styles.css';
createRoot(document.getElementById('root')!,{onCaughtError:()=>{/* The boundary records sanitized metadata; React's default stack logger is disabled. */},onRecoverableError:error=>recordDiagnostic(error,{code:'UI_RENDER_FAILED'})}).render(<React.StrictMode><WorkspaceErrorBoundary><AccountWorkspace /></WorkspaceErrorBoundary></React.StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {window.addEventListener('load',()=> {navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {scope: import.meta.env.BASE_URL}).catch(()=>{/* Local editing remains available; no offline claim on failed installation. */});});}

window.addEventListener('error',event=>{event.preventDefault();recordDiagnostic(event.error,{code:'UI_RENDER_FAILED'});});
window.addEventListener('unhandledrejection',event=>{event.preventDefault();recordDiagnostic(event.reason);});
