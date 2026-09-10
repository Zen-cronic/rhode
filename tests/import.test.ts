import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {pool,migrate} from '../services/api/src/db.ts';
import {Store} from '../services/api/src/store.ts';
import {importWorkbook} from '../services/api/src/importer.ts';
test('all five sheets preserve source rows, duplicates, missing fields and historical timestamps',async()=>{
 const db=pool(process.env.TEST_DATABASE_URL),store=new Store(db),dir=await mkdtemp(join(tmpdir(),'roadstar-import-'));
 try{await migrate(db);const carrierId=`import-${randomUUID()}`;await store.seed(carrierId);const actor=await store.membership('demo-dispatcher',carrierId),book=new ExcelJS.Workbook();
 for(const name of ['Tlorder','Dispatch','Driver','Trucks','Trailers']){const s=book.addWorksheet(name);s.addRow(['DRIVER_ID','HOURS_UPDATED','MISSING']);s.addRow(['001',new Date('1980-01-01T00:00:00Z'),null]);s.addRow(['001',new Date('1980-01-01T00:00:00Z'),null]);}
 const path=join(dir,'fixture.xlsx');await book.xlsx.writeFile(path);const result:any=await importWorkbook(store,actor,path);assert.equal(result.sheets.length,5);assert.equal(result.sheets[0].rows,2);assert.equal(result.sheets[0].duplicates,1);assert.equal((await importWorkbook(store,actor,path)).duplicate,true);
 const rows=await store.sourceRows(actor,result.id,'Driver');assert.equal(rows[0].normalized.DRIVER_ID,'001');assert.equal(rows[0].normalized.HOURS_UPDATED,null);assert.equal(rows[1].duplicate_of,2);assert.equal(rows[0].normalized._provenance,'imported-historical');assert.ok(rows[0].issues.some((i:any)=>i.code==='missing'));
 }finally{await db.end();await rm(dir,{recursive:true,force:true});}
});
