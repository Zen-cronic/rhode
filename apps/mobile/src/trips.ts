type TripAssignment={loadId:string;status:string};
/** Keep the current active trip stable when synchronization reorders rows. */
export function currentAssignment<T extends TripAssignment>(assignments:T[],selected:string|null):T|undefined{
 const active=assignments.filter(a=>!['rejected','completed','superseded'].includes(a.status));
 return active.find(a=>a.loadId===selected)??active.find(a=>a.status==='accepted')??active[0];
}
