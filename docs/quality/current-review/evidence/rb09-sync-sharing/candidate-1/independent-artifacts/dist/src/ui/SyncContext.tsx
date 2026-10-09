import {createContext,useContext} from 'react';
import type {DedicatedSupabaseClient} from '../sync/supabaseClient';
export const SyncClientContext=createContext<DedicatedSupabaseClient|null>(null);
export function useSyncClient(){return useContext(SyncClientContext);}
