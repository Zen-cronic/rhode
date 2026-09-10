import test from 'node:test';
import assert from 'node:assert/strict';
import {pairingError,nextGroupStop,stopCompleted,plannedTime} from '../src/planning-model.ts';
const pair={driverId:'driver1',truckId:'truck1',trailerId:'trailer1'};
test('planning pairings reject shared resources and incomplete equipment',()=>{
  assert.equal(pairingError([pair]),null);
  for(const field of ['driverId','truckId','trailerId']){
    assert.match(pairingError([pair,{driverId:'driver2',truckId:'truck2',trailerId:'trailer2',[field]:pair[field]}]),/only one pairing/);
    assert.match(pairingError([{...pair,[field]:''}]),/Choose a driver/);
  }
});
test('next-stop guidance follows the global manifest order across loads',()=>{
  const stops=[{assignmentId:'A',stopId:'shared-pickup'},{assignmentId:'B',stopId:'shared-pickup'},{assignmentId:'A',stopId:'delivery-A'},{assignmentId:'B',stopId:'delivery-B'}];
  const group={body:{stops}};
  let completed=[];
  for(const stop of stops){
    assert.equal(nextGroupStop(group,completed),stop);
    completed.push({assignment_id:stop.assignmentId,stop_id:stop.stopId});
  }
  assert.equal(nextGroupStop(group,completed),undefined);
});
test('same facility on another load is not silently marked completed',()=>{
  assert.equal(stopCompleted({assignmentId:'B',stopId:'shared-pickup'},[{assignment_id:'A',stop_id:'shared-pickup'}]),false);
});
test('planned appointments use the run clock rather than wall-clock time',()=>{
  assert.match(plannedTime('2026-09-13T12:00:00Z',30),/Sep 13.*8:30/);
  assert.equal(plannedTime('invalid',30),'Time unavailable');
});
