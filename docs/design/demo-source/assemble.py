from pathlib import Path
import json,subprocess,wave,os
source=Path(__file__).resolve().parent;project=source.parents[2];base=Path(os.environ.get('ROADSTAR_SUBMISSION',str(project.parent/'submission/roadstar')));work=Path(os.environ.get('ROADSTAR_RENDER_WORK','/tmp/roadstar-redesign'));build=work/'film';capture=Path(os.environ.get('ROADSTAR_CAPTURE',str(work/'capture')));output=build/'output';output.mkdir(parents=True,exist_ok=True);(build/'segments').mkdir(exist_ok=True)
scenes=json.loads((source/'scenes.json').read_text());font=source/'fonts/Manrope-Regular.ttf';mono=source/'fonts/IBMPlexMono-Regular.ttf';records=[]
def run(args):subprocess.run(['ffmpeg','-y','-v','error',*args],check=True)
# Original authenticated footage, after authentication has been trimmed.
run(['-i',str(capture/'04-document-source.mp4'),'-i',str(capture/'05-billing-evidence.mp4'),'-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','18',str(build/'evidence-joined.mp4')])
sources={name:build/(name+'-motion.mp4') for name in ['hook','problem','lineage','proof','close']}
sources.update(delay=capture/'01-dock-delay.mp4',approval=capture/'02-recovery-approval.mp4',driver=Path(os.environ.get('ROADSTAR_NATIVE_CLIP',str(work/'mobile/roadstar-native-precision-transport.mp4'))),evidence=build/'evidence-joined.mp4',planning=capture/'07-planning-record.mp4')
labels={'delay':'01 / Dock delay','approval':'02 / Recovery approval','evidence':'04 / Evidence and detention','planning':'05 / Consolidated dispatch'}
only_scene=os.environ.get('ROADSTAR_ONLY_SCENE')
if not only_scene or only_scene=='driver':
 native_source=sources['driver'];native_composed=build/'native-composed.mp4'
 # Clean component groups from actual emulator footage. Omit the intervening scroll.
 native_shots=[(0,5.966667,'984:1272:48:544'),(7.2,14.966667,'984:1376:48:552'),(14.966667,22.966667,'984:1380:48:544'),(22.966667,26.3,'984:1272:48:544')]
 filters=[]
 for i,(start,end,crop) in enumerate(native_shots):
  filters.append(f'[0:v]trim=start={start}:end={end},setpts=PTS-STARTPTS,crop={crop},scale=660:880:force_original_aspect_ratio=decrease,pad=iw+24:ih+24:12:12:color=0xF5F3ED,pad=1920:1080:1080:(1080-ih)/2:color=0x191B1D,setsar=1,fps=24[n{i}]')
 filters.append(''.join(f'[n{i}]' for i in range(len(native_shots)))+'concat=n=4:v=1:a=0[out]')
 run(['-i',str(native_source),'-filter_complex',';'.join(filters),'-map','[out]','-an','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p',str(native_composed)])
 sources['driver']=native_composed
 (build/'native-composition.json').write_text(json.dumps({'source':str(native_source),'shots':[{'start':a,'end':b,'crop':c} for a,b,c in native_shots],'note':'Actual footage; clean complete component groups; scrolling transition omitted. No UI values changed.'},indent=2))
for s in scenes:
 if only_scene and s['id']!=only_scene:continue
 name=s['id'];duration=s['targetSeconds'];audio=base/'private-build/audio'/(name+'.wav');video=sources[name];target=build/'segments'/(name+'.mp4')
 with wave.open(str(audio),'rb') as w:ad=w.getnframes()/w.getframerate()
 tempo=ad/(duration-.35)
 if name in ['hook','problem','lineage','proof','close']:vf='fps=24,setsar=1'
 elif name=='driver':
  title=build/'native-title.txt';title.write_text('One trip.\nOne clear next step.');sub=build/'native-sub.txt';sub.write_text('Manifest, route and saved actions.\nSynchronized with dispatch.');limit=build/'native-limit.txt';limit.write_text('Android emulator · enlarged detail\nPhysical-device and native iOS checks pending.')
  vf=f"setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=30,drawtext=fontfile={mono}:text=03 / DRIVER EXECUTION:fontsize=20:fontcolor=0xE65C32:x=96:y=112,drawtext=fontfile={font}:textfile={title}:fontsize=62:line_spacing=8:fontcolor=0xF5F3ED:x=96:y=256,drawtext=fontfile={font}:textfile={sub}:fontsize=29:line_spacing=14:fontcolor=0xC4C7BE:x=96:y=510,drawtext=fontfile={font}:textfile={limit}:fontsize=20:line_spacing=12:fontcolor=0x9CA397:x=96:y=846"
 else:
  f=build/(name+'-label.txt');f.write_text(labels[name]);vf=f'scale=1536:960:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:80:color=0x191B1D,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=30,drawtext=fontfile={font}:textfile={f}:fontsize=30:fontcolor=0xF5F3ED:x=192:y=27,drawtext=fontfile={mono}:text=SYNTHETIC REHEARSAL:fontsize=17:fontcolor=0xA9ADA3:x=1490:y=38'
 run(['-i',str(video),'-i',str(audio),'-vf',vf,'-af',f'atempo={tempo:.6f},apad','-t',str(duration),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(target)])
 records.append({'id':name,'source':str(video),'duration':duration,'narrationSource':str(audio),'speechTempo':tempo,'fps':24});print('Assembled '+name,flush=True)
if only_scene:
 (build/(only_scene+'-assembly.json')).write_text(json.dumps(records,indent=2));raise SystemExit(0)
concat=build/'concat-redesign.txt';concat.write_text('\n'.join("file '"+str(build/'segments'/(s['id']+'.mp4'))+"'" for s in scenes));raw=build/'redesign-raw.mp4';run(['-f','concat','-safe','0','-i',str(concat),'-c','copy',str(raw)])
probe=subprocess.run(['ffmpeg','-i',str(raw),'-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],text=True,stderr=subprocess.PIPE,stdout=subprocess.DEVNULL,check=True);stats=json.loads(probe.stderr[probe.stderr.rfind('{'):]);(build/'loudness.json').write_text(json.dumps(stats,indent=2));norm=f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
run(['-i',str(raw),'-c:v','copy','-af',norm,'-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(output/'roadstar-demo.mp4')]);(build/'assembly.json').write_text(json.dumps(records,indent=2));print('Film complete',flush=True)
