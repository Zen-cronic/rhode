import {pool,migrate} from './db.ts';
import {Store} from './store.ts';
import {importWorkbook} from './importer.ts';
const [path,carrierId,uid]=process.argv.slice(2);if(!path||!carrierId||!uid)throw new Error('Usage: import-cli.ts path.xlsx carrier-id dispatcher-uid');
const db=pool();try{await migrate(db);const store=new Store(db);console.log(JSON.stringify(await importWorkbook(store,await store.membership(uid,carrierId),path),null,2));}finally{await db.end();}
