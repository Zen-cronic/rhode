import {z} from 'zod';
const kg=z.number().finite().positive().max(100000);
const groups=z.object({steer:kg,drive:kg,trailer:kg}).strict();
export const axleConfigurationSchema=z.object({tractorWheelbaseM:z.number().positive().max(15),fifthWheelFromSteerM:z.number().nonnegative().max(15),trailerSpanM:z.number().positive().max(20),emptyKg:groups,limitsKg:groups,grossLimitKg:kg,driveAxles:z.number().int().min(1).max(3),trailerAxles:z.number().int().min(1).max(3),equalizedGroups:z.literal(true)}).strict().refine(c=>c.fifthWheelFromSteerM<=c.tractorWheelbaseM,'Fifth wheel beyond the drive-group centre is unsupported');
export const axleReviewSchema=z.object({loadId:z.string().min(1).max(128),truckId:z.string().min(1).max(128),trailerId:z.string().min(1).max(128),documentId:z.string().uuid(),expectedDocumentVersion:z.number().int().positive(),expectedLoadVersion:z.number().int().positive(),expectedTrailerVersion:z.number().int().positive(),configuration:axleConfigurationSchema,cargoCgFromKingpinM:z.number().nonnegative().max(20),reason:z.string().trim().min(20).max(2000),sourceNote:z.string().trim().min(20).max(2000),acknowledgeModeledLoads:z.literal(true)}).strict().refine(x=>x.cargoCgFromKingpinM<=x.configuration.trailerSpanM,'Cargo centre outside the kingpin-to-trailer-group span is unsupported');
export type AxleConfiguration=z.infer<typeof axleConfigurationSchema>;
export type AxleReviewInput=z.infer<typeof axleReviewSchema>;
export const AXLE_POLICY='static-three-group-v1';
export const KG_PER_LB=0.45359237;
/** Two successive static moment balances; tare is the EMPTY coupled combination. */
export function calculateAxles(configuration:AxleConfiguration,payloadLb:number,cargoCgFromKingpinM:number){
 const c=axleConfigurationSchema.parse(configuration);
 z.number().finite().positive().max(220000).parse(payloadLb);
 z.number().finite().min(0).max(c.trailerSpanM).parse(cargoCgFromKingpinM);
 const payloadKg=payloadLb*KG_PER_LB,trailerCargo=payloadKg*cargoCgFromKingpinM/c.trailerSpanM,kingpinCargo=payloadKg-trailerCargo;
 const driveCargo=kingpinCargo*c.fifthWheelFromSteerM/c.tractorWheelbaseM;
 const additions={steer:kingpinCargo-driveCargo,drive:driveCargo,trailer:trailerCargo};
 const groups=(['steer','drive','trailer'] as const).map(id=>({id,emptyKg:c.emptyKg[id],cargoKg:additions[id],loadedKg:c.emptyKg[id]+additions[id],limitKg:c.limitsKg[id],withinLimit:c.emptyKg[id]+additions[id]<=c.limitsKg[id]}));
 const emptyGrossKg=Object.values(c.emptyKg).reduce((sum,x)=>sum+x,0),grossKg=emptyGrossKg+payloadKg,grossWithinLimit=grossKg<=c.grossLimitKg;
 const reasons=[...(!grossWithinLimit?['Configured gross weight limit exceeded.']:[]),...groups.filter(g=>!g.withinLimit).map(g=>`Configured ${g.id} axle-group limit exceeded (${g.loadedKg.toFixed(1)} kg / ${g.limitKg.toFixed(1)} kg).`)];
 return {policy:AXLE_POLICY,eligible:!reasons.length,reasons,payloadKg,emptyGrossKg,grossKg,grossLimitKg:c.grossLimitKg,grossWithinLimit,groups,kingpinCargoKg:kingpinCargo,maximumModeledAxleKg:Math.max(groups[0].loadedKg,groups[1].loadedKg/c.driveAxles,groups[2].loadedKg/c.trailerAxles),note:'Static, equalized three-group model using configured limits; not scale measurements, individual axle certification or an Ontario legal-clearance calculation.'};
}
