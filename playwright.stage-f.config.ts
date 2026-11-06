import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testMatch:'stage-f-selective-edits.spec.ts',use:{...base.use,baseURL:'http://127.0.0.1:4184/shinariokanri/'},webServer:{command:'npm run preview -- --port 4184',url:'http://127.0.0.1:4184/shinariokanri/',reuseExistingServer:false}});
