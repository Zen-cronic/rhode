import ExcelJS from 'exceljs';
import {readFile} from 'node:fs/promises';
import {basename} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {demand} from '../../../packages/domain/src/index.ts';
import type {Store,Actor} from './store.ts';
const sheets=['Tlorder','Dispatch','Driver','Trucks','Trailers'];
export async function importWorkbook(store:Store,actor:Actor,path:string){
  store.dispatcher(actor);const bytes=await readFile(path),hash=createHash('sha256').update(bytes).digest('hex');
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes as any);
  // Preserve every supplied sheet; expected-name validation is based on actual inventory.
  demand(workbook.worksheets.length===5&&sheets.every(name=>workbook.getWorksheet(name)),'INVALID_WORKBOOK','RoadStar import expects all five source sheets.',400);
  const parsed=workbook.worksheets.map(sheet=>{
    const columns=sheet.getRow(1).values as ExcelJS.CellValue[];
    const headers=Array.from({length:sheet.columnCount},(_,i)=>String(columns[i+1]??`COLUMN_${i+1}`));
    const seen=new Map<string,number>(),rows:any[]=[];
    sheet.eachRow({includeEmpty:false},(row,index)=>{
      if(index===1)return;
      const raw=Object.fromEntries(headers.map((header,i)=>[header,{value:row.getCell(i+1).value,numFmt:row.getCell(i+1).numFmt??null,text:row.getCell(i+1).text}]));
      const normalized:Record<string,unknown>={},issues:{column:string;code:string}[]=[];
      for(const [header,cell] of Object.entries(raw)){
        const value=cell.value;
        if(value===null||value===undefined||value===''){normalized[header]=null;issues.push({column:header,code:'missing'});}
        else if(value instanceof Date){normalized[header]=value.getUTCFullYear()===1980?null:value.toISOString();issues.push({column:header,code:value.getUTCFullYear()===1980?'sentinel_timestamp':'historical_timezone_unverified'});}
        else if(typeof value==='number'&&/(?:^|_)(ID|NUMBER|DRIVER|TRIP|BILL)(?:$|_)/i.test(header))normalized[header]=cell.text;
        else normalized[header]=value;
      }
      const fingerprint=createHash('sha256').update(JSON.stringify(raw)).digest('hex'),duplicateOf=seen.get(fingerprint)??null;
      if(duplicateOf===null)seen.set(fingerprint,index);
      rows.push({index,raw,normalized:{...normalized,_provenance:'imported-historical',_operationalStatus:'requires_reconciliation'},issues,duplicateOf});
    });return {name:sheet.name,headers,rows};
  });
  const c=await store.db.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[actor.carrierId]);
    const old=await c.query('SELECT id FROM source_imports WHERE carrier_id=$1 AND sha256=$2',[actor.carrierId,hash]);if(old.rows[0]){await c.query('COMMIT');return {id:old.rows[0].id,duplicate:true};}
    const id=randomUUID();await c.query('INSERT INTO source_imports(carrier_id,id,sha256,filename) VALUES($1,$2,$3,$4)',[actor.carrierId,id,hash,basename(path)]);
    for(const sheet of parsed)for(const row of sheet.rows)await c.query('INSERT INTO source_rows VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[actor.carrierId,id,sheet.name,row.index,JSON.stringify(row.raw),JSON.stringify(row.normalized),JSON.stringify(row.issues),row.duplicateOf]);
    const result={id,duplicate:false,sha256:hash,sheets:parsed.map(s=>({name:s.name,rows:s.rows.length,columns:s.headers.length,duplicates:s.rows.filter(r=>r.duplicateOf!==null).length})),provenance:'imported-historical',operationalStatus:'requires_reconciliation'};
    await c.query('INSERT INTO events(carrier_id,kind,actor,body) VALUES($1,$2,$3,$4)',[actor.carrierId,'import.completed',actor.uid,JSON.stringify(result)]);await c.query('COMMIT');return result;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
