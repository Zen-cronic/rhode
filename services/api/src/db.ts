import pg from 'pg';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const pool = (connectionString=process.env.DATABASE_URL) => {
  if(!connectionString) throw new Error('DATABASE_URL is required; server SQLite is unsupported.');
  const db=new pg.Pool({connectionString,max:20,connectionTimeoutMillis:5000,statement_timeout:10000});
  // A disconnected idle socket is removed by pg; it must not crash the API process.
  db.on('error',error=>console.error('PostgreSQL idle connection closed','code' in error?String(error.code):'CONNECTION_ERROR'));
  return db;
};
export async function migrate(db: pg.Pool) {
  const c=await db.connect();
  try {
    await c.query('BEGIN'); await c.query("SELECT pg_advisory_xact_lock(hashtext('roadstar-migrations'))");
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
    const dir=new URL('../migrations/',import.meta.url);
    for(const name of (await readdir(dir)).filter(n=>n.endsWith('.sql')).sort()) {
      const sql=await readFile(new URL(name,dir),'utf8'), hash=createHash('sha256').update(sql).digest('hex');
      const old=await c.query('SELECT sha256 FROM schema_migrations WHERE name=$1',[name]);
      if(old.rows.length) {if(old.rows[0].sha256!==hash) throw new Error(`Applied migration changed: ${name}`); continue;}
      await c.query(sql); await c.query('INSERT INTO schema_migrations(name,sha256) VALUES($1,$2)',[name,hash]);
    }
    await c.query('COMMIT');
  } catch(e) {await c.query('ROLLBACK');throw e;} finally {c.release();}
}
if(import.meta.main) {const db=pool();try{await migrate(db);}finally{await db.end();}}
