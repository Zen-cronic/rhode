import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewedFacilityNotes,type FacilityNote} from '../src/facilities.ts';
test('arrival instructions stay on the exact load and stop and require an actual review',()=>{
 const reviewed:FacilityNote={load_id:'load-a',stop_id:'pickup-a',instructions:'Use gate 2 and check in at the marked office.',reviewed_by:'dispatcher-a',document_id:'source-a'};
 const notes=[reviewed,{...reviewed,load_id:'load-b'},{...reviewed,stop_id:'delivery-a'},{...reviewed,reviewed_by:null},{...reviewed,reviewed_by:' '},{...reviewed,instructions:''}];
 assert.deepEqual(reviewedFacilityNotes(notes,'load-a','pickup-a'),[reviewed]);
 assert.equal(reviewedFacilityNotes(notes,'missing','pickup-a').length,0);
 assert.equal(reviewedFacilityNotes([reviewed],'load-a','delivery-a').length,0);
 assert.equal(reviewedFacilityNotes([reviewed],'load-a','pickup-a')[0].document_id,'source-a');
});
