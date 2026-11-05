"use strict";
const $=id=>document.getElementById(id);
const out=$("out"),inp=$("in"),pl=$("pl"),screen=$("screen");
const KEY="browser-terminal-fs-v5";
let P={done:0,unlocked:[]};const PKEY="browser-terminal-progress-v4";const saveP=()=>{try{localStorage.setItem(PKEY,JSON.stringify(P))}catch(e){}};
let root,cwd=[],hist=[],hi=0,mode="shell",readRes=null,abort=false,busy=false;

/* ---------- filesystem ---------- */
const D=()=>({t:"d",c:{}}),F=d=>({t:"f",d});
function seed(){return newSeed()}
function oldSeed(){
  const r=D();
  r.c.programs=D();
  r.c["readme.txt"]=F("Welcome to the sandbox.\n\nEverything you create lives in this browser (localStorage).\nTry:  edit hello.js   then   run hello.js\nType 'help' for commands. 'reset' wipes the disk.\n");
  r.c.programs.c["hello.js"]=F("// Scripts are async JavaScript. Available: print, write, read, sleep, clear, fs\nconst name = await read('Your name? ');\nprint('Hello, ' + (name || 'stranger') + '!');\nfor (let i = 3; i > 0; i--) { write(i + '... '); await sleep(400); }\nprint('liftoff');\n");
  r.c.programs.c["guess.js"]=F("const n = 1 + Math.floor(Math.random() * 20);\nlet tries = 0;\nprint('I am thinking of a number from 1 to 20.');\nwhile (true) {\n  const g = parseInt(await read('guess> '), 10);\n  tries++;\n  if (g === n) { print('Got it in ' + tries + '!'); break; }\n  print(g < n ? 'higher' : 'lower');\n}\n");
  r.c.programs.c["files.js"]=F("// Scripts can use the filesystem too\nfs.write('/notes.txt', 'written by files.js at ' + new Date().toLocaleTimeString() + '\\n');\nprint('Wrote /notes.txt. Contents of / :');\nprint(fs.list('/').join('  '));\n");
  return r;
}
function load(){try{const s=localStorage.getItem(KEY);if(s)return JSON.parse(s)}catch(e){}return seed()}
function save(){try{localStorage.setItem(KEY,JSON.stringify(root))}catch(e){}}
function parts(p){p=String(p).replace(/\\/g,"/").replace(/^[A-Za-z]:/,"");p=p.replace(/^\/Users(?=\/|$)/i,"/home");if(p==="~"||p.startsWith("~/"))p="/home/intern"+p.slice(1);const b=p.startsWith("/")?[]:[...cwd];for(const s of p.split("/")){if(!s||s===".")continue;if(s==="..")b.pop();else b.push(s)}return b}
function get(ps){let n=root;for(const s of ps){if(n.t!=="d"||!n.c[s])return null;n=n.c[s];if(n.lock&&!P.unlocked.includes(n.lock))throw new Error("permission denied: /"+s+" is locked (see 'login')")}return n}
const path=ps=>"/"+ps.join("/");
function parentOf(p){const ps=parts(p);const name=ps.pop();const par=get(ps);return{par,name}}
const fsApi={
  read:p=>{const n=get(parts(p));if(!n||n.t!=="f")throw new Error("no such file: "+p);return n.d},
  write:(p,t)=>{const{par,name}=parentOf(p);if(!par||par.t!=="d"||!name)throw new Error("bad path: "+p);if(par.c[name]&&par.c[name].t==="d")throw new Error("is a directory: "+p);par.c[name]=F(String(t));save()},
  list:p=>{const n=get(parts(p||"/"));if(!n||n.t!=="d")throw new Error("not a directory");return Object.keys(n.c).sort().map(k=>k+(n.c[k].t==="d"?"/":""))}
};

/* ---------- output ---------- */
function print(text="",cls=""){
  String(text).split("\n").forEach(l=>{const d=document.createElement("div");d.className="ln "+cls;d.textContent=l;out.appendChild(d)});
  screen.scrollTop=screen.scrollHeight;
}
let partial=null;
function write(text){
  String(text).split("\n").forEach((s,i)=>{
    if(i>0)partial=null;
    if(!s)return;
    if(!partial){partial=document.createElement("div");partial.className="ln";out.appendChild(partial)}
    partial.textContent+=s;
  });
  screen.scrollTop=screen.scrollHeight;
}
function setPrompt(s){pl.textContent=s;$("cwdv").textContent=path(cwd)+"  ·  mission "+Math.min(P.done+1,M.length)+"/"+M.length}
const shellPrompt=()=>{const p=path(cwd);setPrompt("PS "+toWin(p||"/")+"> ")};
const sleep=ms=>new Promise((res,rej)=>setTimeout(()=>abort?rej(new Error("terminated")):res(),ms));
function read(prompt=""){
  return new Promise((res,rej)=>{
    if(abort)return rej(new Error("terminated"));
    partial=null;mode="read";setPrompt(prompt);readRes={res,rej,prompt};inp.focus();
  });
}

/* ---------- commands ---------- */
const C={};
C.help=o=>o(["Commands:",
"  ls [dir]            list files        cd <dir>          change directory",
"  pwd                 print directory   tree [dir]        show everything",
"  cat <file>          show a file       edit <file>       open the editor",
"  mkdir <dir>         make a directory  touch <file>      create empty file",
"  rm <path>           delete            mv <a> <b>        move or rename",
"  cp <a> <b>          copy a file       echo <text>       print (supports > and >>)",
"  run <file.js>       run a script      <name>            runs programs/<name>.js too",
"  clear  history  date  theme [light|dark]  reset","","Hacking tools:","  mission  hint  submit <answer>   your task, a nudge, and your answer","  ls -a               show hidden files   grep [-c] <text> <file>   search a file","  decode base64|rot13 <text>      login <user> <password>","  find <name>  head  tail  sort  uniq [-c]  wc      (all accept piped input)","  cmd1 | cmd2         pipe output along      ls -R / or Get-ChildItem -Recurse /","PowerShell names work too: Get-ChildItem, Get-Content, Select-String, Set-Location...","Scripts: edit a .js file, then run it. See ~/scripts/template.js",
"","Ctrl+C stops a running script. Tab completes names. Up/Down browse history."].join("\n"));
C.ls=(a,o)=>{const lf=a.map(x=>x.toLowerCase());const all=lf.includes("-a")||lf.includes("-force");const rec=lf.includes("-r")||lf.includes("-recurse");a=a.filter(x=>x[0]!=="-");if(rec){walkPaths(a[0]||".",all).forEach(p=>o(p));return}const n=get(parts(a[0]||"."));if(!n)throw new Error("no such directory");if(n.t==="f")return o(a[0]);
  const ks=Object.keys(n.c).filter(k=>all||k[0]!==".").sort();ks.length?o(ks.map(k=>n.c[k].t==="d"?k+"/":k).join("  ")):0};
C.pwd=(a,o)=>o(path(cwd)||"/");
C.cd=a=>{const ps=parts(a[0]||"~");const n=get(ps);if(!n||n.t!=="d")throw new Error("not a directory: "+(a[0]||""));cwd=ps};
C.cat=(a,o)=>{if(!a[0])throw new Error("usage: cat <file>");const t=fsApi.read(a[0]);o(t.replace(/\n$/,""))};
C.mkdir=a=>{if(!a[0])throw new Error("usage: mkdir <dir>");const{par,name}=parentOf(a[0]);if(!par||!name)throw new Error("bad path");if(par.c[name])throw new Error("already exists");par.c[name]=D();save()};
C.touch=a=>{if(!a[0])throw new Error("usage: touch <file>");const n=get(parts(a[0]));if(!n)fsApi.write(a[0],"")};
C.rm=a=>{if(!a[0])throw new Error("usage: rm <path>");const{par,name}=parentOf(a[0]);if(!par||!par.c[name])throw new Error("no such file or directory");delete par.c[name];save()};
C.mv=a=>{if(a.length<2)throw new Error("usage: mv <from> <to>");const s=parentOf(a[0]);if(!s.par||!s.par.c[s.name])throw new Error("no such file");let d=parentOf(a[1]);const dn=get(parts(a[1]));
  if(dn&&dn.t==="d")d={par:dn,name:s.name};if(!d.par||d.par.t!=="d")throw new Error("bad destination");d.par.c[d.name]=s.par.c[s.name];if(d.par!==s.par||d.name!==s.name)delete s.par.c[s.name];save()};
