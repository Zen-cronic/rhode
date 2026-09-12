import {test} from 'node:test';import assert from 'node:assert/strict';
import {calculateAxles,axleReviewSchema,KG_PER_LB,type AxleConfiguration} from '../packages/domain/src/axle.ts';
export const configuration:AxleConfiguration={tractorWheelbaseM:4,fifthWheelFromSteerM:3.8,trailerSpanM:10,emptyKg:{steer:5000,drive:5000,trailer:4000},limitsKg:{steer:6500,drive:18000,trailer:14000},grossLimitKg:40000,driveAxles:2,trailerAxles:2,equalizedGroups:true};
test('gross passing does not hide overloaded trailer group and moving the same cargo changes reactions',()=>{
 const bad=calculateAxles(configuration,32000,8),good=calculateAxles(configuration,32000,5);
 assert.equal(bad.grossWithinLimit,true);assert.equal(bad.eligible,false);assert.equal(bad.groups[2].withinLimit,false);assert.equal(good.eligible,true);assert.equal(bad.grossKg,good.grossKg);
 assert.ok(Math.abs(bad.groups.reduce((sum,g)=>sum+g.loadedKg,0)-bad.grossKg)<1e-8);
 assert.ok(Math.abs(good.groups[1].cargoKg-(32000*KG_PER_LB*.5*.95))<1e-8);
});
test('model refuses unsupported geometry and tests exact configured group thresholds without rounding a failure away',()=>{
 assert.throws(()=>calculateAxles({...configuration,fifthWheelFromSteerM:4.1},32000,5));assert.throws(()=>calculateAxles(configuration,32000,11));assert.throws(()=>calculateAxles(configuration,NaN,5));
 const base=calculateAxles(configuration,32000,5),limit=base.groups[2].loadedKg;
 assert.equal(calculateAxles({...configuration,limitsKg:{...configuration.limitsKg,trailer:limit}},32000,5).eligible,true);
 assert.equal(calculateAxles({...configuration,limitsKg:{...configuration.limitsKg,trailer:limit-.00001}},32000,5).eligible,false);
 assert.equal(calculateAxles({...configuration,grossLimitKg:base.grossKg-.01},32000,5).grossWithinLimit,false);
 assert.equal(axleReviewSchema.safeParse({}).success,false);
});
