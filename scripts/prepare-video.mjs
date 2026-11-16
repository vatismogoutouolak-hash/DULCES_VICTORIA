import {mkdir,stat,rename,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve,join} from 'node:path';
const [input,course,lesson,rootArg]=process.argv.slice(2);
if(!input||!['chantilly','creme-au-beurre','gateaux-en-pot'].includes(course)||!/^[a-z0-9-]{1,80}$/.test(lesson||'')||!rootArg){console.error('Usage: node scripts/prepare-video.mjs SOURCE COURSE LESSON PRIVATE_VIDEO_ROOT');process.exit(1);}
const root=resolve(rootArg),target=join(root,'courses',course,lesson),source=resolve(input);
if(!(await stat(source)).isFile())throw new Error('Source must be a regular file');
try{await stat(target);throw new Error('Destination exists; choose a new lesson ID to preserve existing videos');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(join(root,'courses',course),{recursive:true,mode:0o750});
const staging=target+`.staging-${Date.now()}`;
await mkdir(staging,{mode:0o750});
try{
 await new Promise((ok,fail)=>{const p=spawn('ffmpeg',['-nostdin','-hide_banner','-loglevel','warning','-i',source,'-map','0:v:0','-map','0:a:0?','-vf','scale=w=1280:h=720:force_original_aspect_ratio=decrease:force_divisible_by=2','-c:v','libx264','-preset','medium','-crf','23','-maxrate','1800k','-bufsize','3600k','-c:a','aac','-b:a','96k','-ac','2','-force_key_frames','expr:gte(t,n_forced*4)','-f','hls','-hls_time','4','-hls_playlist_type','vod','-hls_segment_filename',join(staging,'seg_%05d.ts'),join(staging,'index.m3u8')],{stdio:['ignore','inherit','inherit']});p.on('error',fail);p.on('close',code=>code===0?ok():fail(new Error(`ffmpeg exit ${code}`)));});
 await rename(staging,target);
 console.log(`Private lesson path: courses/${course}/${lesson}/index.m3u8`);
}catch(e){await rm(staging,{recursive:true,force:true});throw e;}
