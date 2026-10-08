import React from 'react';
import { createRoot } from 'react-dom/client';
import {AccountWorkspace} from './ui/AccountWorkspace';
import './styles.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><AccountWorkspace /></React.StrictMode>);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {window.addEventListener('load',()=> {navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {scope: import.meta.env.BASE_URL}).catch(()=>{/* Local editing remains available; no offline claim on failed installation. */});});}
