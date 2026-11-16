import {realpath,stat,readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {PassThrough} from 'node:stream';
function contained(root,path) {
  const rel=relative(root,path);
  return rel!=='' && rel!=='..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}
export function createLocalStorage(root = process.env.VIDEO_ROOT) {
  if(!root || !isAbsolute(root)) throw new Error('VIDEO_ROOT doit être un chemin absolu privé.');
  async function checked(name) {
    if(typeof name!=='string' || name.length>1000 || !/^[a-zA-Z0-9_./-]+$/.test(name) || name.split('/').some(p=>!p || p==='.' || p==='..')) throw new Error('Chemin vidéo invalide.');
    const canonicalRoot=await realpath(root);
    const candidate=resolve(canonicalRoot,name);
    if(!contained(canonicalRoot,candidate)) throw new Error('Accès interdit.');
    const canonicalFile=await realpath(candidate);
    if(!contained(canonicalRoot,canonicalFile)) throw new Error('Accès interdit.');
    const info=await stat(canonicalFile);
    if(!info.isFile()) throw new Error('Fichier vidéo introuvable.');
    return {path:canonicalFile,info};
  }
  return {bucket(){return {file(name){return {
    async getMetadata(){const {info}=await checked(name);return [{size:String(info.size)}];},
    async download(){const {path}=await checked(name);return [await readFile(path)];},
    createReadStream(options={}){
      const output=new PassThrough();
      let input;
      output.on('close',()=>input?.destroy());
      checked(name).then(({path})=>{
        if(output.destroyed)return;
        input=createReadStream(path,options);
        input.on('error',error=>output.destroy(error));
        input.pipe(output);
      }).catch(error=>output.destroy(error));
      return output;
    }
  };}};}};
}
