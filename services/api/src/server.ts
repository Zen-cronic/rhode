import {simulatorInventory,simulatorControl,simulatorPresentation} from './simulator-controls.ts';
import {hosReviewSchema} from '../../../packages/domain/src/hos-import.ts';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
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
type JudgeDemoConfig={carrier:string;uid:string;secret:string;ttlSeconds?:number};
type JudgeTokenPayload={carrier:string;uid:string;exp:number;purpose:'judge-demo'};
const encode=(value:string)=>Buffer.from(value).toString('base64url');
export function issueJudgeDemoToken(config:JudgeDemoConfig,now=Date.now()){
  demand(config.secret.length>=32,'JUDGE_DEMO_UNCONFIGURED','Judge access is unavailable.',503);
  const payload:JudgeTokenPayload={carrier:config.carrier,uid:config.uid,exp:Math.floor(now/1000)+(config.ttlSeconds??14400),purpose:'judge-demo'};
  const body=encode(JSON.stringify(payload)),signature=createHmac('sha256',config.secret).update(body).digest('base64url');
  return{token:`judge.${body}.${signature}`,expiresAt:new Date(payload.exp*1000).toISOString()};
}
export function verifyJudgeDemoToken(token:string,config:JudgeDemoConfig,carrier:string,now=Date.now()){
  demand(config.secret.length>=32,'JUDGE_DEMO_UNCONFIGURED','Judge access is unavailable.',503);
  const [prefix,body,signature,...extra]=token.split('.');
  demand(prefix==='judge'&&!!body&&!!signature&&!extra.length,'UNAUTHENTICATED','Judge session expired. Reopen the demo.',401);
  const expected=createHmac('sha256',config.secret).update(body).digest(),actual=Buffer.from(signature,'base64url');
  demand(actual.length===expected.length&&timingSafeEqual(actual,expected),'UNAUTHENTICATED','Judge session expired. Reopen the demo.',401);
  let payload:JudgeTokenPayload;
  try{payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));}catch{throw new DomainError('UNAUTHENTICATED','Judge session expired. Reopen the demo.',401);}
  demand(payload.purpose==='judge-demo'&&payload.carrier===config.carrier&&payload.uid===config.uid&&carrier===payload.carrier&&payload.exp>Math.floor(now/1000),'UNAUTHENTICATED','Judge session expired. Reopen the demo.',401);
  return payload;
}
export function createApi(store:Store,options:{localDemo?:boolean;verifyToken?:(token:string)=>Promise<string>;judgeDemo?:JudgeDemoConfig}={}){
  const app=Fastify({logger:process.env.NODE_ENV!=='test',bodyLimit:128000,trustProxy:false});
  app.register(cors,{origin:(process.env.WEB_ORIGIN??'http://localhost:5173').split(','),allowedHeaders:['Content-Type','Authorization','X-Carrier-Id','Idempotency-Key','If-Match']});
  const verifiedTokens=new Map<string,{uid:string;until:number}>();
  const auth=async(request:any):Promise<Actor>=>{
    const token=String(request.headers.authorization??'').replace(/^Bearer /,'');demand(token,'UNAUTHENTICATED','Sign in to continue.',401);
    let uid:string;
    if(options.judgeDemo&&token.startsWith('judge.'))uid=verifyJudgeDemoToken(token,options.judgeDemo,String(request.headers['x-carrier-id']??'')).uid;
    else if(options.verifyToken)uid=await options.verifyToken(token);
    else if(options.localDemo){demand(['demo-dispatcher','demo-driver-1','demo-driver-2','demo-simulator'].includes(token),'UNAUTHENTICATED','Unknown local demo identity.',401);uid=token;}
    else {try{
      const fingerprint=createHash('sha256').update(token).digest('hex'),cached=verifiedTokens.get(fingerprint);
      if(cached&&cached.until>Date.now())uid=cached.uid;
      else{if(!getApps().length)initializeApp({credential:applicationDefault()});const verified=await getAuth().verifyIdToken(token,true);uid=verified.uid;
        if(verifiedTokens.size>=1000)verifiedTokens.delete(verifiedTokens.keys().next().value!);
        // Bounded ten-second revocation-check cache; carrier membership is still read every request.
        verifiedTokens.set(fingerprint,{uid,until:Math.min(Date.now()+10000,verified.exp*1000)});
      }
    }catch{throw new DomainError('UNAUTHENTICATED','Session expired. Sign in again.',401);}}
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
  app.post('/api/judge-session',async(_req,reply)=>{
    demand(options.judgeDemo,'NOT_FOUND','Judge access is unavailable.',404);
    await store.membership(options.judgeDemo.uid,options.judgeDemo.carrier);
    const session=issueJudgeDemoToken(options.judgeDemo);
    return reply.header('Cache-Control','private, no-store').send({carrier:options.judgeDemo.carrier,uid:options.judgeDemo.uid,label:'Judge demo dispatcher',...session});
  });
  app.addContentTypeParser(['image/jpeg','image/png','application/pdf'],{parseAs:'buffer',bodyLimit:12*1024*1024},(_req,body,done)=>done(null,body));
  app.put<{Params:{id:string}}>('/api/documents/:id/content',{bodyLimit:12*1024*1024},async req=>{
    const a=await auth(req);demand(Buffer.isBuffer(req.body),'INVALID_BODY','Raw document bytes required.',400);const version=req.headers['if-match'];demand(typeof version==='string'&&/^\d+$/.test(version),'INVALID_VERSION','Expected document version required.',400);return store.uploadDocument(a,{key:String(req.headers['idempotency-key']??''),expectedVersion:Number(version)},req.params.id,req.body,String(req.headers['content-type']??'').split(';')[0],files);
  });
  app.get<{Params:{id:string}}>('/api/documents/:id/content',async(req,reply)=>{const doc=await store.getDocument(await auth(req),req.params.id,files);return reply.header('Cache-Control','private, no-store').header('X-Content-Type-Options','nosniff').header('Content-Disposition','attachment').type(doc.mediaType).send(doc.bytes);});
  app.get<{Querystring:{assignmentId:string}}>('/api/route-reviews',async req=>store.routeReviews(await auth(req),req.query.assignmentId));
  app.get<{Querystring:{loadId:string;truckId:string}}>('/api/route',async req=>store.route(await auth(req),req.query.loadId,req.query.truckId));
  app.get<{Querystring:{assignmentId:string}}>('/api/simulation-assignment',async(req,reply)=>{reply.header('Cache-Control','private, no-store');return store.simulationAssignment(await auth(req),z.string().uuid().parse(req.query.assignmentId));});
  app.get('/api/simulation-clock',async req=>store.simulationClock(await auth(req)));
  app.get('/api/health',async()=>{await store.db.query('SELECT 1');return {ok:true,database:'postgresql',auth:options.localDemo?'local-demo':'firebase'};});
  app.get<{Querystring:{driverId:string}}>('/api/hos-history',async(req,reply)=>{reply.header('Cache-Control','private, no-store');return store.hosHistory(await auth(req),z.string().min(1).max(128).parse(req.query.driverId));});
  app.post('/api/hos-preview',async(req,reply)=>{reply.header('Cache-Control','private, no-store');const actor=await auth(req),parsed=hosReviewSchema.safeParse(req.body);demand(parsed.success,'INVALID_BODY',parsed.success?'':parsed.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; '),400);return store.previewHos(actor,parsed.data);});
  app.get<{Querystring:{assignmentId?:string;sessionId?:string}}>('/api/mileage',async(req,reply)=>{reply.header('Cache-Control','private, no-store');return store.mileage(await auth(req),req.query);});
  app.get<{Querystring:{assignmentId:string;before?:string}}>('/api/tracking',async(req,reply)=>{reply.header('Cache-Control','private, no-store');return store.tracking(await auth(req),req.query.assignmentId,req.query.before);});
  app.get<{Querystring:{revisionId:string}}>('/api/simulation-route',async req=>store.simulationRoute(await auth(req),req.query.revisionId));
  app.get<{Querystring:{assignmentId:string}}>('/api/visit-review',async(req,reply)=>{reply.header('Cache-Control','private, no-store');return store.visitReview(await auth(req),z.string().uuid().parse(req.query.assignmentId));});
  app.get<{Querystring:{visitId:string}}>('/api/visit-time-review',async(req,reply)=>{reply.header('Cache-Control','private, no-store');return store.visitTimeReview(await auth(req),z.string().uuid().parse(req.query.visitId));});
  app.get('/api/simulator',async(req,reply)=>{reply.header('Cache-Control','private, no-store');return simulatorInventory(store,await auth(req));});
  app.get('/api/simulator/:runId/presentation',async(req,reply)=>{reply.header('Cache-Control','private, no-store');const {runId}=req.params as {runId:string};const q=req.query as {offset?:string;limit?:string;snapshot?:string};return simulatorPresentation(store,await auth(req),{runId,offset:q.offset,limit:q.limit,snapshot:q.snapshot});});
  app.get<{Querystring:{loadId:string;truckId:string;trailerId:string}}>('/api/axle-review',async(req,reply)=>{reply.header('Cache-Control','private, no-store');const q=z.object({loadId:z.string().min(1).max(128),truckId:z.string().min(1).max(128),trailerId:z.string().min(1).max(128)}).parse(req.query);return store.axleReview(await auth(req),q.loadId,q.truckId,q.trailerId);});
  app.get('/api/state',async req=>store.snapshot(await auth(req)));
  app.get<{Querystring:{cursor?:string}}>('/api/updates',async req=>store.updates(await auth(req),req.query.cursor??'0'));
  app.get('/api/imports',async req=>store.imports(await auth(req)));
  app.get<{Querystring:{importId:string;sheet:string;offset?:string}}>('/api/source-rows',async req=>store.sourceRows(await auth(req),req.query.importId,req.query.sheet,Number(req.query.offset??0)));
  for(const [route,schema] of Object.entries(schemas))app.post(`/api/${route}`,async(req)=>{
    const a=await auth(req);const result=schema.safeParse(req.body);demand(result.success,'INVALID_BODY',result.success?'':result.error.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; '),400);
    const raw=req.headers['if-match'];demand(typeof raw==='string'&&/^\d+$/.test(raw),'INVALID_VERSION','If-Match must contain the expected version.',400);
    const cmd:Command={key:String(req.headers['idempotency-key']??''),expectedVersion:Number(raw)},b=result.data as any;
    switch(route){case 'review-axles':return store.reviewAxles(a,cmd,b);case 'correct-visit-times':return store.correctVisitTimes(a,cmd,b);case 'simulator-control':return simulatorControl(store,a,cmd,b);case 'reconcile-visits':return store.reconcileVisits(a,cmd,b);case 'acknowledge-route':return store.acknowledgeRoute(a,cmd,b);case 'report-closure':return store.reportClosure(a,cmd,b);case 'rehearse-route':return store.rehearseRoute(a,cmd,b);case 'approve-route':return store.approveRoute(a,cmd,b);case 'review-hos':return store.reviewHos(a,cmd,b);case 'simulation-clock':return store.advanceSimulationClock(a,cmd,b);case 'approve-plan':return store.approvePlan(a,cmd,b);case 'optimize':return store.optimize(a,cmd,b);case 'review-document':return store.reviewDocument(a,cmd,b);case 'approve-invoice':return store.approveInvoice(a,cmd,b);case 'facility-note':return store.facilityNote(a,cmd,b);case 'maintenance':return store.maintenance(a,cmd,b);case 'push-token':return store.pushToken(a,cmd,b);case 'document':return store.document(a,cmd,b);case 'delay':return store.delay(a,cmd,b);case 'duty':return store.duty(a,cmd,b);case 'complete-stop':return store.completeStop(a,cmd,b);case 'dispatch':return store.dispatch(a,cmd,b);case 'recommend':return store.recommend(a,cmd,b);case 'propose':return store.propose(a,cmd,b);case 'approve':return store.approve(a,cmd,b);case 'respond':return store.respond(a,cmd,b);case 'work-session':return store.workSession(a,cmd,b);case 'telemetry':return store.ingest(a,cmd,b);case 'bind-contract':return store.bindContract(a,cmd,b);case 'detention':return store.detentionDraft(a,cmd,b);}
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
  const judgeDemo=process.env.JUDGE_DEMO_ENABLED==='true'?{carrier:String(process.env.JUDGE_DEMO_CARRIER??''),uid:String(process.env.JUDGE_DEMO_UID??'preview-dispatcher'),secret:String(process.env.JUDGE_DEMO_SECRET??'')}:undefined;
  if(judgeDemo)demand(judgeDemo.carrier&&judgeDemo.uid&&judgeDemo.secret.length>=32,'JUDGE_DEMO_UNCONFIGURED','Judge demo requires carrier, uid and a 32-character secret.',503);
  if(localDemo)await store.seed();
  const app=createApi(store,{localDemo,judgeDemo});await app.listen({port:Number(process.env.PORT??4010),host:localDemo?'127.0.0.1':'0.0.0.0'});
  const stop=async()=>{await app.close();await db.end();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
