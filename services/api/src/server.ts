import {createServer} from 'node:http';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DomainError,demand} from '../../../packages/domain/src/index.ts';
import type {Telemetry} from '../../../packages/domain/src/index.ts';
import {Store} from './store.ts';

export function createApi(store: Store) {
  return createServer(async(req,res)=>{
    const requestId=crypto.randomUUID();
    res.setHeader('X-Request-Id',requestId); res.setHeader('Content-Type','application/json');
    res.setHeader('Cache-Control','no-store');
    const send=(status:number,data:unknown)=>{res.writeHead(status);res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url??'/','http://localhost');
      const path=url.pathname;
      if(req.method==='GET'&&path==='/api/health') return send(200,{ok:true,mode:'deterministic-demo',clock:store.now()});
      if(req.method==='GET'&&path==='/api/state') return send(200,store.snapshot());
      if(req.method==='GET'&&path==='/api/matches') return send(200,store.matches(url.searchParams.get('loadId')??''));
      demand(req.method==='POST','NOT_FOUND','Endpoint not found.',404);
      // Local foundation API; do not expose publicly before scoped auth is implemented.
      let raw='';
      for await(const chunk of req) {raw+=chunk.toString();demand(Buffer.byteLength(raw)<=128_000,'BODY_TOO_LARGE','Request exceeds 128KB.',413);}
      let body: Record<string,unknown>;
      try {body=JSON.parse(raw);} catch {throw new DomainError('INVALID_JSON','Request body must be JSON.',400);}
      demand(body&&typeof body==='object'&&!Array.isArray(body),'INVALID_BODY','JSON object required.',400);
      const str=(key:string)=>{demand(typeof body[key]==='string','INVALID_BODY',`${key} must be a string.`,400);return body[key] as string;};
      const version=()=>{demand(Number.isInteger(body.expectedVersion),'INVALID_BODY','expectedVersion must be an integer.',400);return body.expectedVersion as number;};
      if(path==='/api/dispatch') return send(201,store.dispatch({loadId:str('loadId'),driverId:str('driverId'),truckId:str('truckId'),trailerId:str('trailerId'),expectedVersion:version()}));
      if(path==='/api/respond') {
        const action=str('action');demand(action==='accept'||action==='reject','INVALID_ACTION','Choose accept or reject.',400);
        return send(200,store.respond(str('assignmentId'),str('driverId'),version(),action));
      }
      if(path==='/api/telemetry') return send(200,store.ingest(body as unknown as Telemetry));
      if(path==='/api/detention') {
        demand(body.rateCentsPerHour===null||typeof body.rateCentsPerHour==='number','INVALID_RATE','Provide an explicit rate or null.',400);
        return send(200,store.detentionDraft(str('visitId'),body.rateCentsPerHour));
      }
      return send(404,{error:{code:'NOT_FOUND',message:'Endpoint not found.',requestId}});
    } catch(error) {
      if(error instanceof DomainError) return send(error.status,{error:{code:error.code,message:error.message,requestId}});
      console.error(JSON.stringify({level:'error',requestId,error:error instanceof Error?error.message:'unknown'}));
      return send(500,{error:{code:'INTERNAL',message:'Request failed. Retry or inspect the local service logs.',requestId}});
    }
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const path=process.env.ROADSTAR_DB??'data/roadstar.sqlite'; mkdirSync(dirname(path),{recursive:true});
  const store=new Store(path), server=createApi(store);
  const port=Number(process.env.PORT??4010);
  server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({service:'roadstar-api',url:`http://127.0.0.1:${port}`,mode:'local-demo'})));
  const stop=()=>server.close(()=>{store.close();process.exit(0);});
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
