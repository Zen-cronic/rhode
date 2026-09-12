type Budget={drivingMinutes:number;onDutyMinutes:number;shiftMinutes:number;cycleMinutes:number};
export function driverHeadroom(budget?:Budget|null){
 const limits=[['drivingMinutes','driving'],['onDutyMinutes','on-duty'],['shiftMinutes','elapsed/rest'],['cycleMinutes','cycle']] as const;
 if(!budget||limits.some(([key])=>!Number.isFinite(budget[key])))return 'HOS unavailable · review history';
 const exhausted=limits.filter(([key])=>budget[key]<=0).map(([,label])=>label);
 return exhausted.length?`Driving held · ${exhausted.join(', ')} limit`:`${Math.floor(Math.min(...limits.map(([key])=>budget[key])))} min HOS headroom`;
}
