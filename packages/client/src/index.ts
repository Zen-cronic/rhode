export type Identity={carrierId:string;token:string};
export type CommandEnvelope={key:string;expectedVersion:number};
export type ApiFailure={error:{code:string;message:string;requestId?:string}};
export class ApiError extends Error{
 readonly status:number;readonly code:string;
 constructor(status:number,code:string,message:string){super(message);this.status=status;this.code=code;}
 get retryable(){return this.status===408||this.status===429||this.status>=500;}
}
export function authHeaders(identity:Identity,command?:CommandEnvelope):Record<string,string>{return {Authorization:`Bearer ${identity.token}`,'X-Carrier-Id':identity.carrierId,...(command?{'Idempotency-Key':command.key,'If-Match':String(command.expectedVersion)}:{})};}
export async function jsonResponse<T>(response:Response):Promise<T>{
 const body=await response.json();if(!response.ok)throw new ApiError(response.status,body?.error?.code??'REQUEST_FAILED',body?.error?.message??`Request failed (${response.status})`);return body as T;
}
export function createClient(baseUrl:string,identity:()=>Promise<Identity>,transport:typeof fetch=fetch){
 return {
  async get<T>(path:string){return jsonResponse<T>(await transport(baseUrl.replace(/\/$/,'')+path,{headers:authHeaders(await identity())}));},
  async command<T>(path:string,body:unknown,command:CommandEnvelope){return jsonResponse<T>(await transport(baseUrl.replace(/\/$/,'')+path,{method:'POST',headers:{...authHeaders(await identity(),command),'Content-Type':'application/json'},body:JSON.stringify(body)}));}
 };
}
