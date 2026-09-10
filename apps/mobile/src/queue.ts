export type QueueStatus = 'pending' | 'synchronized' | 'failed';
export type Command = {id:string;scope:string;path:string;body:string;expectedVersion:number;label:string;status:QueueStatus;createdAt:string;error:string|null;result:string|null};
export interface Database {
  execAsync(sql:string):Promise<void>;
  runAsync(sql:string,...params:any[]):Promise<unknown>;
  getAllAsync<T>(sql:string,...params:any[]):Promise<T[]>;
  getFirstAsync<T>(sql:string,...params:any[]):Promise<T|null>;
}
export const schema = `PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS snapshots (scope TEXT PRIMARY KEY, body TEXT NOT NULL, saved_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS commands (id TEXT PRIMARY KEY, scope TEXT NOT NULL, path TEXT NOT NULL, body TEXT NOT NULL, expectedVersion INTEGER NOT NULL, label TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','synchronized','failed')), createdAt TEXT NOT NULL, error TEXT, result TEXT);
CREATE INDEX IF NOT EXISTS commands_scope ON commands(scope,createdAt);
CREATE TABLE IF NOT EXISTS drafts (scope TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(scope,name));`;
export class Queue {
  private running = false;
  private db:Database;
  readonly scope:string;
  constructor(db:Database,scope:string) {this.db=db;this.scope=scope;}
  async init(){await this.db.execAsync(schema);}
  async list(){return this.db.getAllAsync<Command>('SELECT * FROM commands WHERE scope=? ORDER BY createdAt,rowid',this.scope);}
  async snapshot<T>():Promise<{body:T;savedAt:string}|null>{
    const row=await this.db.getFirstAsync<{body:string;saved_at:string}>('SELECT * FROM snapshots WHERE scope=?',this.scope);
    return row?{body:JSON.parse(row.body),savedAt:row.saved_at}:null;
  }
  async saveSnapshot(body:unknown){await this.db.runAsync('INSERT INTO snapshots(scope,body,saved_at) VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET body=excluded.body,saved_at=excluded.saved_at',this.scope,JSON.stringify(body),new Date().toISOString());}
  async draft(name:string){return (await this.db.getFirstAsync<{body:string}>('SELECT body FROM drafts WHERE scope=? AND name=?',this.scope,name))?.body??'';}
  async saveDraft(name:string,body:string){await this.db.runAsync('INSERT INTO drafts(scope,name,body) VALUES(?,?,?) ON CONFLICT(scope,name) DO UPDATE SET body=excluded.body',this.scope,name,body);}
  async enqueue(id:string,path:string,body:unknown,expectedVersion:number,label:string){
    const encoded=JSON.stringify(body);
    const existing=await this.db.getFirstAsync<Command>("SELECT * FROM commands WHERE scope=? AND path=? AND body=? AND status='pending'",this.scope,path,encoded);
    if(existing&&!path.includes('/document'))return existing.id;
    await this.db.runAsync("INSERT INTO commands(id,scope,path,body,expectedVersion,label,status,createdAt) VALUES(?,?,?,?,?,?,'pending',?)",id,this.scope,path,encoded,expectedVersion,label,new Date().toISOString());
    return id;
  }
  async flush(send:(command:Command)=>Promise<{status:number;body:unknown}>,eligible:(command:Command)=>boolean=()=>true) {
    if(this.running)return;
    this.running=true;
    try {
      for(const command of await this.list()) {
        if(command.status!=='pending'||!eligible(command))continue;
        try {
          const response=await send(command);
          if(response.status>=200 && response.status<300){
            await this.db.runAsync("UPDATE commands SET status='synchronized',error=NULL,result=? WHERE id=? AND scope=?",JSON.stringify(response.body),command.id,this.scope);
          } else {
            const message=(response.body as any)?.error?.message??`HTTP ${response.status}`;
            const terminal=response.status>=400 && response.status<500 && ![408,425,429].includes(response.status);
            await this.db.runAsync('UPDATE commands SET status=?,error=? WHERE id=? AND scope=?',terminal?'failed':'pending',`${response.status}: ${message}`,command.id,this.scope);
            if(!terminal)break;
          }
        } catch(error){
          await this.db.runAsync('UPDATE commands SET error=? WHERE id=? AND scope=?',error instanceof Error?error.message:'Connection unavailable',command.id,this.scope);
          break;
        }
      }
    }finally{this.running=false;}
  }
}
