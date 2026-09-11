import test from 'node:test';
import assert from 'node:assert/strict';
import {appliedTrails,mergeSamples,sampleNumber,trackingDistance} from '../src/tracking-model.ts';
const point=(id,disposition='applied',position={lat:43.5,lng:-79.8})=>({id,at:`2026-09-13T12:00:0${id}Z`,position,disposition,accuracyM:5,odometerKm:null,provenance:"synthetic"});
test('breadcrumb segments contain only recorded applied coordinates and break at excluded samples',()=>{
  const points=[point('1'),point('2'),point('3','uncertain'),point('4'),point('5','retained_out_of_order'),point('6'),point('7','applied',{lat:91,lng:-79.8}),point('8')];
  assert.deepEqual(appliedTrails(points).map(trail=>trail.map(p=>p.id)),[['1','2'],['4'],['6'],['8']]);
  assert.equal(appliedTrails(points)[0][0],points[0]);
  assert.deepEqual(appliedTrails([point('1','uncertain')]),[]);
});
test('paged samples deduplicate recorded IDs and retain chronological trail order',()=>{
  const older=point('1'),shared=point('2'),newer=point('3');
  assert.deepEqual(mergeSamples([{points:[shared,newer]},{points:[older,shared]}]),[older,shared,newer]);
});
test('missing measurements remain unknown and zero is not treated as missing',()=>{
  for(const value of [null,undefined,NaN,Infinity])assert.equal(sampleNumber(value,'km/h'),'Unknown');
  assert.equal(sampleNumber(0,'km/h'),'0 km/h');
  assert.equal(sampleNumber(12345.67,'km'),'12,345.67 km');
});

test('missing intervals, equal time, provenance changes and impossible jumps never draw a bridge',()=>{
 const a=point('1'),b={...point('2'),at:'2026-09-13T12:03:00Z'},c={...point('3'),at:b.at},d={...point('4'),at:'2026-09-13T12:03:01Z',provenance:'live'},e={...point('5'),at:'2026-09-13T12:03:02Z',provenance:'live',position:{lat:44.5,lng:-79.8}};
 assert.deepEqual(appliedTrails([a,b,c,d,e]).map(t=>t.length),[1,1,1,1,1]);
 for(const accuracyM of [null,NaN,101,-1])assert.equal(appliedTrails([{...a,accuracyM}]).length,0);
 assert.equal(appliedTrails([{...a,at:'invalid'}]).length,0);
});
test('distance excludes gaps, resets and missing odometers and does not sum stationary GPS jitter',()=>{
 const a={...point('1'),at:'2026-09-13T12:00:00Z',odometerKm:100};
 const b={...point('2'),at:'2026-09-13T12:01:00Z',odometerKm:101,position:{lat:43.509,lng:-79.8}};
 const c={...b,id:'c',at:'2026-09-13T12:02:00Z',odometerKm:0};
 const d={...c,id:'d',at:'2026-09-13T12:03:00Z',odometerKm:null};
 const e={...d,id:'e',at:'2026-09-13T12:10:00Z',odometerKm:120};
 const result=trackingDistance([a,b,c,d,e]);assert.equal(result.odometerKm,1);assert.equal(result.odometerIntervals,1);assert.equal(result.missingOdometerIntervals,2);assert.equal(result.segments,2);assert.ok(result.gpsChordKm>.9&&result.gpsChordKm<1.1);assert.equal(result.gpsIntervals,1);
 assert.equal(trackingDistance([point('1'),point('2')]).odometerKm,null);assert.equal(trackingDistance([point('1'),point('2')]).gpsChordKm,0);
 assert.equal(trackingDistance([a,{...b,odometerKm:200}]).odometerKm,null);
});

test('isolated samples cannot imply zero GPS distance',()=>{assert.equal(trackingDistance([point('1')]).gpsChordKm,null);assert.equal(trackingDistance([]).gpsChordKm,null);assert.equal(trackingDistance([point('1'),{...point('2'),at:'2026-09-13T13:00:00Z'}]).gpsChordKm,null);});
