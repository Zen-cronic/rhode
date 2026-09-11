export function dutyOccurrenceAt(provenance:string|undefined,scenarios:{id:string;clock:string}[]|undefined,wallTime=new Date().toISOString(),evaluatedAt?:string|null){
 if(provenance==='synthetic'){const clock=scenarios?.find(s=>s.id==='recovery')?.clock??evaluatedAt;if(!clock||!Number.isFinite(Date.parse(clock)))throw new Error('Scenario clock is unavailable. Refresh before recording a duty change.');return clock;}
 if(provenance!=='live')throw new Error('A live or explicitly synthetic driver profile is required to record duty.');
 if(!Number.isFinite(Date.parse(wallTime)))throw new Error('Device time is unavailable.');return wallTime;
}
