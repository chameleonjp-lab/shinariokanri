// Deployment is a manual action against a dedicated project. Never put this key in Vite env.
import {createSyncEdgeHandler} from './core.js';
Deno.serve(createSyncEdgeHandler({
 url:Deno.env.get('SUPABASE_URL'),publishableKey:Deno.env.get('SUPABASE_ANON_KEY'),
 serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
 allowedOrigins:(Deno.env.get('SCENARIO_ALLOWED_ORIGINS')??'').split(',').filter(Boolean),
}));