C.cp=a=>{if(a.length<2)throw new Error("usage: cp <from> <to>");const n=get(parts(a[0]));if(!n||n.t!=="f")throw new Error("can only copy files");const dn=get(parts(a[1]));fsApi.write(dn&&dn.t==="d"?a[1]+"/"+parts(a[0]).pop():a[1],n.d)};
C.echo=(a,o)=>o(a.join(" "));
C.clear=()=>{out.textContent="";partial=null};
C.history=(a,o)=>o(hist.map((h,i)=>(i+1)+"  "+h).join("\n"));
C.date=(a,o)=>o(new Date().toString());
C.theme=(a,o)=>{const t=a[0];if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;else o("usage: theme light|dark")};
C.reset=async a=>{if(a[0]!=="-y"){const r=await read("Wipe the whole disk? (y/N) ");if(!/^y/i.test(r))return}root=seed();cwd=["home","intern"];P={done:0,unlocked:[]};saveP();save();print("Disk reset. Missions restarted.","ok")};
C.tree=(a,o)=>{const start=get(parts(a[0]||"."));if(!start||start.t!=="d")throw new Error("not a directory");
  const walk=(n,pre)=>{const ks=Object.keys(n.c).filter(k=>k[0]!==".").sort();ks.forEach((k,i)=>{const last=i===ks.length-1;o(pre+(last?"└─ ":"├─ ")+k+(n.c[k].t==="d"?"/":""));if(n.c[k].t==="d")walk(n.c[k],pre+(last?"   ":"│  "))})};o(path(parts(a[0]||".")) );walk(start,"")};
C.edit=a=>new Promise(res=>{
  if(!a[0])throw new Error("usage: edit <file>");
  const n=get(parts(a[0]));if(n&&n.t==="d")throw new Error("is a directory");
  const ta=$("edta"),ed=$("ed");ta.value=n?n.d:"";$("edname").textContent=path(parts(a[0]));ed.classList.add("on");ta.focus();
  const close=()=>{ed.classList.remove("on");ta.onkeydown=null;$("edsave").onclick=$("edquit").onclick=null;inp.focus();res()};
  const doSave=()=>{try{fsApi.write(a[0],ta.value);$("edname").textContent=path(parts(a[0]))+"  (saved)"}catch(e){$("edname").textContent=e.message}};
  ta.onkeydown=e=>{
    if((e.ctrlKey||e.metaKey)&&e.key==="s"){e.preventDefault();doSave()}
    else if(e.key==="Escape"){close()}
    else if(e.key==="Tab"){e.preventDefault();const s=ta.selectionStart;ta.setRangeText("  ",s,ta.selectionEnd,"end")}
  };
  $("edsave").onclick=doSave;$("edquit").onclick=close;
});
C.run=async a=>{
  if(!a[0])throw new Error("usage: run <file.js>");
  const code=fsApi.read(a[0]);
  const AF=Object.getPrototypeOf(async function(){}).constructor;
  let fn;
  try{fn=new AF("print","write","read","sleep","clear","fs","args",code)}catch(e){throw new Error((e instanceof SyntaxError?"syntax error: ":"this page's host blocks running scripts: ")+e.message)}
  abort=false;
  try{await fn((...x)=>print(x.join(" ")),write,read,sleep,C.clear,fsApi,a.slice(1))}
  catch(e){partial=null;if(e.message==="terminated")print("Terminated.","err");else print(e.name+": "+e.message,"err")}
};

function newSeed(){
  const r=D(),i=D(),lg=D(),v=D(),old=D();
  r.c.home=D();r.c.home.c.intern=i;r.c.var=D();r.c.var.c.log=lg;r.c.vault=v;v.lock="vault";
  i.c.README=F("ORION-7 :: authorized security assessment\n\nFrom: Dana Okafor, Halyard Security\nWelcome aboard, intern. Orion Logistics hired us to test ORION-7, their file server.\nYour account is low-privilege, so you see what any employee would see.\nStay in scope, keep notes, and ask me ('hint') when you are stuck.\n\nType 'mission' for your task and 'hint' if you are stuck.\nFlags look like FLAG{...} and are sent with: submit <flag>\n\nYour first flag:  FLAG{recon_starts_with_looking}\n");
  i.c[".todo"]=F("TODO (admin): delete old notes from the intern account.\nThe auth log lives in /var/log. Review it weekly (never happens).\n\nFLAG{dotfiles_hide_in_plain_sight}\n");
  i.c.old=old;addExtra(r,i);
  old.c["passwords.txt"]=F("vault password (encoded so nobody can read it):\ndGVhbHdvbGY5OQ==\n");
  lg.c["auth.log"]=F([
    "Nov 03 02:10:41 sshd: Accepted password for admin from 10.0.0.12",
    "Nov 03 02:14:51 sshd: FAILED login for root from 203.0.113.45",
    "Nov 03 02:14:53 sshd: FAILED login for admin from 203.0.113.45",
    "Nov 03 02:15:02 sshd: FAILED login for guest from 198.51.100.7",
    "Nov 03 02:15:09 sshd: FAILED login for root from 203.0.113.45",
    "Nov 03 02:15:11 sshd: FAILED login for vault from 203.0.113.45",
    "Nov 03 02:15:14 sshd: FAILED login for vault from 203.0.113.45",
    "Nov 03 02:15:20 sshd: Accepted password for intern from 10.0.0.31",
    "Nov 03 02:15:23 sshd: FAILED login for admin from 203.0.113.45",
    "Nov 03 02:15:31 sshd: Accepted password for vault from 203.0.113.45"].join("\n")+"\n");
  v.c["flag.txt"]=F("ACCESS RECORD (auto-generated)\n  02:15:31  user 'vault' logged in from 203.0.113.45\n  02:16:04  copied customers.db (48,112 records)\n  02:16:09  copied payroll.csv\n  02:16:40  session closed\n\nThis was NOT you. This was before the test began.\n\nFLAG{encoding_is_not_encryption}\n");
  return r;
}
const M_OLD=[
 {t:"Recon",d:"Look around your home folder (ls) and read the README (cat README). Submit the flag inside.",h:"ls shows files. cat README prints one.",a:x=>x==="FLAG{recon_starts_with_looking}",win:"Recon is just careful looking. Real assessments start the same way."},
 {t:"Hidden things",d:"An admin left a flag in a file that plain ls does not show. Find it.",h:"Files starting with a dot are hidden. Try ls -a",a:x=>x==="FLAG{dotfiles_hide_in_plain_sight}",win:"Hidden is not secret. Dotfiles just skip the default view, so never rely on that to protect anything."},
 {t:"Read the logs",d:"Someone has been guessing passwords. Read /var/log/auth.log and submit the IP address with the most FAILED logins.",h:"grep FAILED /var/log/auth.log lists failures. grep -c counts matching lines. Look for an address that repeats.",a:x=>x==="203.0.113.45",win:"Many failures, then a success from the same address: that is a brute-force attack. Defenders respond with lockouts, rate limits, and alerts."},
 {t:"Encoded is not encrypted",d:"An old file in your home folder holds an 'encoded' vault password. Decode it, unlock the vault with login, and submit the flag inside.",h:"tree shows folders. cat the file, then: decode base64 <text>, then: login vault <password>, then cd /vault.",a:x=>x==="FLAG{encoding_is_not_encryption}",win:"Base64 is a format, not a lock: anyone reverses it in one command. Real secrets belong in a password manager or secrets vault, never a text file."}
];
C.mission=(a,o)=>{if(P.done>=M.length)return o("All missions complete. Type 'reset' to play again.");const m=M[P.done];o("Mission "+(P.done+1)+"/"+M.length+": "+m.t+"\n"+m.d)};
C.hint=(a,o)=>{if(P.done>=M.length)return o("Nothing left to hint at.");o("Dana: "+M[P.done].h)};
C.submit=(a,o)=>{if(P.done>=M.length)return o("You already finished.");const m=M[P.done];if(!m.a(a.join(" ").trim()))throw new Error("Not it. Check your work or try 'hint'.");
  P.done++;saveP();print("Correct!","ok");print(m.win);
  if(P.done<M.length)print("\nNext: type 'mission'.","dim");
  else print("\nAssessment complete. Findings for the report:\n 1. Weak, reusable credentials\n 2. No lockout on repeated failed logins\n 3. Passwords stored 'encoded' in plain files\nNice work, intern.","ok")};
