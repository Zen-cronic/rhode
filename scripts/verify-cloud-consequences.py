import json,urllib.request,urllib.error,uuid,time
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='Verify the approved preview using a fresh synthetic carrier with existing preview memberships. Run from the repository root.')
parser.add_argument('--carrier',required=True,help='Fresh consequence scenario with D-02 staged in London')
parser.add_argument('--remaining-carrier',required=True,help='Fresh scenario with D-01 initial driving budget 275 minutes')
parser.add_argument('--api-url',default='https://roadstar-api-739889188415.us-central1.run.app')
args=parser.parse_args();base=args.api_url.rstrip('/');carrier=args.carrier
config=dict(line.strip().split('=',1) for line in Path('apps/web/.env.production').read_text().splitlines() if line.startswith('VITE_'))
key=config['VITE_FIREBASE_API_KEY']; tokens={}
def request(url,body=None,headers={}):
    req=urllib.request.Request(url,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json',**headers})
    try:
        with urllib.request.urlopen(req,timeout=90) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
for x in json.loads(Path('data/preview-credentials.json').read_text()):
    status,out=request('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+key,{'email':x['email'],'password':x['password'],'returnSecureToken':True})
    assert status==200,'Firebase login failed';tokens[x['uid']]=out['idToken']
checks=[]
def call(path,body=None,version=1,uid='preview-dispatcher',key=None,expected=200,other=None):
    code,out=request(base+'/api/'+path,body,{'Authorization':'Bearer '+tokens[uid],'X-Carrier-Id':other or carrier,'If-Match':str(version),'Idempotency-Key':key or str(uuid.uuid4())})
    assert code==expected,(path,code,out)
    checks.append({'path':path,'status':code,'role':uid.replace('preview-','')});return out
# Run with the RoadStar Poetry environment; the standalone simulator imports no DB.
import asyncio,importlib.util,os,sys
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'services/optimizer'))
spec=importlib.util.spec_from_file_location('roadstar_cloud_simulator',root/'services/simulator/app.py')
sim=importlib.util.module_from_spec(spec);sys.modules[spec.name]=sim;spec.loader.exec_module(sim)
os.environ['SIMULATOR_TOKEN']=tokens['preview-simulator'];os.environ['ROADSTAR_API']=base
s=call('state');assert not s['assignments'],'Fresh consequence carrier required'
load=next(x for x in s['loads'] if x['id']=='RS-1042')
a=call('dispatch',{'loadId':'RS-1042','driverId':'D-01','truckId':'T-101','trailerId':'V-101'})
call('respond',{'assignmentId':a['id'],'action':'accept'},uid='preview-driver-1')
b=call('dispatch',{'loadId':'RS-1043','driverId':'D-01','truckId':'T-101','trailerId':'V-101'})
call('simulation-assignment?assignmentId='+a['id'],uid='preview-driver-1',expected=403)
context=call('simulation-assignment?assignmentId='+a['id'],uid='preview-simulator');assert context['version']==2
before=call('state')
async def replay():
    run=await sim.create(sim.Start(assignment_id=a['id'],carrier_id=carrier,start_time=a['startAt'],dock_wait_seconds=18000,route={'locations':[{'lat':load[p]['lat'],'lon':load[p]['lng']} for p in ['pickup','delivery']],'truck':{'height':4.1,'width':2.6,'length':23,'weight':40,'axle_load':9,'hazmat':False,'evidence':'synthetic-scenario'}}))
    await sim.resume(run['id']);await sim.advance(run['id'],sim.Advance(seconds=2))
    state=await sim.state(run['id']);assert len(state['delay_reports'])==1
    await sim.reset(run['id']);await sim.resume(run['id']);await sim.advance(run['id'],sim.Advance(seconds=2));await sim.pause(run['id'])
    return run,state
run,simulated=asyncio.run(replay())
s=call('state');assert len(s['disruptions'])==1 and not s['proposals']
for prior in before['assignments']:
    current=next(x for x in s['assignments'] if x['id']==prior['id'])
    assert all(current[k]==prior[k] for k in ['status','driverId','truckId','trailerId','startAt','endAt'])
