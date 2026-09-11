import json,urllib.request,urllib.error,uuid,time
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='Verify the approved preview using a fresh synthetic carrier with existing preview memberships. Run from the repository root.')
parser.add_argument('--carrier',required=True)
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
s=call('state');assert not s['assignments'],'Use a fresh carrier; do not rerun mutations'
a=call('dispatch',{'loadId':'RS-1042','driverId':'D-01','truckId':'T-101','trailerId':'V-101'})
call('respond',{'assignmentId':a['id'],'action':'accept'},uid='preview-driver-1')
b=call('dispatch',{'loadId':'RS-1043','driverId':'D-01','truckId':'T-101','trailerId':'V-101'})
call('delay',{'assignmentId':a['id'],'expectedEnd':'2026-09-13T17:30:00Z','observedAt':'2026-09-13T15:00:00Z','reason':'Synthetic dock queue threatens next pickup'},version=2)
s=call('state');load=next(x for x in s['loads'] if x['id']=='RS-1043')
p=call('propose',{'loadId':'RS-1043','driverId':'D-02','truckId':'T-102','trailerId':'V-102','reason':'Recover at-risk return load'},version=load['version'])
call('approve',{'proposalId':p['id']},uid='preview-driver-1',expected=403)
k=str(uuid.uuid4());approved=call('approve',{'proposalId':p['id']},key=k);assert call('approve',{'proposalId':p['id']},key=k)==approved
call('approve',{'proposalId':p['id']},expected=409)
accepted=call('respond',{'assignmentId':approved['assignment']['id'],'action':'accept'},uid='preview-driver-2')
assert accepted['status']=='accepted'
s=call('state',uid='preview-driver-1');v=next(x for x in s['assignments'] if x['id']==a['id']);load=next(x for x in s['loads'] if x['id']=='RS-1042')
pick=call('complete-stop',{'assignmentId':a['id'],'stopId':load['pickup']['id'],'occurredAt':'2026-09-13T12:45:00Z'},version=v['version'],uid='preview-driver-1')
event={'id':str(uuid.uuid4()),'assignmentId':a['id'],'at':'2026-09-13T14:30:00Z','position':{k:load['delivery'][k] for k in ['lat','lng']},'accuracyM':5,'speedKph':0,'odometerKm':1200,'duty':'on_duty','provenance':'synthetic'}
call('telemetry',event,uid='preview-simulator')
done=call('complete-stop',{'assignmentId':a['id'],'stopId':load['delivery']['id'],'occurredAt':'2026-09-13T16:30:30Z'},version=pick['assignment']['version'],uid='preview-driver-1');assert done['assignment']['status']=='completed'
exit_event={**event,'id':str(uuid.uuid4()),'at':'2026-09-13T16:31:00Z','position':{'lat':load['delivery']['lat']+.01,'lng':load['delivery']['lng']},'odometerKm':1201}
k=str(uuid.uuid4());out=call('telemetry',exit_event,key=k,uid='preview-simulator');assert call('telemetry',exit_event,key=k,uid='preview-simulator')==out
clock=call('simulation-clock',uid='preview-simulator');call('simulation-clock',{'at':'2026-09-13T16:31:00Z'},version=clock['version'],uid='preview-simulator')
s=call('state');closed=[x for x in s['visits'] if x['assignment_id']==a['id'] and x['departure']];assert len(closed)==1
invoices=[x for x in s['invoices'] if x['visit_id']==closed[0]['id']];assert len(invoices)==1 and invoices[0]['body']['amountCents']==167 and invoices[0]['status']=='draft'
driver=next(x for x in s['resources'] if x['id']=='D-01');assert driver['budget']['onDutyMinutes']==209,driver
call('state',other='unauthorized-functional-carrier',expected=403)
receipt={'measuredAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'carrierId':carrier,'checks':checks,'recoveryAssignment':accepted,'closedVisit':closed[0],'invoice':invoices[0],'hosEvidence':driver['hosEvidence'],'remainingBudget':driver['budget'],'limitations':['Synthetic API workflow; no browser or physical-device verification','Telemetry samples in this smoke are sparse synthetic inputs; independent road replay is separately verified locally','No financial savings or certified ELD claim']}
Path('docs/evidence/cloud-functional-2026-09-11.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'checks':len(checks),'recovery':'accepted','detentionCents':167,'hosRemaining':209}))
