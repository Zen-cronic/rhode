import * as SQLite from 'expo-sqlite';
let database:Promise<SQLite.SQLiteDatabase>|undefined;
// One native handle per JS runtime. Repeated wrappers may be finalized while
// another queue is preparing a statement on the same cached native connection.
export function getDatabase(){return database??=(SQLite.openDatabaseAsync('roadstar-v1.db').catch(error=>{database=undefined;throw error;}));}