report=simulated['delay_reports'][0];assert any(x['id']==b['id'] for x in report['result']['impactedLoads'])
load_version=next(x['version'] for x in s['loads'] if x['id']=='RS-1043')
p=call('propose',{'loadId':'RS-1043','driverId':'D-02','truckId':'T-102','trailerId':'V-102','reason':'Recover simulator-reported dock hold'},version=load_version)
call('approve',{'proposalId':p['id']},uid='preview-simulator',expected=403)
key=str(uuid.uuid4());approved=call('approve',{'proposalId':p['id']},key=key);assert call('approve',{'proposalId':p['id']},key=key)==approved
accepted=call('respond',{'assignmentId':approved['assignment']['id'],'action':'accept'},uid='preview-driver-2');assert accepted['status']=='accepted'
consequence={'carrier':carrier,'runId':run['id'],'conditionsHash':run['conditions_hash'],'routePoints':len(simulated['initial_conditions']['coordinates']),'configuredDockWaitSeconds':18000,'delay':report,'comparison':p['body']['comparison'],'acceptedAssignment':accepted['id'],'disruptionsAfterReset':len(s['disruptions']),'automaticAssignmentMutation':False}
carrier=args.remaining_carrier
s=call('state');assert not s['assignments'],'Fresh remaining-work carrier required'
a=call('dispatch',{'loadId':'RS-1042','driverId':'D-01','truckId':'T-101','trailerId':'V-101'})
call('respond',{'assignmentId':a['id'],'action':'accept'},uid='preview-driver-1')
call('complete-stop',{'assignmentId':a['id'],'stopId':'milton-yard','occurredAt':'2026-09-13T12:45:00Z'},version=2,uid='preview-driver-1')
call('duty',{'at':'2026-09-13T12:30:00Z','duty':'driving'},uid='preview-driver-1')
clock=call('simulation-clock',uid='preview-simulator');call('simulation-clock',{'at':'2026-09-13T15:00:00Z'},version=clock['version'],uid='preview-simulator')
missing=call('propose',{'loadId':'RS-1043','driverId':'D-01','truckId':'T-101','trailerId':'V-101'},expected=409)
call('telemetry',{'id':str(uuid.uuid4()),'assignmentId':a['id'],'at':'2026-09-13T15:00:00Z','position':{'lat':42.988,'lng':-81.175},'accuracyM':5,'speedKph':0,'odometerKm':150,'duty':'on_duty','provenance':'synthetic'},uid='preview-simulator')
p=call('propose',{'loadId':'RS-1043','driverId':'D-01','truckId':'T-101','trailerId':'V-101','reason':'Remaining route from confirmed pickup and current GPS'})
assert p['body']['proof']['eligible'] and 'remaining truck route from current GPS' in p['body']['proof']['note']
approved=call('approve',{'proposalId':p['id']});accepted=call('respond',{'assignmentId':approved['assignment']['id'],'action':'accept'},uid='preview-driver-1');assert accepted['status']=='accepted'
retained=next(r for r in call('state',uid='preview-driver-1')['resources'] if r['id']=='D-01');assert retained['budget']['drivingMinutes']==125
receipt={'verifiedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'apiUrl':base,'consequence':consequence,'remainingWork':{'carrier':carrier,'initialDrivingBudgetMinutes':275,'recordedDrivingMinutes':150,'retainedDrivingBudgetMinutes':retained['budget']['drivingMinutes'],'hosEvidence':retained['hosEvidence'],'missingProgressResponse':missing,'proof':p['body']['proof'],'acceptedAssignment':accepted['id']},'checks':checks,'scope':'Firebase-authenticated approved cloud preview. Separate local simulator process uses actual Valhalla route and sends observations/clock/delay via HTTP. Synthetic known dwell/seeded speed forecast, not measured traffic or savings. Full service retained conservatively. Physical devices deferred.'}
Path('docs/evidence/cloud-consequences-2026-09-11.json').write_text(json.dumps(receipt,indent=2)+'\n')
print('Cloud simulator consequence, recovery acceptance and remaining-work checks passed:',len(checks))
