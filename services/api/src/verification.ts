import type {Actor} from './store.ts';
// Off by default. An operator-scoped, expiring fixture never permits device data
// into ordinary synthetic demo carriers or claims physical GPS verification.
export function emulatorVerification(a:Actor,now=Date.now()){
 return a.role==='driver'&&!!a.driverId&&a.carrierId===process.env.EMULATOR_TRACKING_CARRIER&&a.driverId===process.env.EMULATOR_TRACKING_DRIVER&&now<Date.parse(process.env.EMULATOR_TRACKING_UNTIL??'');
}
