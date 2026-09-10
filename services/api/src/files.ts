import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Storage} from '@google-cloud/storage';
import {demand} from '../../../packages/domain/src/index.ts';
export const sha256=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export class Files {
  readonly root:string;
  readonly bucket:string|undefined;
  constructor(){this.root=process.env.FILE_ROOT??'data/private-documents';this.bucket=process.env.DOCUMENT_BUCKET;}
  async put(name:string,bytes:Buffer,mediaType:string){
    if(this.bucket){const file=new Storage().bucket(this.bucket).file(name);try{await file.save(bytes,{resumable:false,contentType:mediaType,preconditionOpts:{ifGenerationMatch:0},metadata:{metadata:{sha256:sha256(bytes)}}});}catch(e:any){if(e.code!==412)throw e;const [existing]=await file.download();demand(sha256(existing)===sha256(bytes),'CONTENT_CONFLICT','Document already has different bytes.');}return;}
    // Only generated UUID object names are accepted; caller filenames never become paths.
    demand(/^[a-f0-9-]{36}$/.test(name),'INVALID_OBJECT','Invalid object name.',400);await mkdir(this.root,{recursive:true});try{await writeFile(join(this.root,name),bytes,{flag:'wx',mode:0o600});}catch(e:any){if(e.code!=='EEXIST')throw e;demand(sha256(await readFile(join(this.root,name)))===sha256(bytes),'CONTENT_CONFLICT','Document already has different bytes.');}
  }
  async get(name:string){if(this.bucket)return (await new Storage().bucket(this.bucket).file(name).download())[0];demand(/^[a-f0-9-]{36}$/.test(name),'INVALID_OBJECT','Invalid object name.',400);return readFile(join(this.root,name));}
}
