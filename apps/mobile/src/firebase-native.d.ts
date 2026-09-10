import type {Persistence} from 'firebase/auth';
// Firebase's React Native entry exports this documented API, but its shared
// public declarations omit it. Keep the native signature alongside the client.
declare module 'firebase/auth' {
 export function getReactNativePersistence(storage:{getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>;removeItem(key:string):Promise<void>}):Persistence;
}
