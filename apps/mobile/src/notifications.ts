import {Platform} from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Crypto from 'expo-crypto';
import type {Queue} from './queue';
Notifications.setNotificationHandler({handleNotification:async()=>({shouldPlaySound:false,shouldSetBadge:false,shouldShowBanner:true,shouldShowList:true})});
export async function enableNotifications(queue:Queue){
 const projectId=process.env.EXPO_PUBLIC_EAS_PROJECT_ID??Constants.easConfig?.projectId;
 if(!projectId)throw new Error('Configure an Expo project ID and native push credentials, then rebuild this app.');
 if(Platform.OS!=='android'&&Platform.OS!=='ios')throw new Error('Use an Android or iOS development build for notifications.');
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('dispatch',{name:'Dispatch attention',importance:Notifications.AndroidImportance.HIGH});
 const permission=await Notifications.requestPermissionsAsync();if(!permission.granted)throw new Error('Notification permission denied. Enable it in device settings to receive background attention.');
 const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
 // Persist intent first: foreground reconciliation survives termination before enqueue.
 await queue.saveDraft('push-registration',JSON.stringify({token,platform:Platform.OS,enabled:true,id:Crypto.randomUUID()}));await reconcilePushRegistration(queue);
 return 'Push registration pending server synchronization. Device delivery still requires a verified provider setup.';
}
export async function reconcilePushRegistration(queue:Queue){const saved=JSON.parse(await queue.draft('push-registration')||'null');if(!saved)return;if((await queue.list()).some(c=>c.id===saved.id))return;await queue.enqueue(saved.id,'/api/push-token',{token:saved.token,platform:saved.platform,enabled:saved.enabled},0,saved.enabled?'Enable dispatch notifications':'Disable dispatch notifications');}
export async function disableNotifications(queue:Queue){const saved=JSON.parse(await queue.draft('push-registration')||'null');if(!saved?.enabled)return;await queue.saveDraft('push-registration',JSON.stringify({...saved,id:Crypto.randomUUID(),enabled:false}));await reconcilePushRegistration(queue);}
export async function notificationPermission(){return (await Notifications.getPermissionsAsync()).granted;}
export function listenForAttention(onAttention:()=>void){const received=Notifications.addNotificationReceivedListener(onAttention);const opened=Notifications.addNotificationResponseReceivedListener(onAttention);return()=>{received.remove();opened.remove();};}
