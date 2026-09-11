import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consumeDutyHistory,type DutyBasis,type DutyObservation} from '../packages/domain/src/hos.ts';
const basis:DutyBasis={at:'2026-09-13T12:00:00Z',duty:'on_duty',budget:{drivingMinutes:420,onDutyMinutes:480,shiftMinutes:540,cycleMinutes:900}};
const event=(at:string,duty:DutyObservation['duty']):DutyObservation=>({at:`2026-09-13T${at}:00Z`,duty,source:'test'});
test('dated driving and dock wait consume budgets and retain the original shift deadline',()=>{
 const result=consumeDutyHistory(basis,[event('12:30','driving'),event('14:00','on_duty')],'2026-09-13T16:00:00Z');
 assert.deepEqual(result.budget,{drivingMinutes:330,onDutyMinutes:240,shiftMinutes:300,cycleMinutes:660});
 assert.equal(result.hosEvidence.shiftDeadline,'2026-09-13T21:00:00.000Z');
});
test('out-of-order and duplicate duty history computes the same budget, conflicts fail closed',()=>{
 const history=[event('12:30','driving'),event('14:00','on_duty')];const end='2026-09-13T16:00:00Z';
 assert.deepEqual(consumeDutyHistory(basis,history,end).budget,consumeDutyHistory(basis,[history[1],history[0],history[0]],end).budget);
 assert.equal(consumeDutyHistory(basis,[...history,event('14:00','off_duty')],end).budget,null);
});
test('short rest consumes elapsed window without granting drive, duty or cycle resets',()=>{
 const result=consumeDutyHistory(basis,[event('13:00','off_duty'),event('14:00','on_duty')],'2026-09-13T15:00:00Z');
 assert.deepEqual(result.budget,{drivingMinutes:420,onDutyMinutes:360,shiftMinutes:360,cycleMinutes:780});
});
test('missing history, potential reset and operator-day rollover require review',()=>{
 assert.equal(consumeDutyHistory(null,[],basis.at).budget,null);
 assert.equal(consumeDutyHistory({...basis,duty:'off_duty'},[],'2026-09-13T20:00:00Z').budget,null);
 assert.equal(consumeDutyHistory(basis,[],'2026-09-14T04:00:00Z').budget,null);
});
test('cycle exhaustion never produces a renewed positive work allowance',()=>{
 assert.equal(consumeDutyHistory({...basis,budget:{...basis.budget,cycleMinutes:30}},[],'2026-09-13T13:00:00Z').budget?.cycleMinutes,0);
});
