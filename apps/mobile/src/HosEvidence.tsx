import React from 'react';
import {StyleSheet,View} from 'react-native';
import {Text,colors} from './Design';
import type {State} from './api';
const minutes=(value:number|undefined)=>typeof value==='number'&&Number.isFinite(value)?`${value} min`:'Unknown';
const when=(value:string|undefined)=>value?new Date(value).toLocaleString('en-CA',{timeZone:'America/Toronto',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Unknown';
export function HosEvidence({driver,savedAt,offline}:{driver:State['resources'][number]|undefined;savedAt:string;offline:boolean}){
 const evidence=driver?.hosEvidence,budget=driver?.budget;
 const exhausted=budget?[['Driving',budget.drivingMinutes],['On-duty',budget.onDutyMinutes],['Elapsed shift',budget.shiftMinutes],['Cycle',budget.cycleMinutes]].filter(([,value])=>value===0).map(([label])=>label):[];
 return <View style={s.card}><Text style={s.eyebrow}>DATED DUTY EVIDENCE</Text><Text style={s.title}>Your planning clocks</Text><Text style={s.small}>{evidence?.profile==='federal-south-60-solo-ordinary-v1'?'Federal · solo freight south of 60°N':evidence?.profile==='declared-budget-history'?'Declared budget history':'No supported profile'} · {driver?.provenance??'Unknown source'}</Text>
 {offline?<Text accessibilityLiveRegion="polite" style={s.notice}>Offline: recorded clocks below are a downloaded snapshot. Reconnect and refresh before relying on current availability.</Text>:null}
 {!budget?<Text style={s.notice}>Availability cannot be established. {evidence?.reason??'Reviewed duty evidence is missing.'}</Text>:<>{exhausted.length?<Text style={s.notice}>{exhausted.join(', ')} allowance exhausted. A new assignment needs dispatcher review.</Text>:null}<View style={s.metrics}>{([['Driving',budget.drivingMinutes],['On-duty',budget.onDutyMinutes],['Elapsed shift',budget.shiftMinutes],['Cycle',budget.cycleMinutes]] as const).map(([label,value])=><View key={label} style={s.metric}><Text style={s.small}>{label}</Text><Text style={s.value}>{minutes(value)}</Text></View>)}</View></>}
 <Text style={s.small}>Clocks as of {when(driver?.budgetAsOf??undefined)} ET{driver?.provenance==='synthetic'?' · Scenario time':''}</Text><Text style={s.small}>Downloaded {when(savedAt)} ET · Driver {driver?.id??'Unknown'}</Text>
 {evidence?.dayStart?<><Text style={s.label}>Operator day</Text><Text style={s.small}>{when(evidence.dayStart)} → {when(evidence.dayEnd)} ET</Text><Text style={s.body}>Day driving {minutes(evidence.dayDrivingMinutes)} · Day on-duty {minutes(evidence.dayOnDutyMinutes)}</Text></>:null}
 {evidence?.shiftStart?<><Text style={s.label}>Current shift</Text><Text style={s.small}>Since {when(evidence.shiftStart)} ET</Text><Text style={s.body}>Shift driving {minutes(evidence.shiftDrivingMinutes)} · Shift on-duty {minutes(evidence.shiftOnDutyMinutes)}</Text><Text style={s.small}>Daily rest still required {minutes(evidence.dailyRestRemainingMinutes)}</Text></>:null}
 {evidence?.revision?<Text style={s.small}>Reviewed revision {evidence.revision} · {evidence.sourceRef}{'\n'}Reviewed by {evidence.reviewedBy}</Text>:null}
 <Text style={s.small}>These are planning clocks, not driving permission or certified ELD records. Dispatch rechecks the whole assignment. Recording further dock work remains possible when driving allowance is exhausted.</Text>
 </View>;
}
const s=StyleSheet.create({card:{backgroundColor:colors.ivory,borderRadius:16,padding:20,gap:12},eyebrow:{fontSize:10,fontWeight:'700',letterSpacing:2,color:colors.orangeInk},title:{fontSize:22,fontWeight:'700',color:colors.ink},small:{fontSize:12,lineHeight:19,color:colors.ink},body:{fontSize:14,lineHeight:21,color:colors.ink},label:{fontSize:14,fontWeight:'600',color:colors.ink},notice:{fontSize:13,lineHeight:20,color:colors.orangeInk},metrics:{flexDirection:'row',flexWrap:'wrap',gap:12},metric:{width:'46%',gap:4,paddingVertical:8},value:{fontSize:23,fontWeight:'700',color:colors.ink}});