C.grep=(a,o,i)=>{let c=false;if(a[0]==="-c"){c=true;a=a.slice(1)}if(a.length<1)throw new Error("usage: grep [-c] <text> <file>");const hits=(a[1]?fsApi.read(a[1]):String(i||"")).split("\n").filter(l=>l.includes(a[0]));if(c)o(String(hits.length));else hits.forEach(l=>o(l))};
C.decode=(a,o)=>{const k=a[0],t=a.slice(1).join(" ");if(k==="base64"){try{o(atob(t))}catch(e){throw new Error("not valid base64")}}else if(k==="rot13")o(t.replace(/[a-z]/gi,c=>String.fromCharCode((c<="Z"?90:122)>=(c=c.charCodeAt(0)+13)?c:c-26)));else throw new Error("usage: decode base64|rot13 <text>")};
C.login=(a,o)=>{if(a.length<2)throw new Error("usage: login <user> <password>");if(a[0]==="vault"&&a[1]==="tealwolf99"){if(!P.unlocked.includes("vault")){P.unlocked.push("vault");saveP()}o("Access granted. /vault is now unlocked.")}else throw new Error("login failed for "+a[0])};
const ALIAS={"get-childitem":"ls","gci":"ls","dir":"ls","get-content":"cat","gc":"cat","type":"cat","select-string":"grep","sls":"grep","set-location":"cd","sl":"cd","get-location":"pwd","write-output":"echo","write-host":"echo","remove-item":"rm","copy-item":"cp","move-item":"mv","clear-host":"clear","cls":"clear","measure-object":"wc","get-date":"date","sort-object":"sort"};
const norm=c=>c?(ALIAS[c.toLowerCase()]||(Object.hasOwn(C,c.toLowerCase())?c.toLowerCase():c)):c;
function walkPaths(p,all){const res=[];const w=(n,ps)=>{for(const k of Object.keys(n.c).sort()){if(!all&&k[0]===".")continue;const q=[...ps,k],c=n.c[k];res.push(path(q)+(c.t==="d"?"/":""));if(c.t==="d"&&!(c.lock&&!P.unlocked.includes(c.lock)))w(c,q)}};const base=parts(p),n=get(base);if(!n||n.t!=="d")throw new Error("not a directory");w(n,base);return res}
C.find=(a,o)=>{if(!a[0])throw new Error("usage: find <name part>");walkPaths("/",true).filter(p=>p.split("/").filter(Boolean).pop().toLowerCase().includes(a[0].toLowerCase())).forEach(p=>o(p))};
const lines=s=>{const l=String(s||"").split("\n");if(l[l.length-1]==="")l.pop();return l};
const src=(a,i)=>{const f=a.find(x=>x[0]!=="-"&&isNaN(x));return f?fsApi.read(f):String(i||"")};
const num=(a,d)=>{const k=a.indexOf("-n");if(k>=0&&a[k+1])return parseInt(a[k+1],10)||d;const m=a.find(x=>/^-\d+$/.test(x));return m?-parseInt(m,10):d};
C.wc=(a,o,i)=>o(String(lines(src(a,i)).length));
C.head=(a,o,i)=>lines(src(a,i)).slice(0,num(a,10)).forEach(l=>o(l));
C.tail=(a,o,i)=>lines(src(a,i)).slice(-num(a,10)).forEach(l=>o(l));
C.sort=(a,o,i)=>{const l=lines(src(a,i)).sort();(a.includes("-r")?l.reverse():l).forEach(x=>o(x))};
C.uniq=(a,o,i)=>{const r=[];for(const x of lines(src(a,i))){if(r.length&&r[r.length-1][0]===x)r[r.length-1][1]++;else r.push([x,1])}r.forEach(([x,n])=>o(a.includes("-c")?String(n).padStart(4)+" "+x:x))};
function addExtra(r,i){const s=D(),b=D(),y=D(),sc=D();r.c.srv=s;s.c.backups=b;b.c["2024"]=y;
  y.c["backup-key.txt"]=F("Old backup key. Nobody remembers why this is here.\n\nFLAG{verb_noun_same_ideas}\n");
  sc.c["template.js"]=F("// A script is just commands saved in a file. Run it with: run scripts/template.js\n// Inside a script you have: print, read, sleep, fs, and normal JavaScript.\nconst text = fs.read('/var/log/auth.log');\nconst lines = text.split('\\n');\nprint('lines in the log: ' + lines.length);\n// Next step: lines.filter(l => l.includes('FAILED')).length\n");
  i.c.scripts=sc;addStory(r,i);addPS(r,i)}
