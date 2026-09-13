import {useEffect,useState} from 'react';
import {PackagedCorridorReplay} from './PackagedCorridorDemo';
import type {Session} from './api';

const publicSession:Session={carrier:'public-synthetic-replay',token:'',label:'Public synthetic replay',uid:'public-replay'};

export function StandaloneCorridorReplay(){
 const[online,setOnline]=useState(navigator.onLine);
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);addEventListener('online',update);addEventListener('offline',update);return()=>{removeEventListener('online',update);removeEventListener('offline',update);};},[]);
 return <main className="standalone-corridor-page">
  <header className="standalone-corridor-header"><a href="/" aria-label="Rhode authenticated operations"><strong>Rhode</strong><span>TRANSPORT / CONTROL</span></a><div><span className="tag">PUBLIC SYNTHETIC REPLAY</span><a href="/?view=dock-evidence">Dock evidence</a><a href="/">Open operations →</a></div></header>
  <section className="standalone-corridor-intro"><p className="eyebrow">HIGHWAY 401 / MATCHED SIMULATION</p><h1>One road. Two outcomes.</h1><p>Compare a baseline trip with a declared slowdown using the same route, seed, clock, stops, dwell and speed profile. Choose a milestone to inspect the exact acknowledged observations.</p></section>
  <section className="panel standalone-corridor-card" aria-label="Public matched Highway 401 replay"><PackagedCorridorReplay session={publicSession} online={online}/></section>
  <footer className="standalone-corridor-footer"><span>2 × 2,401 acknowledged synthetic observations</span><span><a href="/?view=dock-evidence">Inspect dock detention receipt</a> · Read-only</span></footer>
 </main>;
}
