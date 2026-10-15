import {test} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFile as filesystemReadFile} from 'node:fs/promises';
import {basename} from 'node:path';

const sequences=new WeakMap<object,number>();

/** Retain exact filesystem bytes before the browser test inspects or mutates
 * them. Reads include fixtures and real downloads; names alone do not claim an
 * output purpose or acceptance result. Preserve the filesystem API's encoding,
 * options, FileHandle position and Buffer/string return contracts. */
export const readFile=(async(...args:Parameters<typeof filesystemReadFile>)=>{
 const [path,options]=args,encoding=typeof options==='string'?options:options?.encoding;
 if(encoding&&!Buffer.isEncoding(encoding))return filesystemReadFile(...args);
 const bytes=await filesystemReadFile(path,typeof options==='object'&&options?{...options,encoding:null}:undefined);
 let info:ReturnType<typeof test.info>|undefined;
 try{info=test.info();}catch{/* Module/worker setup reads have no running test. */}
 if(info){
  const sequence=(sequences.get(info)??0)+1;sequences.set(info,sequence);
  const name=typeof path==='string'?basename(path):'input',attachment=`filesystem-read-${String(sequence).padStart(3,'0')}-${name.replace(/[^\p{L}\p{N}._-]/gu,'_')}`;
  await info.attach(attachment,{body:bytes,contentType:'application/octet-stream'});
  await info.attach(attachment+'.json',{body:Buffer.from(JSON.stringify({scope:'Actual test filesystem read; fixture or download, no acceptance promotion',filename:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')},null,2)),contentType:'application/json'});
 }
 return encoding?bytes.toString(encoding):bytes;
}) as typeof filesystemReadFile;
