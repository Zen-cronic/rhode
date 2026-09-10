import test from 'node:test';
import assert from 'node:assert/strict';
import {currentAssignment} from '../src/trips.ts';
test('acceptance and reordered synchronization keep selected active trip; replaced trips cannot remain actionable',()=>{
 const a={loadId:'one',status:'offered'},b={loadId:'two',status:'offered'};
 assert.equal(currentAssignment([a,b],null)?.loadId,'one');
 assert.equal(currentAssignment([b,{...a,status:'accepted'}],'one')?.loadId,'one');
 assert.equal(currentAssignment([b,{...a,status:'accepted'}],null)?.loadId,'one');
 assert.equal(currentAssignment([b,{...a,status:'superseded'}],'one')?.loadId,'two');
 assert.equal(currentAssignment([{...a,status:'completed'}],'one'),undefined);
});
