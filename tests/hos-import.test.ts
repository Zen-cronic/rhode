import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDutyCsv} from '../packages/domain/src/hos-import.ts';
test('duty CSV preserves quoted timestamps, row lineage and explicit duty values',()=>{
 const csv='\uFEFFstart,end,duty\r\n"2026-09-11T08:00:00-04:00","2026-09-11T09:00:00-04:00","on_duty"\r\n';const [r]=parseDutyCsv(csv,'driver-ledger.csv');assert.equal(r.start,'2026-09-11T08:00:00-04:00');assert.equal(r.source,'driver-ledger.csv:row-2');assert.equal(r.duty,'on_duty');
});
test('ambiguous dates, malformed quoting, extra columns and invalid duties are rejected',()=>{
 for(const row of ['9/11/26,9/12/26,driving','"2026-09-11T08:00:00Z,2026-09-11T09:00:00Z,driving','2026-09-11T08:00:00Z,2026-09-11T09:00:00Z,driving,extra','2026-09-11T08:00:00Z,2026-09-11T09:00:00Z,parked'])assert.throws(()=>parseDutyCsv('start,end,duty\n'+row,'input.csv'),{code:'INVALID_HISTORY'});
});
