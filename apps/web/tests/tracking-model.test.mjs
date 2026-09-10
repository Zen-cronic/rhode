import test from 'node:test';
import assert from 'node:assert/strict';
import {appliedTrails,mergeSamples,sampleNumber} from '../src/tracking-model.ts';
const point=(id,disposition='applied',position={lat:43.5,lng:-79.8})=>({id,at:`2026-09-13T12:00:0${id}Z`,position,disposition});
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
