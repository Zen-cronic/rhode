import {schemas} from '../../../packages/domain/src/commands.ts';
import {OAuth2Client} from 'google-auth-library';
import {claimDocumentJob,finishDocumentJob,drainOutbox,drainNotifications} from './jobs.ts';
import {Files} from './files.ts';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import {getAuth} from 'firebase-admin/auth';
import {getApps,initializeApp,applicationDefault} from 'firebase-admin/app';
import {DomainError,demand} from '../../../packages/domain/src/index.ts';
import {Store} from './store.ts';
import type {Actor,Command} from './store.ts';
import {pool,migrate} from './db.ts';
import {z} from 'zod';
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
  const internal=async(req:any)=>{
    const token=String(req.headers.authorization??'').replace(/^Bearer /,'');
    if(!process.env.K_SERVICE&&process.env.INTERNAL_DEV_TOKEN&&token===process.env.INTERNAL_DEV_TOKEN)return;
    demand(process.env.INTERNAL_AUDIENCE&&process.env.INTERNAL_SERVICE_ACCOUNTS,'INTERNAL_UNCONFIGURED','Internal service authentication is not configured.',503);
    try{const ticket=await new OAuth2Client().verifyIdToken({idToken:token,audience:process.env.INTERNAL_AUDIENCE});const payload=ticket.getPayload();demand(payload?.email_verified&&process.env.INTERNAL_SERVICE_ACCOUNTS.split(',').includes(payload.email??''),'FORBIDDEN','Authorized worker identity required.',403);}catch{throw new DomainError('FORBIDDEN','Authorized worker identity required.',403);}
  };
  const jobRef=z.object({carrierId:z.string().min(1),jobId:z.string().uuid()});
  app.post('/internal/jobs/claim',async req=>{await internal(req);const b=jobRef.parse(req.body);return claimDocumentJob(store.db,b.carrierId,b.jobId);});
  app.post('/internal/jobs/result',async req=>{await internal(req);const b=jobRef.extend({attempt:z.number().int().min(1),model:z.string(),fields:z.object({billNumber:z.string().nullable(),signedBy:z.string().nullable(),observedDate:z.string().nullable(),notes:z.string().nullable()}).strict(),usage:z.unknown().optional(),error:z.string().max(2000).optional()}).parse(req.body);return finishDocumentJob(store.db,b);});
  app.post('/internal/drain',async req=>{await internal(req);return {jobs:process.env.TASKS_QUEUE?await drainOutbox(store.db):{status:'unconfigured'},notifications:process.env.PUSH_ENABLED==='true'?await drainNotifications(store.db):{status:'disabled'}};});

  const files=new Files();
  app.addContentTypeParser(['image/jpeg','image/png','application/pdf'],{parseAs:'buffer',bodyLimit:12*1024*1024},(_req,body,done)=>done(null,body));
  app.put<{Params:{id:string}}>('/api/documents/:id/content',{bodyLimit:12*1024*1024},async req=>{
    const a=await auth(req);demand(Buffer.isBuffer(req.body),'INVALID_BODY','Raw document bytes required.',400);const version=req.headers['if-match'];demand(typeof version==='string'&&/^\d+$/.test(version),'INVALID_VERSION','Expected document version required.',400);return store.uploadDocument(a,{key:String(req.headers['idempotency-key']??''),expectedVersion:Number(version)},req.params.id,req.body,String(req.headers['content-type']??'').split(';')[0],files);
  });
  app.get<{Params:{id:string}}>('/api/documents/:id/content',async(req,reply)=>{const doc=await store.getDocument(await auth(req),req.params.id,files);return reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition','attachment').type(doc.mediaType).send(doc.bytes);});
  app.get<{Querystring:{loadId:string;truckId:string}}>('/api/route',async req=>store.route(await auth(req),req.query.loadId,req.query.truckId));
  app.get('/api/health',async()=>{await store.db.query('SELECT 1');return {ok:true,database:'postgresql',auth:options.localDemo?'local-demo':'firebase'};});
  app.get('/api/state',async req=>store.snapshot(await auth(req)));
  app.get<{Querystring:{cursor?:string}}>('/api/updates',async req=>store.updates(await auth(req),req.query.cursor??'0'));
  app.get('/api/imports',async req=>store.imports(await auth(req)));
  app.get<{Querystring:{importId:string;sheet:string;offset?:string}}>('/api/source-rows',async req=>store.sourceRows(await auth(req),req.query.importId,req.query.sheet,Number(req.query.offset??0)));
  for(const [route,schema] of Object.entries(schemas))app.post(`/api/${route}`,async(req)=>{
    const a=await auth(req);const result=schema.safeParse(req.body);demand(result.success,'INVALID_BODY',result.success?'':result.error.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; '),400);
    const raw=req.headers['if-match'];demand(typeof raw==='string'&&/^\d+$/.test(raw),'INVALID_VERSION','If-Match must contain the expected version.',400);
    const cmd:Command={key:String(req.headers['idempotency-key']??''),expectedVersion:Number(raw)},b=result.data as any;
    switch(route){case 'push-token':return store.pushToken(a,cmd,b);case 'document':return store.document(a,cmd,b);case 'delay':return store.delay(a,cmd,b);case 'duty':return store.duty(a,cmd,b);case 'complete-stop':return store.completeStop(a,cmd,b);case 'dispatch':return store.dispatch(a,cmd,b);case 'propose':return store.propose(a,cmd,b);case 'approve':return store.approve(a,cmd,b);case 'respond':return store.respond(a,cmd,b);case 'work-session':return store.workSession(a,cmd,b);case 'telemetry':return store.ingest(a,cmd,b);case 'detention':return store.detentionDraft(a,cmd,b);}
  });
  app.setErrorHandler((e,req,reply)=>{
    if(e instanceof z.ZodError)return reply.code(400).send({error:{code:'INVALID_BODY',message:'Invalid internal job payload.',requestId:req.id}});
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
