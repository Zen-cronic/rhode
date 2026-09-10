import {getApps,initializeApp} from 'firebase/app';
import {initializeAuth,getReactNativePersistence,signInWithEmailAndPassword,signOut,type Auth,type User} from 'firebase/auth';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {securePersistence} from './secure-persistence';
import type {Identity} from './api';
let auth:Auth|undefined;
const store=securePersistence({getItem:key=>SecureStore.getItemAsync(key),setItem:(key,value)=>SecureStore.setItemAsync(key,value,{keychainAccessible:SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY}),removeItem:key=>SecureStore.deleteItemAsync(key)},async key=>'rs-auth-'+await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,key),()=>Crypto.randomUUID());
type Selection={origin:string;carrier:string;role:'driver'|'dispatcher';uid:string};
function firebaseAuth(){if(auth)return auth;if(!process.env.EXPO_PUBLIC_FIREBASE_API_KEY)throw new Error('Firebase is not configured. Set the public Firebase app configuration.');const app=getApps()[0]??initializeApp({apiKey:process.env.EXPO_PUBLIC_FIREBASE_API_KEY,authDomain:process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,projectId:process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID});return auth=initializeAuth(app,{persistence:getReactNativePersistence(store)});}
function identity(user:User,selection:Selection):Identity{return {id:user.uid,role:selection.role,carrier:selection.carrier,token:()=>user.getIdToken(),backgroundCredential:async()=>{const token=await user.getIdTokenResult();return {token:token.token,expiresAt:token.expirationTime};}};}
export async function restoreSession(){if(!process.env.EXPO_PUBLIC_FIREBASE_API_KEY)return null;const current=firebaseAuth();await current.authStateReady();const saved=JSON.parse(await store.getItem('roadstar-selected-workspace')||'null') as Selection|null;return current.currentUser&&saved&&saved.uid===current.currentUser.uid?{...saved,identity:identity(current.currentUser,saved)}:null;}
export async function loginSession(email:string,password:string,selection:Omit<Selection,'uid'>){const {user}=await signInWithEmailAndPassword(firebaseAuth(),email,password);const saved={...selection,uid:user.uid};await store.setItem('roadstar-selected-workspace',JSON.stringify(saved));return identity(user,saved);}
export async function logoutSession(){if(auth)await signOut(auth);await store.removeItem('roadstar-selected-workspace');}
