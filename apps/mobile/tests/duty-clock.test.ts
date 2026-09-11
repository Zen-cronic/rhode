import {test} from 'node:test';import assert from 'node:assert/strict';
import {dutyOccurrenceAt} from '../src/duty-clock.ts';
test('synthetic duty uses scenario occurrence time while live duty uses actual device time',()=>{
 const scenario=[{id:'recovery',clock:'2026-09-13T12:00:00Z'}],wall='2026-09-11T18:00:00Z';assert.equal(dutyOccurrenceAt('synthetic',scenario,wall),scenario[0].clock);assert.equal(dutyOccurrenceAt('live',scenario,wall),wall);
});
test('missing scenario clocks and historical or unknown driver profiles never invent an occurrence',()=>{
 for(const source of ['synthetic','imported-historical',undefined])assert.throws(()=>dutyOccurrenceAt(source,[],'2026-09-11T18:00:00Z'));assert.throws(()=>dutyOccurrenceAt('synthetic',[{id:'recovery',clock:'invalid'}]));
});

test('driver-scoped snapshots use the evaluated scenario HOS timestamp when scenario records are withheld',()=>{assert.equal(dutyOccurrenceAt('synthetic',[],undefined,'2026-09-13T12:00:00.000Z'),'2026-09-13T12:00:00.000Z');});
