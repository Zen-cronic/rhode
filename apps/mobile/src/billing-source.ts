import {File,Paths} from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import {Platform} from 'react-native';
import {startActivityAsync} from 'expo-intent-launcher';
import {isAvailableAsync,shareAsync} from 'expo-sharing';
import type {Api} from './api';
import type {BillingSource} from './billing-review';
/** Download only through the authenticated API; verify immutable bytes before local viewing. */
export async function openBillingSource(api:Api,source:BillingSource){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 let file:File|undefined;
 try{
  const response=await fetch(`${api.origin.replace(/\/$/,'')}/api/documents/${encodeURIComponent(source.id)}/content`,{headers:{Authorization:`Bearer ${await api.identity.token()}`,'X-Carrier-Id':api.identity.carrier},signal:controller.signal});
  if(!response.ok)throw new Error(`Source unavailable (HTTP ${response.status}). Refresh the evidence before trying again.`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(!bytes.length||bytes.length>12*1024*1024)throw new Error('Source size is outside the supported range.');
  const digest=Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==source.sha256)throw new Error('Downloaded source hash does not match reviewed evidence.');
  const ext=({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'} as Record<string,string>)[source.media_type];
  if(!ext)throw new Error('Unsupported source media type.');
  file=new File(Paths.cache,`roadstar-source-${Crypto.randomUUID()}.${ext}`);file.write(bytes);
  clearTimeout(timer);
  if(Platform.OS==='android')await startActivityAsync('android.intent.action.VIEW',{data:file.contentUri,type:source.media_type,flags:1});
  else {if(!await isAvailableAsync())throw new Error('A local document viewer is unavailable.');await shareAsync(file.uri,{mimeType:source.media_type,dialogTitle:'Review shipment source'});}
  return {sha256:digest,bytes:bytes.length};
 }finally{clearTimeout(timer);if(file?.exists)file.delete();}
}