const M_V2=[
 {t:"Where am I?",d:"Every computer stores files in a tree of folders. pwd shows where you are, ls lists what is here, cd moves, cat reads a file.\nRead the README in your home folder and submit the flag inside.",h:"ls, then cat README.",a:x=>x==="FLAG{recon_starts_with_looking}",win:"The terminal is just a way to ask the computer questions. pwd, ls, cd, cat cover most of what you do day to day."},
 {t:"Hidden files",d:"Some files start with a dot and are skipped by plain ls. An admin left a flag in one in your home folder.",h:"ls -a shows hidden files (PowerShell: Get-ChildItem -Force).",a:x=>x==="FLAG{dotfiles_hide_in_plain_sight}",win:"Hidden is not secret. Config files are usually dotfiles, so knowing ls -a is essential."},
 {t:"Search, do not scroll",d:"Someone keeps guessing passwords. grep prints only lines containing some text. Search /var/log/auth.log for FAILED logins and submit the IP address that appears most.",h:"grep FAILED /var/log/auth.log (PowerShell: Select-String FAILED /var/log/auth.log)",a:x=>x==="203.0.113.45",win:"grep is the first tool people reach for in logs. That pattern, many failures then a success, is a brute-force attack."},
 {t:"Pipes",d:"The | symbol sends one command's output into the next, like a conveyor belt. How many FAILED login attempts came from that IP? Submit the number.",h:"Chain greps, then count with wc: grep A file | grep B | wc",a:x=>x==="6",win:"Small tools plus pipes beat big programs. This one idea is the heart of effective terminal use, in Linux and PowerShell alike."},
 {t:"Save your work",d:"> sends output into a file instead of the screen. Save only the FAILED lines of the auth log into /home/intern/failed.txt, then type: submit done",h:"grep FAILED /var/log/auth.log > failed.txt  (>> appends instead of overwriting)",a:()=>{try{const l=lines(fsApi.read("/home/intern/failed.txt"));return l.length===7&&l.every(s=>s.includes("FAILED"))}catch(e){return false}},win:"Redirects turn one-off answers into evidence you can keep. > overwrites, >> appends."},
 {t:"Two dialects",d:"A file called backup-key.txt is somewhere on this disk. Linux says find, PowerShell says Get-ChildItem -Recurse. Both work here. Find it, read it, submit the flag.",h:"find backup, or: Get-ChildItem -Recurse / | Select-String backup",a:x=>x==="FLAG{verb_noun_same_ideas}",win:"PowerShell uses Verb-Noun names (Get-Content, Set-Location) with short aliases, but it is the same ideas: list, read, search, pipe."},
 {t:"Encoded is not encrypted",d:"An old file in your home folder holds an 'encoded' vault password. Decode it, unlock the vault with login, and submit the flag inside.",h:"tree, cat the file, decode base64 <text>, login vault <password>, then cat /vault/flag.txt",a:x=>x==="FLAG{encoding_is_not_encryption}",win:"Base64 is a format, not a lock. Real secrets belong in a password manager or secrets vault, never a text file."},
 {t:"Write a script",d:"A script is commands saved in a file so you never retype them. Look at scripts/template.js, then create report.js in your home folder that counts the FAILED lines in the log and prints the number. Run it, then submit the number.",h:"edit report.js, then run report.js. lines.filter(l => l.includes('FAILED')).length",a:x=>{try{return x==="7"&&/fs\.read/.test(fsApi.read("/home/intern/report.js"))}catch(e){return false}},win:"You automated an analysis. Any task you do twice is a candidate for a script, in PowerShell, bash, or JavaScript."}
];
const M=[
 {t:"Where am I?",d:"Dana wants you to get your bearings. Every computer stores files in a tree of folders. pwd shows where you are, ls lists what is here, cd moves, cat reads a file.\nRead the README in your home folder and submit the flag inside.",h:"ls, then cat README.",a:x=>x==="FLAG{recon_starts_with_looking}",win:"Dana: Good. Knowing where you stand is step one. Marcus, their sysadmin, was supposed to clean this account up before we arrived. Let's see if he did.\n\nLesson: pwd, ls, cd, cat cover most daily terminal use."},
 {t:"Hidden files",d:"Marcus has been sloppy before. Some files start with a dot and are skipped by plain ls. Find the flag in the one in your home folder.",h:"ls -a shows hidden files (PowerShell: Get-ChildItem -Force).",a:x=>x==="FLAG{dotfiles_hide_in_plain_sight}",win:"Dana: He hid his notes instead of deleting them. Typical. The client also said last night's logs looked strange. Check /var/log/auth.log.\n\nLesson: hidden is not secret. Config files are dotfiles, so ls -a matters."},
 {t:"Search, do not scroll",d:"Dana wants to know who has been guessing passwords. grep prints only lines containing some text. Search /var/log/auth.log for FAILED logins and submit the IP address that appears most.",h:"grep FAILED /var/log/auth.log (PowerShell: Select-String FAILED /var/log/auth.log)",a:x=>x==="203.0.113.45",win:"Dana: 203.0.113.45. That address is not on the client's network list. Odd. How many times did it try?\n\nLesson: grep is the first tool people reach for in logs."},
 {t:"Pipes",d:"The | symbol sends one command's output into the next, like a conveyor belt. How many FAILED login attempts came from that IP? Submit the number.",h:"Chain greps, then count with wc: grep A file | grep B | wc",a:x=>x==="6",win:"Dana: Six failures, then look at the last log line: a successful login as 'vault'. We have not even started attacking anything. Someone got in before us.\nDana: Do not touch anything yet. Preserve the evidence.\n\nLesson: small tools plus pipes beat big programs, in Linux and PowerShell alike."},
 {t:"Save your work",d:"Evidence you cannot reproduce is worthless. > sends output into a file instead of the screen. Save only the FAILED lines into /home/intern/failed.txt, then type: submit done",h:"grep FAILED /var/log/auth.log > failed.txt  (>> appends instead of overwriting)",a:()=>{try{const l=lines(fsApi.read("/home/intern/failed.txt"));return l.length===7&&l.every(s=>s.includes("FAILED"))}catch(e){return false}},win:"Dana: Saved. Now we need to know what they reached. The vault is locked, but Marcus keeps backup keys everywhere. One is called backup-key.txt.\n\nLesson: > overwrites, >> appends."},
 {t:"Two dialects",d:"Find backup-key.txt anywhere on the disk. Linux says find, PowerShell says Get-ChildItem -Recurse. Both work here. Read the file and submit the flag.",h:"find backup, or: Get-ChildItem -Recurse / | Select-String backup",a:x=>x==="FLAG{verb_noun_same_ideas}",win:"Dana: That key opens nothing, but it tells me how Marcus stores secrets: carelessly. Look for his password notes in your home folder.\n\nLesson: PowerShell uses Verb-Noun names with short aliases, but it is the same ideas: list, read, search, pipe."},
 {t:"Encoded is not encrypted",d:"A file in your home folder holds an 'encoded' vault password. Decode it, unlock the vault with login, and submit the flag inside. Read everything in there.",h:"tree, cat the file, decode base64 <text>, login vault <password>, then cat /vault/flag.txt",a:x=>x==="FLAG{encoding_is_not_encryption}",win:"Dana: There it is. The attacker copied 48,112 customer records and the payroll file at 2:16 AM, using the password Marcus 'protected' with base64. This is a confirmed breach. We have to tell the client today.\n\nLesson: base64 is a format, not a lock. Real secrets belong in a password manager or vault."},
 {t:"Write a script",d:"Dana needs this in the final report, and the client will want to rerun it. Look at scripts/template.js, then create report.js in your home folder that counts the FAILED lines in the log and prints the number. Run it, then submit the number.",h:"edit report.js, then run report.js. lines.filter(l => l.includes('FAILED')).length",a:x=>{try{return x==="7"&&/fs\.read/.test(fsApi.read("/home/intern/report.js"))}catch(e){return false}},win:"Dana: Report done. We came in to run a test and ended up catching a real breach hours before their own team would have. Orion is calling an emergency meeting.\nDana: Marcus is going to have a long week. You, on the other hand, just got your first real case under your belt. Welcome to Halyard.\n\nLesson: any task you do twice is a candidate for a script."}
];
function addStory(r,i){const m=D();i.c.mail=m;
  m.c["from_marcus.txt"]=F("From: Marcus Reyes (IT)\nTo: Priya Nair\nDate: Oct 29\n\nPriya, you asked where the vault password lives. It is in my old notes on the intern account, in the old/ folder.\nI base64'd it so it is safe :) Please do not share it. The auditors would have my head.\n");
  m.c["from_priya.txt"]=F("From: Priya Nair (Finance)\nTo: Marcus Reyes\nDate: Oct 30\n\nThanks. The Brightline negotiation is sensitive, so please keep the payroll files locked down.\nI will be working very late on Saturday for the audit, so do not wait up.\n");
  r.c.srv.c.docs=D();
  r.c.srv.c.docs.c["network.txt"]=F("ORION NETWORK MAP (staff copy)\n10.0.0.0/24        staff LAN\n10.0.1.0/24        warehouse scanners\n203.0.113.50       vpn-gateway\n203.0.113.45       lobby-guest-wifi  (public NAT, no login needed)\n\nNOTE: guest wifi is not on the staff allowlist, yet it can reach this file server.\nTicket open since March. Low priority. -M\n");
  r.c.var.c.log.c["badge.log"]=F([
   "Nov 02 18:02 OUT     m.reyes",
   "Nov 02 18:40 OUT     j.alvarez",
   "Nov 03 01:38 IN      p.nair",
   "Nov 03 01:41 VISITOR V-212 signed in: J. Pike, Brightline Freight (host: p.nair)",
   "Nov 03 02:19 VISITOR V-212 signed out",
   "Nov 03 02:24 OUT     p.nair",
   "Nov 03 07:55 IN      m.reyes"].join("\n")+"\n")}
