import type {Api,State} from './api';
/** Duty and open-dock freshness can change with time without a new event cursor. */
export async function refreshSnapshot(api:Pick<Api,'request'|'state'>,cursor:string|null,tab:string,force=false):Promise<State|null>{
 if(!force&&tab!=='Duty'&&tab!=='More'&&cursor!==null){
  const updates=await api.request(`/api/updates?cursor=${encodeURIComponent(cursor)}`);
  if(updates.status!==200)throw new Error(updates.body.error?.message??'Synchronization unavailable');
  if(!updates.body.changes.length)return null;
 }
 return api.state();
}
