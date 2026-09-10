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
for s in scenes:
 name=s['id'];duration=s['targetSeconds'];audio=base/'private-build/audio'/(name+'.wav');video=sources[name];target=build/'segments'/(name+'.mp4')
 with wave.open(str(audio),'rb') as w:ad=w.getnframes()/w.getframerate()
 tempo=ad/(duration-.35)
 if name in ['hook','problem','lineage','proof','close']:vf='fps=24,setsar=1'
 elif name=='driver':
  title=build/'native-title.txt';title.write_text('The driver keeps\nthe work.');sub=build/'native-sub.txt';sub.write_text('One trip. The next action.\nPending work survives restart.');limit=build/'native-limit.txt';limit.write_text('Android emulator verified.\nPhysical background location\nand native iOS remain unverified.')
  vf=f'scale=-2:930,pad=1920:1080:1370:70:color=0x191B1D,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=30,drawtext=fontfile={mono}:text=03 / DRIVER EXECUTION:fontsize=20:fontcolor=0xE65C32:x=96:y=112,drawtext=fontfile={font}:textfile={title}:fontsize=90:line_spacing=10:fontcolor=0xF5F3ED:x=90:y=230,drawtext=fontfile={font}:textfile={sub}:fontsize=32:line_spacing=18:fontcolor=0xC4C7BE:x=96:y=490,drawtext=fontfile={font}:textfile={limit}:fontsize=23:line_spacing=10:fontcolor=0x9CA397:x=96:y=790'
 else:
  f=build/(name+'-label.txt');f.write_text(labels[name]);vf=f'scale=1536:960:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:80:color=0x191B1D,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=30,drawtext=fontfile={font}:textfile={f}:fontsize=30:fontcolor=0xF5F3ED:x=192:y=27,drawtext=fontfile={mono}:text=SYNTHETIC REHEARSAL:fontsize=17:fontcolor=0xA9ADA3:x=1490:y=38'
 run(['-i',str(video),'-i',str(audio),'-vf',vf,'-af',f'atempo={tempo:.6f},apad','-t',str(duration),'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(target)])
 records.append({'id':name,'source':str(video),'duration':duration,'narrationSource':str(audio),'speechTempo':tempo,'fps':24});print('Assembled '+name,flush=True)
concat=build/'concat-redesign.txt';concat.write_text('\n'.join("file '"+str(build/'segments'/(s['id']+'.mp4'))+"'" for s in scenes));raw=build/'redesign-raw.mp4';run(['-f','concat','-safe','0','-i',str(concat),'-c','copy',str(raw)])
probe=subprocess.run(['ffmpeg','-i',str(raw),'-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],text=True,stderr=subprocess.PIPE,stdout=subprocess.DEVNULL,check=True);stats=json.loads(probe.stderr[probe.stderr.rfind('{'):]);(build/'loudness.json').write_text(json.dumps(stats,indent=2));norm=f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
run(['-i',str(raw),'-c:v','copy','-af',norm,'-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',str(output/'roadstar-demo.mp4')]);(build/'assembly.json').write_text(json.dumps(records,indent=2));print('Film complete',flush=True)