M[6].win="Dana: There it is. At 2:16 AM someone copied 48,112 customer records and the payroll file, using the password Marcus 'protected' with base64. This is a confirmed breach.\nDana: But look at the log again. They tried root, admin and guest, then went straight to 'vault'. Brute force does not do that. They knew which account to hit. Who was this really?\n\nLesson: base64 is a format, not a lock. Real secrets belong in a password manager or vault.";
M.splice(7,0,
 {t:"Follow the address",d:"Every IP address belongs to something. Somewhere on this server is a network map. Find it, work out what 203.0.113.45 actually is, and submit its name.",h:"find network, then grep the IP in that file.",a:x=>/lobby/i.test(x),win:"Dana: The lobby guest Wi-Fi. The 'hacker' was not overseas. They were physically inside the building, on a network that should never reach the file server. Someone was there at 2 AM.\nDana: Orion keeps badge records. Check who was in the building.\n\nLesson: an IP address is a clue, not an answer. Cross-checking sources turns logs into a story."},
 {t:"Who was in the building?",d:"The badge log is in /var/log. Look at the early-morning entries of Nov 03 and submit the surname of the Orion employee who was there.",h:"grep 'Nov 03' /var/log/badge.log shows that night. Who signed a visitor in?",a:x=>/nair/i.test(x),win:"Dana: Priya Nair, the finance director, signed in J. Pike of Brightline Freight at 1:41 AM. Brightline is a competitor. Marcus's email told her exactly where the vault password was. She sat in the lobby, opened the vault, and Pike copied the files.\nDana: Marcus was careless. Priya was the one who did it. We go straight to the CEO, not through Priya.\n\nLesson: security is people and process, not just passwords. Matching logs from different systems by time solves cases."}
);
M[9].win="Dana: Report filed. We showed up for a routine test and caught an insider sale of customer data, hours before their own team would have noticed. The CEO has called in lawyers and locked Priya's accounts.\nDana: Marcus keeps his job, with a password manager and a long talk about guest Wi-Fi. You found it all with ls, grep, pipes and a script. Welcome to Halyard.\n\nLesson: any task you do twice is a candidate for a script.";
["a flag like FLAG{...}","a flag like FLAG{...}","an IP address","a number","the word: done","a flag like FLAG{...}","a flag like FLAG{...}","the name of the network (a single word is fine)","a surname","a number"].forEach((f,i)=>M[i].f=f);
function showMission(){const m=M[P.done];print("── Mission "+(P.done+1)+" of "+M.length+": "+m.t+" ──","pr");print(m.d);print("Submit "+m.f+" with: submit <answer>   ·   hint for help","dim")}
function finale(){print("════ CASE CLOSED ════","pr");print("Findings for Orion's report:\n 1. Passwords stored 'encoded' in a plain file (base64 is not encryption)\n 2. Guest Wi-Fi could reach the file server\n 3. After-hours visitor and vault login raised no alert\n 4. Marcus's emails spread the vault's location\n\nSkills you used: navigating, hidden files, grep, pipes, redirects, find, PowerShell aliases, decoding, and a script.\nThe sandbox is still yours: keep exploring, or type 'reset' to replay.","ok")}
C.mission=()=>{P.done>=M.length?finale():showMission()};
C.submit=a=>{if(P.done>=M.length)return finale();const m=M[P.done],ans=a.join(" ").trim();
  if(!ans)throw new Error("usage: submit <answer>   (this mission wants "+m.f+")");
  if(!m.a(ans))throw new Error("Not it. This mission wants "+m.f+". Re-read the mission or type 'hint'.");
  P.done++;saveP();print("✔ Correct","ok");print("");print(m.win);print("");
  if(P.done<M.length)showMission();else finale()};
