export interface SecureBackend{getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>;removeItem(key:string):Promise<void>}
/** Small encrypted chunks avoid platform keychain value limits; the index is
 * committed last, so interruption cannot expose a partially written session. */
export function securePersistence(backend:SecureBackend,keyId:(key:string)=>Promise<string>,generation:()=>string){
 const pending=new Map<string,Promise<unknown>>();
 function serial<T>(key:string,work:()=>Promise<T>):Promise<T>{const result=(pending.get(key)??Promise.resolve()).catch(()=>{}).then(work);pending.set(key,result);void result.finally(()=>{if(pending.get(key)===result)pending.delete(key);}).catch(()=>{});return result;}
 async function index(root:string){const raw=await backend.getItem(root);if(!raw)return null;const value=JSON.parse(raw);return typeof value.generation==='string'&&Number.isInteger(value.count)&&value.count>0&&value.count<=1000?value as {generation:string;count:number}:null;}
 async function clean(root:string,value:{generation:string;count:number}|null){if(value)for(let i=0;i<value.count;i++)await backend.removeItem(`${root}.${value.generation}.${i}`);}
 return {
  getItem(key:string){return serial(key,async()=>{const root=await keyId(key),saved=await index(root);if(!saved)return null;let result='';for(let i=0;i<saved.count;i++){const part=await backend.getItem(`${root}.${saved.generation}.${i}`);if(part===null)return null;result+=part;}return result;});},
  setItem(key:string,value:string){return serial(key,async()=>{const root=await keyId(key),previous=await index(root),chars=Array.from(value),next={generation:generation(),count:Math.max(1,Math.ceil(chars.length/400))};try{for(let i=0;i<next.count;i++)await backend.setItem(`${root}.${next.generation}.${i}`,chars.slice(i*400,(i+1)*400).join(''));await backend.setItem(root,JSON.stringify(next));}catch(error){await clean(root,next).catch(()=>{});throw error;}await clean(root,previous);});},
  removeItem(key:string){return serial(key,async()=>{const root=await keyId(key),previous=await index(root);await backend.removeItem(root);await clean(root,previous);});}
 };
}
