import {parentPort,workerData} from 'node:worker_threads';
import {Store} from '../services/api/src/store.ts';
const store=new Store(workerData.path);
try {parentPort!.postMessage({ok:true,assignment:store.dispatch(workerData.input)});}
catch(error) {parentPort!.postMessage({ok:false,code:(error as {code:string}).code});}
finally {store.close();}
