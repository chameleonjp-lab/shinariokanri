import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';

/** Synthetic dedicated-endpoint responses over real local HTTP. No real Auth/RLS evidence. */
export interface ContractRequest {method():string;url():string;postDataJSON():unknown}
export interface ContractRoute {
  request():ContractRequest;
  fulfill(response:{status?:number;headers?:Record<string,string>;json?:unknown;body?:string|Uint8Array;contentType?:string}):Promise<void>;
}
export interface HttpContract {url:string;close():Promise<void>}
export async function createHttpContract(handler:(route:ContractRoute)=>Promise<void>):Promise<HttpContract>{
  let origin='';
  const server=createServer(async(request,response)=>{
    response.setHeader('Access-Control-Allow-Origin',request.headers.origin??'*');
    response.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers',request.headers['access-control-request-headers']??'authorization, apikey, content-type');
    try{
      const chunks:Buffer[]=[];let length=0;
      for await(const chunk of request){length+=chunk.length;if(length>1024*1024)throw Error('CONTRACT_INPUT_LIMIT');chunks.push(Buffer.from(chunk));}
      const body=Buffer.concat(chunks).toString('utf8');
      const contractRequest:ContractRequest={method:()=>request.method??'GET',url:()=>new URL(request.url??'/',origin).href,postDataJSON:()=>body?JSON.parse(body):null};
      await handler({request:()=>contractRequest,fulfill:async result=>{
        response.statusCode=result.status??200;
        for(const [key,value]of Object.entries(result.headers??{}))response.setHeader(key,value);
        if(result.contentType)response.setHeader('Content-Type',result.contentType);
        if(Object.hasOwn(result,'json')){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(result.json));}
        else response.end(result.body);
      }});
      if(!response.writableEnded)throw Error('CONTRACT_RESPONSE_MISSING');
    }catch{
      if(!response.writableEnded){response.statusCode=500;response.setHeader('Content-Type','application/json');response.end(JSON.stringify({code:'CONTRACT_HANDLER_FAILED'}));}
    }
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();if(!address||typeof address==='string')throw Error('CONTRACT_ADDRESS_UNKNOWN');
  origin=`http://127.0.0.1:${address.port}`;
  let closed=false;
  return {url:origin,close:async()=>{if(closed)return;closed=true;server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}

/** A per-test production origin that can actually disappear during cache checks. */
export async function createProductionApp():Promise<HttpContract>{
  const directory=resolve('dist'),info=JSON.parse(await readFile(resolve(directory,'build-info.json'),'utf8')) as {base:string};
  const server=await createHttpContract(async route=>{
    const url=new URL(route.request().url());
    if(!url.pathname.startsWith(info.base))return route.fulfill({status:404});
    const relative=decodeURIComponent(url.pathname.slice(info.base.length)),file=resolve(directory,relative||'index.html');
    if(!file.startsWith(directory+'/'))return route.fulfill({status:403});
    try{const body=await readFile(file);await route.fulfill({body,contentType:({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm'})[extname(file)]??'application/octet-stream'});}catch{return route.fulfill({status:404});}
  });
  return {...server,url:server.url+info.base};
}
