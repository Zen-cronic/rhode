import Fastify from 'fastify';
import cors from '@fastify/cors';
import {getAuth} from 'firebase-admin/auth';
import {getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {DomainError,demand} from '../../../packages/domain/src/index.ts';
import {Store} from './store.ts';
import type {Actor,Command} from './store.ts';
import {pool,migrate} from './db.ts';
import {z} from 'zod';
const id=z.string().min(1).max(128),uuid=z.string().uuid();
const assignmentInput=z.object({loadId:id,driverId:id,truckId:id,trailerId:id});
const schemas={
  dispatch:assignmentInput,
  propose:assignmentInput.extend({reason:z.string().max(2000).optional()}),
  approve:z.object({proposalId:uuid}),
  respond:z.object({assignmentId:uuid,action:z.enum(['accept','reject'])}),
  'work-session':z.discriminatedUnion('action',[z.object({action:z.literal('start')}),z.object({action:z.literal('end'),sessionId:uuid})]),
  telemetry:z.object({id,assignmentId:uuid,sessionId:uuid.optional(),at:z.string(),position:z.object({lat:z.number(),lng:z.number()}),accuracyM:z.number().nonnegative(),speedKph:z.number(),odometerKm:z.number(),duty:z.enum(['off_duty','on_duty','driving','sleeper']),provenance:z.enum(['synthetic','live','imported-historical'])}),
  detention:z.object({visitId:uuid,contractId:id})
};
export function createApi(store:Store,options:{localDemo?:boolean;verifyToken?:(token:string)=>Promise<string>}={}){
  const app=Fastify({logger:process.env.NODE_ENV!=='test',bodyLimit:128000,trustProxy:false});
  app.register(cors,{origin:(process.env.WEB_ORIGIN??'http://localhost:5173').split(','),allowedHeaders:['Content-Type','Authorization','X-Carrier-Id','Idempotency-Key','If-Match']});
  const auth=async(request:any):Promise<Actor>=>{
    const token=String(request.headers.authorization??'').replace(/^Bearer /,'');demand(token,'UNAUTHENTICATED','Sign in to continue.',401);
    let uid:string;
    if(options.verifyToken)uid=await options.verifyToken(token);
    else if(options.localDemo){demand(['demo-dispatcher','demo-driver-1','demo-driver-2','demo-simulator'].includes(token),'UNAUTHENTICATED','Unknown local demo identity.',401);uid=token;}
    else {try{if(!getApps().length)initializeApp({credential:applicationDefault()});uid=(await getAuth().verifyIdToken(token,true)).uid;}catch{throw new DomainError('UNAUTHENTICATED','Session expired. Sign in again.',401);}}
    return store.membership(uid,String(request.headers['x-carrier-id']??''));
  };
  app.get('/api/health',async()=>{await store.db.query('SELECT 1');return {ok:true,database:'postgresql',auth:options.localDemo?'local-demo':'firebase'};});
  app.get('/api/state',async req=>store.snapshot(await auth(req)));
  app.get<{Querystring:{cursor?:string}}>('/api/updates',async req=>store.updates(await auth(req),req.query.cursor??'0'));
  for(const [route,schema] of Object.entries(schemas))app.post(`/api/${route}`,async(req)=>{
    const a=await auth(req);const result=schema.safeParse(req.body);demand(result.success,'INVALID_BODY',result.success?'':result.error.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; '),400);
    const raw=req.headers['if-match'];demand(typeof raw==='string'&&/^\d+$/.test(raw),'INVALID_VERSION','If-Match must contain the expected version.',400);
    const cmd:Command={key:String(req.headers['idempotency-key']??''),expectedVersion:Number(raw)},b=result.data as any;
    switch(route){case 'dispatch':return store.dispatch(a,cmd,b);case 'propose':return store.propose(a,cmd,b);case 'approve':return store.approve(a,cmd,b);case 'respond':return store.respond(a,cmd,b);case 'work-session':return store.workSession(a,cmd,b);case 'telemetry':return store.ingest(a,cmd,b);case 'detention':return store.detentionDraft(a,cmd,b);}
  });
  app.setErrorHandler((e,req,reply)=>{
    if(e instanceof DomainError)return reply.code(e.status).send({error:{code:e.code,message:e.message,requestId:req.id}});
    if(e instanceof Error&&'statusCode' in e&&typeof e.statusCode==='number'&&e.statusCode<500)return reply.code(e.statusCode).send({error:{code:'INVALID_REQUEST',message:e.message,requestId:req.id}});
    req.log.error(e);return reply.code(500).send({error:{code:'INTERNAL',message:'Request failed. Retry with the same command key.',requestId:req.id}});
  });return app;
}
if(import.meta.main){
  const db=pool();if(process.env.AUTO_MIGRATE==='true')await migrate(db);
  const store=new Store(db),localDemo=process.env.AUTH_MODE==='local-demo';
  demand(!localDemo||!process.env.K_SERVICE,'UNSAFE_CONFIG','Local demo identities cannot run on Cloud Run.');
  if(localDemo)await store.seed();
  const app=createApi(store,{localDemo});await app.listen({port:Number(process.env.PORT??4010),host:localDemo?'127.0.0.1':'0.0.0.0'});
  const stop=async()=>{await app.close();await db.end();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