C.help=(a,o)=>o(["How to play: read your mission, explore with commands, send answers with: submit <answer>","","Look around    pwd  ls [-a]  cd <dir>  tree  find <name>","Read & search  cat <file>  grep [-c] <text> <file>  head  tail  wc  sort  uniq [-c]","Pipes & saving cmd1 | cmd2     cmd > file     cmd >> file","Files          edit <file>  touch  mkdir  rm  mv  cp  echo","Tools          decode base64|rot13 <text>   login <user> <password>   run <script.js>","Game           mission  hint  submit <answer>  reset  theme light|dark","PowerShell     Get-ChildItem  Get-Content  Select-String  Set-Location ... also work","Keys           Tab completes  ·  Up/Down history  ·  Ctrl+C stops  ·  Ctrl+L clears"].join("\n"));
async function exec2(line){
  const stages=line.split(/\|(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/);
  if(stages.length<2)return exec(line);
  busy=true;abort=false;let data="";
  try{for(let s=0;s<stages.length;s++){
    let st=stages[s].trim(),redir=null;const last=s===stages.length-1;
    if(last){const m=st.match(/^(.*?)\s*(>>?)\s*(\S+)$/);if(m){st=m[1];redir={ap:m[2]===">>",f:m[3]}}}
    const toks=[...st.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(x=>x[1]??x[2]??x[3]);
    const cmd=norm(toks.shift());
    if(!Object.hasOwn(C,cmd))throw new Error("unknown command in pipe: "+cmd);
    const buf=[];await C[cmd](toks,t=>buf.push(t),data);data=buf.join("\n");
    if(last){if(redir)fsApi.write(redir.f,redir.ap?(get(parts(redir.f))?.d||"")+data+"\n":data+"\n");else if(data)print(data)}
  }}catch(e){print(e.message,"err")}
  busy=false}
/* ===== PowerShell-style engine (objects, variables, foreach/if, .ps1) ===== */
const G=new Map(),lc=s=>String(s).toLowerCase(),arr=v=>v==null?[]:Array.isArray(v)?v:[v];
const truthy=v=>Array.isArray(v)?v.length>0:!!v&&v!=="0";
const fv=v=>v==null?"":Array.isArray(v)?v.map(fv).join(" "):typeof v==="boolean"?(v?"True":"False"):typeof v==="number"?String(Math.round(v*100)/100):String(v);
const like=(x,p)=>new RegExp("^"+String(p).replace(/[.+^${}()|[\]\\]/g,"\\$&").replace(/\*/g,".*").replace(/\?/g,".")+"$","i").test(String(x));
const PA={gps:"get-process",ps:"get-process",gsv:"get-service",gci:"get-childitem",ls:"get-childitem",dir:"get-childitem",gc:"get-content",cat:"get-content",type:"get-content",sls:"select-string",where:"where-object","?":"where-object",foreach:"foreach-object","%":"foreach-object",select:"select-object",sort:"sort-object",measure:"measure-object",echo:"write-output"};
const procs=()=>[{Id:4,ProcessName:"System",CPU:12.4,Handles:1840},{Id:312,ProcessName:"explorer",CPU:45.1,Handles:2210},{Id:688,ProcessName:"sshd",CPU:3.2,Handles:310},{Id:904,ProcessName:"backup-agent",CPU:8.7,Handles:420},{Id:1337,ProcessName:"svc-upd",CPU:912.6,Handles:96},{Id:1520,ProcessName:"notepad",CPU:0.4,Handles:180},{Id:2210,ProcessName:"chrome",CPU:150.3,Handles:1500}];
const svcs=()=>[{Status:"Running",Name:"Spooler",DisplayName:"Print Spooler"},{Status:"Running",Name:"sshd",DisplayName:"OpenSSH Server"},{Status:"Stopped",Name:"WinDefend",DisplayName:"Windows Defender Antivirus"},{Status:"Running",Name:"BackupAgent",DisplayName:"Orion Backup Agent"}];
function toWin(p){return p.startsWith("/home")?"C:\\Users"+p.slice(5).replace(/\//g,"\\"):"C:"+(p==="/"?"\\":p.replace(/\//g,"\\"))}
function prop(v,n){if(v==null)return null;const k=lc(n);if(Array.isArray(v))return k==="count"||k==="length"?v.length:v.map(x=>prop(x,n));if(typeof v==="string")return k==="length"?v.length:null;if(typeof v==="object"){const key=Object.getOwnPropertyNames(v).find(x=>lc(x)===k);return key?v[key]:null}return null}
function mt(s,i,o,c){let d=0,q=null;for(;i<s.length;i++){const ch=s[i];if(q){if(ch===q)q=null;continue}if(ch==='"'||ch==="'"){q=ch;continue}if(ch===o)d++;else if(ch===c&&--d===0)return i}throw new Error("missing closing '"+c+"'")}
function tok(s){const r=[],re=/\s*(?:("(?:[^"`]|`.)*")|('[^']*')|(\$\w+)|(\d+(?:\.\d+)?)|(-[A-Za-z]+)|([A-Za-z_][\w-]*)|(\S))/y;let m;while(re.lastIndex<s.length&&(m=re.exec(s))){const t=m[1]??m[2]??m[3]??m[4]??m[5]??m[6]??m[7];r.push({k:m[1]||m[2]?"s":m[3]?"v":m[4]?"n":m[5]?"o":m[6]?"i":"p",v:t,p:m.index+m[0].indexOf(t),e:re.lastIndex})}return r}
const vget=(n,sc)=>{const k=lc(n);return k==="true"?true:k==="false"?false:k==="null"?null:sc.get(k)};
function interp(s,sc){return s.replace(/\$\(([^)]*)\)/g,(_,e)=>fv(evalP(e,sc))).replace(/\$(\w+)((?:\.\w+)*)/g,(_,n,ps)=>{let v=vget(n,sc);for(const p of ps.split(".").filter(Boolean))v=prop(v,p);return fv(v)}).replace(/`n/g,"\n").replace(/`t/g,"\t")}
function ev(src,sc){const T=tok(src);let i=0;
 const LV=[["-or"],["-and"],["-eq","-ne","-gt","-lt","-ge","-le","-like","-notlike","-match","-notmatch","-contains"],["+","-"],["*","/","%"]];
 const cmp=(o,a,b)=>{const one=x=>{switch(o){case"-eq":return lc(x)===lc(b);case"-ne":return lc(x)!==lc(b);case"-gt":return x>b;case"-lt":return x<b;case"-ge":return x>=b;case"-le":return x<=b;case"-like":return like(x,b);case"-notlike":return !like(x,b);case"-match":return new RegExp(b,"i").test(x);case"-notmatch":return !new RegExp(b,"i").test(x)}};return o==="-contains"?arr(a).some(x=>lc(x)===lc(b)):Array.isArray(a)?a.filter(one):one(a)};
 const bin=l=>{if(l===LV.length)return un();let a=bin(l+1);for(;;){const t=T[i];if(!t||t.k==="s"||!LV[l].includes(lc(t.v)))return a;i++;const b=bin(l+1),o=lc(t.v);
  a=o==="-or"?(truthy(a)||truthy(b)):o==="-and"?(truthy(a)&&truthy(b)):l===2?cmp(o,a,b):o==="+"?(Array.isArray(a)?[...a,...arr(b)]:(typeof a==="string"||typeof b==="string")?fv(a)+fv(b):a+b):o==="-"?a-b:o==="*"?a*b:o==="/"?a/b:a%b}};
 const un=()=>{const t=T[i];if(t&&t.k!=="s"&&(lc(t.v)==="-not"||t.v==="!")){i++;return !truthy(un())}if(t&&t.k==="p"&&t.v==="-"){i++;return -un()}return post()};
 const post=()=>{let v=prim();for(;;){if(T[i]&&T[i].v==="."&&T[i].k==="p"&&T[i+1]&&T[i+1].k==="i"){v=prop(v,T[i+1].v);i+=2}else if(T[i]&&T[i].v==="["&&T[i].k==="p"){i++;let n=bin(0);i++;const a=arr(v);v=a[n<0?a.length+n:n]}else return v}};
 const prim=()=>{const t=T[i++];if(!t)throw new Error("The expression is incomplete.");
  if(t.k==="n")return parseFloat(t.v);if(t.k==="s")return t.v[0]==='"'?interp(t.v.slice(1,-1),sc):t.v.slice(1,-1);if(t.k==="v")return vget(t.v.slice(1),sc);
  const at=t.v==="@"&&T[i]&&T[i].v==="(";
  if(t.v==="("||at){if(at)i++;let d=1,j=i;while(j<T.length&&d){if(T[j].k==="p"&&T[j].v==="(")d++;if(T[j].k==="p"&&T[j].v===")")d--;j++}const inner=src.slice(T[i-1].e,T[j-1].p);i=j;const v=evalP(inner,sc);return at?arr(v):v}
  if(t.k==="i")return t.v;throw new Error("Unexpected token '"+t.v+"' in expression.")};
 const lst=()=>{let a=bin(0);if(T[i]&&T[i].v===","){a=[a];while(T[i]&&T[i].v===","){i++;a.push(bin(0))}}return a};
 const v=lst();if(i<T.length)throw new Error("Unexpected token '"+T[i].v+"' in expression.");return v}
function splitPipe(s){const r=[];let d=0,q=null,b=0;for(let i=0;i<s.length;i++){const c=s[i];if(q){if(c===q)q=null;continue}if(c==='"'||c==="'"){q=c;continue}if("({".includes(c))d++;else if(")}".includes(c))d--;else if(c==="|"&&d===0){r.push(s.slice(b,i));b=i+1}}r.push(s.slice(b));return r}
function sargs(s){const r=[];let b="",d=0,q=null;for(const c of s){if(q){b+=c;if(c===q)q=null;continue}if(c==='"'||c==="'"){q=c;b+=c;continue}if("({".includes(c))d++;if(")}".includes(c))d--;if(/\s/.test(c)&&!d){if(b)r.push(b);b=""}else b+=c}if(b)r.push(b);return r}
function evalP(s,sc){s=s.trim();const st=splitPipe(s),f=st[0].trim();
 if(st.length===1&&!/^[A-Za-z]+-[A-Za-z]+|^(gps|gsv|gci|gc|sls|echo|ps|ls|dir|cat|type)(\s|$)/i.test(f))return ev(s,sc);
 let data=null,first=true;for(const x of st){const t=x.trim();data=first&&/^[$("'\d@]/.test(t)?ev(t,sc):stage(t,data,sc);first=false}return data}
const fobj=(ps,n)=>{const o={Mode:n.t==="d"?"d-----":"-a----",Length:n.t==="f"?n.d.length:"",Name:ps[ps.length-1]};Object.defineProperty(o,"FullName",{value:toWin(path(ps))});return o};
function stage(t,inp,sc){const m=t.match(/^(\S+)\s*([\s\S]*)$/);let name=lc(m[1]);name=PA[name]||name;const rest=m[2].trim(),A=sargs(rest);
 const nm=k=>{const j=A.findIndex(a=>lc(a)==="-"+k);return j>=0?A.splice(j,2)[1]:undefined},sw=k=>{const j=A.findIndex(a=>lc(a)==="-"+k);if(j>=0){A.splice(j,1);return true}return false};
 const V=a=>a==null?a:/^["'$(@]|^\d/.test(a)?ev(a,sc):a,items=arr(inp),blk=a=>a&&a[0]==="{"?a.slice(1,-1):null;
 const withIt=(x,f)=>{const o=sc.get("_");sc.set("_",x);try{return f()}finally{sc.set("_",o)}};
 switch(name){
 case"get-process":{const n=V(nm("name")??A[0]);return procs().filter(p=>!n||like(p.ProcessName,n))}
 case"get-service":{const n=V(nm("name")??A[0]);return svcs().filter(p=>!n||like(p.Name,n))}
 case"get-childitem":{const rec=sw("recurse"),force=sw("force"),fl=V(nm("filter")),p=V(nm("path")??A[0])||".";const bp=parts(String(p)),n=get(bp);if(!n)throw new Error("Cannot find path '"+p+"' because it does not exist.");let o;
  if(n.t==="f")o=[fobj(bp,n)];else if(rec)o=walkPaths(String(p),force).map(x=>{const ps=x.split("/").filter(Boolean);return fobj(ps,get(ps))});else o=Object.keys(n.c).sort().filter(k=>force||k[0]!==".").map(k=>fobj([...bp,k],n.c[k]));
  return fl?o.filter(x=>like(x.Name,fl)):o}
 case"get-content":return lines(fsApi.read(String(V(nm("path")??A[0]))));
 case"select-string":{const pat=String(V(nm("pattern")??A[0])),pa=nm("path")??A[1],src=pa?lines(fsApi.read(String(V(pa)))):items.map(fv);let re;try{re=new RegExp(pat,"i")}catch(e){re={test:x=>x.includes(pat)}}return src.filter(l=>re.test(l))}
 case"where-object":{let b=blk(A[0]);if(b==null)b="$_."+rest;return items.filter(x=>withIt(x,()=>truthy(ev(b,sc))))}
 case"foreach-object":{const b=blk(A[0]);if(b==null)throw new Error("ForEach-Object needs a { script block }.");const out=[];for(const x of items)withIt(x,()=>run(b,sc,v=>out.push(...arr(v))));return out}
 case"select-object":{const f=nm("first"),l=nm("last"),ex=nm("expandproperty");let list=items;if(f)list=list.slice(0,+f);if(l)list=list.slice(-l);if(ex)return list.map(x=>prop(x,ex));const ps=A.join(" ").split(",").map(s=>s.trim()).filter(Boolean);return ps.length&&ps[0]!=="*"?list.map(x=>{const o={};ps.forEach(p=>o[p]=prop(x,p));return o}):list}
 case"sort-object":{const d=sw("descending"),p=A[0],k=x=>p?prop(x,p):x;const s=[...items].sort((a,b)=>{const x=k(a),y=k(b);return typeof x==="number"?x-y:String(x).localeCompare(String(y))});return d?s.reverse():s}
 case"measure-object":{const p=nm("property")??A[0],o={Count:items.length};if(p){const vs=items.map(x=>+prop(x,p));o.Sum=vs.reduce((a,b)=>a+b,0);o.Average=o.Sum/vs.length}return o}
 case"write-output":case"write-host":return rest?ev(rest,sc):null;
 case"format-table":case"out-string":return inp;
 case"get-date":return new Date().toString();
 default:{const cmd=norm(m[1]);if(Object.hasOwn(C,cmd)){const buf=[];C[cmd](A.map(a=>String(V(a))),x=>buf.push(x),inp==null?null:items.map(fv).join("\n"));return buf.flatMap(x=>String(x).split("\n"))}
  throw new Error("The term '"+m[1]+"' is not recognized as the name of a cmdlet, function, script file, or operable program.")}}}
function splitStmts(s){const r=[];let d=0,q=null,b=0;for(let i=0;i<s.length;i++){const c=s[i];if(q){if(c===q)q=null;continue}if(c==='"'||c==="'"){q=c;continue}if("({".includes(c))d++;else if(")}".includes(c))d--;else if((c==="\n"||c===";")&&d===0&&!/^\s*else/i.test(s.slice(i+1))){r.push(s.slice(b,i));b=i+1}}r.push(s.slice(b));return r.map(x=>x.trim()).filter(Boolean)}
function run(src,sc,emit){src=src.replace(/^\s*#.*$/gm,"");for(const s of splitStmts(src))stmt(s,sc,emit)}
function stmt(s,sc,emit){let m;
 if(m=s.match(/^(foreach|if|while)\s*\(/i)){const kw=lc(m[1]),a=s.indexOf("("),b=mt(s,a,"(",")"),head=s.slice(a+1,b),c=s.indexOf("{",b),d=mt(s,c,"{","}"),body=s.slice(c+1,d),rest=s.slice(d+1).trim();
  if(kw==="foreach"){const h=head.match(/^\s*\$(\w+)\s+in\s+([\s\S]+)$/i);if(!h)throw new Error("Bad foreach syntax. Use: foreach ($x in $list) { ... }");for(const x of arr(evalP(h[2],sc))){sc.set(lc(h[1]),x);run(body,sc,emit)}}
  else if(kw==="if"){if(truthy(evalP(head,sc)))run(body,sc,emit);else if(/^else\s*\{/i.test(rest)){const e=rest.indexOf("{");run(rest.slice(e+1,mt(rest,e,"{","}")),sc,emit)}}
  else{let n=0;while(truthy(evalP(head,sc))&&n++<1000)run(body,sc,emit)}return}
 if(m=s.match(/^\$(\w+)\s*(\+\+|--)$/)){sc.set(lc(m[1]),(sc.get(lc(m[1]))||0)+(m[2]==="++"?1:-1));return}
 if(m=s.match(/^\$(\w+)\s*([+\-]?=)\s*([\s\S]+)$/)){let v=evalP(m[3],sc);const k=lc(m[1]),o=sc.get(k);if(m[2]==="+=")v=Array.isArray(o)?[...o,...arr(v)]:typeof o==="number"?o+v:fv(o)+fv(v);else if(m[2]==="-=")v=o-v;sc.set(k,v);return}
 emit(evalP(s,sc))}
function table(a){const ks=Object.keys(a[0]),rows=a.map(o=>ks.map(k=>fv(o[k]))),w=ks.map((k,j)=>Math.max(k.length,...rows.map(r=>r[j].length))),ln=r=>r.map((c,j)=>typeof a[0][ks[j]]==="number"?c.padStart(w[j]):c.padEnd(w[j])).join("  ").trimEnd();return["",ln(ks),ln(w.map(x=>"-".repeat(x))),...rows.map(ln),""]}
function printPS(v){const a=arr(v);if(!a.length)return;if(a.every(x=>x&&typeof x==="object"&&!Array.isArray(x)))table(a).forEach(l=>print(l));else a.forEach(x=>print(fv(x)))}
const PSL=/^\s*(\$|foreach\s*\(|if\s*\(|while\s*\()|\|\s*(where-object|where|foreach-object|foreach|select-object|select|sort-object|sort|measure-object|measure|format-table|%|\?)(?![\w-])|^\s*(get-process|get-service|gps|gsv|get-date|write-output)(?![\w-])/i;
async function route(line){const t=line.trim();
 if(/^\.[\\/]/.test(t))return exec2("run "+t.replace(/^\.[\\/]/,""));
 if(PSL.test(t)){busy=true;abort=false;try{run(t,G,printPS)}catch(e){print(e.message,"err")}busy=false;return}
 return exec2(line)}
const runJS=C.run;
C.run=async a=>{if(a[0]&&/\.ps1$/i.test(a[0])){const code=fsApi.read(a[0]);try{run(code,new Map(),printPS)}catch(e){print(e.message,"err")}}else return runJS(a)};
C.pwd=(a,o)=>{o("");o("Path");o("----");o(toWin(path(cwd)||"/"));o("")};
function addPS(r,i){i.c.scripts.c["template.ps1"]=F("# A PowerShell script: variables, a loop, and an if.\n# Run it with:  .\\scripts\\template.ps1\n$lines = Get-Content /var/log/auth.log\n$accepted = 0\nforeach ($line in $lines) {\n    if ($line -like \"*Accepted*\") { $accepted = $accepted + 1 }\n}\nWrite-Output \"Accepted logins: $accepted\"\n")}
const has=(p,re)=>{try{return re.test(fsApi.read(p))}catch(e){return false}};
M.splice(9,0,{t:"What is still running?",d:"Dana: The breach is over, but is the attacker's tool still running on ORION-7? PowerShell commands return objects with properties, not plain text, so you can sort and filter them by property. Get-Process lists what is running. Find the process using the most CPU and submit its name.",f:"a process name",a:x=>/^svc-upd$/i.test(x.trim()),win:"Dana: svc-upd. A fake 'service updater' still sending data out. Kill it and tell the CEO.\n\nLesson: PowerShell pipes objects, not text. You sort and filter by property instead of cutting up lines."});
M[10].d="Dana needs this in the final report, and the client will want to rerun it. Look at the examples in scripts/. Write a script in your home folder named report.ps1 (PowerShell) or report.js that reads the auth log, counts the FAILED lines, and prints the number. Run it, then submit the number.";
M[10].a=x=>x==="7"&&(has("/home/intern/report.js",/fs\.read/)||has("/home/intern/report.ps1",/Get-Content/i));
[["Think about the three basics: where am I, what is here, what does it say?","One command lists the files in a folder and another prints a file. Check 'help'.","Your home folder has a note from Dana. The flag is on one of its lines."],
["Not everything in a folder is shown by default.","Shells have a switch that includes hidden items. PowerShell calls it -Force.","Files that start with a dot are the hidden ones here. One has a flag."],
["Do not read the whole log. Ask the computer to show only the interesting lines.","grep and Select-String filter lines by text. What word marks a failed attempt?","After filtering, look for the address that repeats the most."],
["You need to filter more than once, then count. Output can flow from one command into the next.","The | symbol connects commands. The last step should count lines. Check 'help' for the counter.","Filter by the address, filter by failure, then count."],
["Redirection stores output in a file instead of printing it.","A symbol after a command points its output at a file instead of the screen.","Filter the failed lines from the log and send them to failed.txt in your home folder."],
["Searching every folder by hand is slow. Both shell families can search the whole disk.","find searches by name. PowerShell's Get-ChildItem has a recursive switch.","The filename contains the word 'backup'."],
["The password is not in plain text, but it is not secret either.","Look through the folders in your home. Decoding is a built-in tool: check 'help'.","Once decoded, log in to the vault, then read what is inside."],
["Where might a network be documented?","Search the disk for a file about the network, then search inside it for the address.","The answer is the name the document gives that address."],
["Which log records people physically entering the building?","Filter that log for the date of the breach.","Look at who brought a visitor in."],
["Objects can be sorted by a property. Get-Process returns objects, not text.","Sort-Object takes a property name and has a switch for descending order.","Keep only the first item after sorting, then read its name."],
["A script is saved commands. Look at the examples in scripts/.","Your script must read the log, keep only the failed lines, and count them.","Create the file in your home folder, run it, and submit what it prints."]].forEach((h,i)=>M[i].hs=h);
C.hint=(a,o)=>{if(P.done>=M.length)return o("No more hints: the case is closed.");const m=M[P.done];P.h=P.h||{};const n=P.h[P.done]||0,k=Math.min(n,m.hs.length-1);P.h[P.done]=n+1;saveP();o("Dana (hint "+(k+1)+" of "+m.hs.length+"): "+m.hs[k]+(k<m.hs.length-1?"\n(type hint again for a bigger nudge)":""))};
C.help=(a,o)=>o(["How to play: read your mission, explore, and send answers with: submit <answer>","","Look around    pwd  ls [-a]  cd <dir>  tree  find <name>      (C:\\Users\\intern works as a path)","Read & search  cat <file>  grep [-c] <text> <file>  head  tail  wc  sort  uniq [-c]","Pipes & saving cmd1 | cmd2     cmd > file     cmd >> file","Files          edit <file>  touch  mkdir  rm  mv  cp  echo","Tools          decode base64|rot13 <text>   login <user> <password>","PowerShell     Get-Process  Get-Service  Get-ChildItem  Get-Content  Select-String","               Where-Object { $_.CPU -gt 50 }   Sort-Object CPU -Descending","               Select-Object -First 3   Measure-Object   ForEach-Object { ... }","               $x = 5    foreach ($i in $list) { ... }    if ($x -gt 3) { ... }","Scripts        edit report.ps1, then  .\\report.ps1   (or a .js file with: run report.js)","Game           mission  hint (repeat for bigger nudges)  submit <answer>  reset","Keys           Tab completes  \u00b7  Up/Down history  \u00b7  Ctrl+C stops  \u00b7  Ctrl+L clears"].join("\n"));

async function exec(line){
  line=line.trim();if(!line)return;
  const m=line.match(/^(.*?)\s*(>>?)\s*(\S+)\s*$/);let redir=null;
  if(m&&(m[1].match(/["']/g)||[]).length%2===0){line=m[1];redir={append:m[2]===">>",file:m[3]}}
  const toks=[...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(x=>x[1]??x[2]??x[3]);
  const cmd=norm(toks.shift());const args=toks;let buf=[];
  const o=t=>redir?buf.push(t):print(t);abort=false;
  busy=true;
  try{
    if(Object.hasOwn(C,cmd)){await C[cmd](args,o)}
    else{
      const cands=[cmd,cmd+".js","/programs/"+cmd,"/programs/"+cmd+".js"];
      const hit=cands.find(c=>{const n=get(parts(c));return n&&n.t==="f"});
      if(!hit)throw new Error("unknown command: "+cmd+" (try 'help')");
      await C.run([hit,...args]);
    }
    if(redir){const text=buf.join("\n")+"\n";fsApi.write(redir.file,redir.append?(get(parts(redir.file))?.d||"")+text:text)}
  }catch(e){print(e.message,"err")}
  busy=false;
}

/* ---------- input ---------- */
function complete(){
  const v=inp.value,idx=v.lastIndexOf(" ")+1,word=v.slice(idx);
  const slash=word.lastIndexOf("/"),dirp=word.slice(0,slash+1),base=word.slice(slash+1);
  let pool;
  if(idx===0&&slash<0)pool=[...Object.keys(C),...(get(["programs"])?Object.keys(get(["programs"]).c).map(k=>k.replace(/\.js$/,"")):[])];
  else{const d=get(parts(dirp||"."));pool=d&&d.t==="d"?Object.keys(d.c).map(k=>k+(d.c[k].t==="d"?"/":"")):[]}
  const hits=pool.filter(k=>k.startsWith(base));
  if(hits.length===1)inp.value=v.slice(0,idx)+dirp+hits[0]+(hits[0].endsWith("/")?"":" ");
  else if(hits.length>1){let p=hits[0];for(const h of hits)while(!h.startsWith(p))p=p.slice(0,-1);inp.value=v.slice(0,idx)+dirp+p;print(pl.textContent+v,"dim");print(hits.join("  "),"dir")}
}
inp.addEventListener("keydown",async e=>{
  if(e.ctrlKey&&e.key==="c"){e.preventDefault();if(mode==="read"||busy){abort=true;if(readRes){const r=readRes;readRes=null;mode="shell";r.rej(new Error("terminated"))}}else{inp.value=""}return}
  if(e.ctrlKey&&e.key==="l"){e.preventDefault();C.clear();return}
  if(mode==="shell"){
    if(e.key==="ArrowUp"){e.preventDefault();if(hi>0)inp.value=hist[--hi]}
    else if(e.key==="ArrowDown"){e.preventDefault();hi=Math.min(hi+1,hist.length);inp.value=hist[hi]||""}
    else if(e.key==="Tab"){e.preventDefault();try{complete()}catch(err){}}
  }
  if(e.key==="Enter"){
    const v=inp.value;inp.value="";
    if(mode==="read"){const r=readRes;readRes=null;mode="shell";print(pl.textContent+v);shellPromptHold();r.res(v);return}
    if(busy)return;
    print(pl.textContent+v);
    if(v.trim()){hist.push(v);hi=hist.length}
    setPrompt("");await route(v);partial=null;mode="shell";shellPrompt();inp.focus();
  }
});
function shellPromptHold(){setPrompt("")}
screen.addEventListener("click",()=>{if(!window.getSelection().toString())inp.focus()});

/* ---------- boot ---------- */
root=load();cwd=["home","intern"];try{P=JSON.parse(localStorage.getItem(PKEY))||P}catch(e){}
print("ORION-7 secure file server  ::  authorized assessment","pr");
print("Halyard Security, Monday 9:02 AM.\nYour first real job: a penetration test for Orion Logistics, a freight company.\nThey signed the paperwork, so everything here is allowed. Stay inside ORION-7.\n\nThis is a made-up machine: nothing here is real. Tab completes names, Up/Down recalls commands, 'help' lists commands.","dim");print("");if(P.done>=M.length)print("Case closed. Type 'reset' to replay.","ok");else{if(P.done)print("Welcome back.","ok");showMission()}
print("");
shellPrompt();inp.focus();
