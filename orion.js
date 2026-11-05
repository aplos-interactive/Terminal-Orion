"use strict";

const $ = (id) => document.getElementById(id);
const out = $("out");
const inp = $("in");
const pl = $("pl");
const screen = $("screen");

const KEY = "browser-terminal-fs-v5";
const PKEY = "browser-terminal-progress-v4";

let P = { done: 0, unlocked: [] };
let root, cwd = [], hist = [], hi = 0, mode = "shell", readRes = null, abort = false, busy = false;

const USER = "root";
const HOST = "orion";

function saveP() {
  try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch (e) {}
}

const D = () => ({ t: "d", c: {} });
const F = (d) => ({ t: "f", d });

function seed() {
  return newSeed();
}

function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return JSON.parse(s);
  } catch (e) {}
  return seed();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(root)); } catch (e) {}
}

function parts(p) {
  p = String(p).replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");
  p = p.replace(/^\/Users(?=\/|$)/i, "/home");
  if (p === "~" || p.startsWith("~/")) p = "/home/intern" + p.slice(1);
  const b = p.startsWith("/") ? [] : [...cwd];
  for (const s of p.split("/")) {
    if (!s || s === ".") continue;
    if (s === "..") b.pop();
    else b.push(s);
  }
  return b;
}

function get(ps) {
  let n = root;
  for (const s of ps) {
    if (n.t !== "d" || !n.c[s]) return null;
    n = n.c[s];
    if (n.lock && !P.unlocked.includes(n.lock)) {
      throw new Error("permission denied: /" + s + " is locked (see 'login')");
    }
  }
  return n;
}

const path = (ps) => "/" + ps.join("/");

function parentOf(p) {
  const ps = parts(p);
  const name = ps.pop();
  const par = get(ps);
  return { par, name };
}

const fsApi = {
  read: (p) => {
    const n = get(parts(p));
    if (!n || n.t !== "f") throw new Error("no such file: " + p);
    return n.d;
  },
  write: (p, t) => {
    const { par, name } = parentOf(p);
    if (!par || par.t !== "d" || !name) throw new Error("bad path: " + p);
    if (par.c[name] && par.c[name].t === "d") throw new Error("is a directory: " + p);
    par.c[name] = F(String(t));
    save();
  },
  list: (p) => {
    const n = get(parts(p || "/"));
    if (!n || n.t !== "d") throw new Error("not a directory");
    return Object.keys(n.c).sort().map((k) => k + (n.c[k].t === "d" ? "/" : ""));
  }
};

function print(text = "", cls = "") {
  String(text).split("\n").forEach((l) => {
    const d = document.createElement("div");
    d.className = "ln " + cls;
    d.textContent = l;
    out.appendChild(d);
  });
  screen.scrollTop = screen.scrollHeight;
}

let partial = null;

function write(text) {
  String(text).split("\n").forEach((s, i) => {
    if (i > 0) partial = null;
    if (!s) return;
    if (!partial) {
      partial = document.createElement("div");
      partial.className = "ln";
      out.appendChild(partial);
    }
    partial.textContent += s;
  });
  screen.scrollTop = screen.scrollHeight;
}

function shellPromptDisplay(p) {
  const home = "/home/intern";
  if (p === home) return "~";
  if (p.startsWith(home + "/")) return "~" + p.slice(home.length);
  return p || "/";
}

function setPrompt(s) {
  const d = shellPromptDisplay(path(cwd));
  pl.textContent = s || `${USER}@${HOST}:${d}$ `;
}

const shellPrompt = () => {
  const d = shellPromptDisplay(path(cwd));
  setPrompt(`${USER}@${HOST}:${d}$ `);
};

const sleep = (ms) => new Promise((res, rej) => setTimeout(() => abort ? rej(new Error("terminated")) : res(), ms));

function read(prompt = "") {
  return new Promise((res, rej) => {
    if (abort) return rej(new Error("terminated"));
    partial = null;
    mode = "read";
    setPrompt(prompt);
    readRes = { res, rej, prompt };
    inp.focus();
  });
}

const C = {};

C.help = (a, o) => o([
  "Commands:",
  "  ls [dir]           list files",
  "  pwd                print working directory",
  "  cd <dir>           change directory",
  "  cat <file>         view a file",
  "  grep [-c] <pat>   search file or stdin",
  "  find <name>        search by filename",
  "  head/tail [-n N]   read the beginning/end of a file",
  "  wc                 count lines",
  "  sort / uniq        sort and de-dupe",
  "  edit <file>        open the editor",
  "  mkdir <dir>        create directory",
  "  touch <file>       create empty file",
  "  rm <path>          remove file",
  "  mv <src> <dst>     rename or move",
  "  cp <src> <dst>     copy a file",
  "  echo <text>        print text",
  "  run <script.js>    run a JavaScript script",
  "  clear              clear screen",
  "  history            show command history",
  "  date               print the date",
  "  reset              restart the challenge",
  "",
  "Game commands:",
  "  mission            show current challenge",
  "  hint               get a nudge",
  "  submit <answer>    submit your answer",
  "  login <user> <pw>  unlock restricted paths",
  "  decode base64|rot13 <text>",
  "",
  "Unix basics:",
  "  ls -a              show hidden files",
  "  ls -R /            recursive list",
  "  cmd1 | cmd2        pipe output to another command",
  "  > file             redirect stdout to a file",
  "  >> file            append stdout to a file",
  "",
  "Tab completes names and Up/Down browse history."
].join("\n"));

C.ls = (a, o) => {
  const flags = a.map((x) => x.toLowerCase());
  const all = flags.includes("-a") || flags.includes("-all") || flags.includes("-force");
  const rec = flags.includes("-r") || flags.includes("-r") || flags.includes("-recurse");
  const args = a.filter((x) => x[0] !== "-");

  if (rec) {
    walkPaths(args[0] || ".", all).forEach((p) => o(p));
    return;
  }

  const n = get(parts(args[0] || "."));
  if (!n) throw new Error("no such directory");
  if (n.t === "f") return o(args[0] || ".");

  const keys = Object.keys(n.c).filter((k) => all || k[0] !== ".").sort();
  if (keys.length) o(keys.map((k) => n.c[k].t === "d" ? k + "/" : k).join("  ")); 
};

C.pwd = (a, o) => o(path(cwd) || "/");

C.cd = (a) => {
  const ps = parts(a[0] || "~");
  const n = get(ps);
  if (!n || n.t !== "d") throw new Error("not a directory: " + (a[0] || ""));
  cwd = ps;
};

C.cat = (a, o) => {
  if (!a[0]) throw new Error("usage: cat <file>");
  const t = fsApi.read(a[0]);
  o(t.replace(/\n$/, ""));
};

C.mkdir = (a) => {
  if (!a[0]) throw new Error("usage: mkdir <dir>");
  const { par, name } = parentOf(a[0]);
  if (!par || !name) throw new Error("bad path");
  if (par.c[name]) throw new Error("already exists");
  par.c[name] = D();
  save();
};

C.touch = (a) => {
  if (!a[0]) throw new Error("usage: touch <file>");
  const n = get(parts(a[0]));
  if (!n) fsApi.write(a[0], "");
};

C.rm = (a) => {
  if (!a[0]) throw new Error("usage: rm <path>");
  const { par, name } = parentOf(a[0]);
  if (!par || !par.c[name]) throw new Error("no such file or directory");
  delete par.c[name];
  save();
};

C.mv = (a) => {
  if (a.length < 2) throw new Error("usage: mv <from> <to>");
  const s = parentOf(a[0]);
  if (!s.par || !s.par.c[s.name]) throw new Error("no such file");
  let d = parentOf(a[1]);
  const dn = get(parts(a[1]));
  if (dn && dn.t === "d") d = { par: dn, name: s.name };
  if (!d.par || d.par.t !== "d") throw new Error("bad destination");
  d.par.c[d.name] = s.par.c[s.name];
  if (d.par !== s.par || d.name !== s.name) delete s.par.c[s.name];
  save();
};

C.cp = (a) => {
  if (a.length < 2) throw new Error("usage: cp <from> <to>");
  const n = get(parts(a[0]));
  if (!n || n.t !== "f") throw new Error("can only copy files");
  const dn = get(parts(a[1]));
  fsApi.write(dn && dn.t === "d" ? a[1] + "/" + parts(a[0]).pop() : a[1], n.d);
};

C.echo = (a, o) => o(a.join(" "));

C.clear = () => {
  out.textContent = "";
  partial = null;
};

C.history = (a, o) => o(hist.map((h, i) => (i + 1) + "  " + h).join("\n"));
C.date = (a, o) => o(new Date().toString());

C.theme = (a, o) => {
  const t = a[0];
  if (t === "light" || t === "dark") {
    document.documentElement.dataset.theme = t;
    return;
  }
  o("usage: theme light|dark");
};

C.reset = async (a) => {
  if (a[0] !== "-y") {
    const r = await read("Wipe the whole disk? (y/N) ");
    if (!/^y/i.test(r)) return;
  }
  root = seed();
  cwd = ["home", "intern"];
  P = { done: 0, unlocked: [] };
  saveP();
  save();
  print("Disk reset. Missions restarted.", "ok");
};

C.tree = (a, o) => {
  const start = get(parts(a[0] || "."));
  if (!start || start.t !== "d") throw new Error("not a directory");
  const walk = (n, pre) => {
    const ks = Object.keys(n.c).filter((k) => k[0] !== ".").sort();
    ks.forEach((k, i) => {
      const last = i === ks.length - 1;
      o(pre + (last ? "└─ " : "├─ ") + k + (n.c[k].t === "d" ? "/" : ""));
      if (n.c[k].t === "d") walk(n.c[k], pre + (last ? "   " : "│  "));
    });
  };
  o(path(parts(a[0] || ".")));
  walk(start, "");
};

C.edit = (a) => new Promise((res) => {
  if (!a[0]) throw new Error("usage: edit <file>");
  const n = get(parts(a[0]));
  if (n && n.t === "d") throw new Error("is a directory");
  const ta = $("edta");
  const ed = $("ed");
  ta.value = n ? n.d : "";
  $("edname").textContent = path(parts(a[0]));
  ed.classList.add("on");
  ta.focus();

  const close = () => {
    ed.classList.remove("on");
    ta.onkeydown = null;
    $("edsave").onclick = null;
    $("edquit").onclick = null;
    inp.focus();
    res();
  };

  const doSave = () => {
    try {
      fsApi.write(a[0], ta.value);
      $("edname").textContent = path(parts(a[0])) + "  (saved)";
    } catch (e) {
      $("edname").textContent = e.message;
    }
  };

  ta.onkeydown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      doSave();
    } else if (e.key === "Escape") {
      close();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.setRangeText("  ", s, ta.selectionEnd, "end");
    }
  };

  $("edsave").onclick = doSave;
  $("edquit").onclick = close;
});

C.run = async (a) => {
  if (!a[0]) throw new Error("usage: run <file.js>");
  const code = fsApi.read(a[0]);
  const AF = Object.getPrototypeOf(async function () {}).constructor;
  let fn;
  try {
    fn = new AF("print", "write", "read", "sleep", "clear", "fs", "args", code);
  } catch (e) {
    throw new Error((e instanceof SyntaxError ? "syntax error: " : "this page's host blocks running scripts: ") + e.message);
  }
  abort = false;
  try {
    await fn((...x) => print(x.join(" ")), write, read, sleep, C.clear, fsApi, a.slice(1));
  } catch (e) {
    partial = null;
    if (e.message === "terminated") print("Terminated.", "err");
    else print(e.name + ": " + e.message, "err");
  }
};

C.grep = (a, o, i) => {
  let c = false;
  if (a[0] === "-c") {
    c = true;
    a = a.slice(1);
  }
  if (a.length < 1) throw new Error("usage: grep [-c] <text> <file>");
  const hits = (a[1] ? fsApi.read(a[1]) : String(i || "")).split("\n").filter((l) => l.includes(a[0]));
  if (c) o(String(hits.length));
  else hits.forEach((l) => o(l));
};

C.decode = (a, o) => {
  const k = a[0];
  const t = a.slice(1).join(" ");
  if (k === "base64") {
    try { o(atob(t)); } catch (e) { throw new Error("not valid base64"); }
    return;
  }
  if (k === "rot13") {
    o(t.replace(/[a-z]/gi, (c) => String.fromCharCode((c <= "Z" ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)));
    return;
  }
  throw new Error("usage: decode base64|rot13 <text>");
};

C.login = (a, o) => {
  if (a.length < 2) throw new Error("usage: login <user> <password>");
  if (a[0] === "vault" && a[1] === "tealwolf99") {
    if (!P.unlocked.includes("vault")) {
      P.unlocked.push("vault");
      saveP();
    }
    o("Access granted. /vault is now unlocked.");
    return;
  }
  throw new Error("login failed for " + a[0]);
};

const ALIAS = {
  ll: "ls -l",
  la: "ls -a",
  "ls -l": "ls -l",
  "grep": "grep",
  "find": "find",
  "man": "help"
};

const norm = (c) => {
  if (!c) return c;
  const lower = c.toLowerCase();
  if (ALIAS[lower]) return ALIAS[lower];
  return c;
};

function walkPaths(p, all) {
  const res = [];
  const w = (n, ps) => {
    for (const k of Object.keys(n.c).sort()) {
      if (!all && k[0] === ".") continue;
      const q = [...ps, k];
      const c = n.c[k];
      res.push(path(q) + (c.t === "d" ? "/" : ""));
      if (c.t === "d" && !(c.lock && !P.unlocked.includes(c.lock))) w(c, q);
    }
  };
  const base = parts(p);
  const n = get(base);
  if (!n || n.t !== "d") throw new Error("not a directory");
  w(n, base);
  return res;
}

C.find = (a, o) => {
  if (!a[0]) throw new Error("usage: find <name part>");
  walkPaths("/", true)
    .filter((p) => p.split("/").filter(Boolean).pop().toLowerCase().includes(a[0].toLowerCase()))
    .forEach((p) => o(p));
};

const lines = (s) => {
  const l = String(s || "").split("\n");
  if (l[l.length - 1] === "") l.pop();
  return l;
};

const src = (a, i) => {
  const f = a.find((x) => x[0] !== "-" && isNaN(x));
  return f ? fsApi.read(f) : String(i || "");
};

const num = (a, d) => {
  const k = a.indexOf("-n");
  if (k >= 0 && a[k + 1]) return parseInt(a[k + 1], 10) || d;
  const m = a.find((x) => /^-\d+$/.test(x));
  return m ? -parseInt(m, 10) : d;
};

C.wc = (a, o, i) => o(String(lines(src(a, i)).length));
C.head = (a, o, i) => lines(src(a, i)).slice(0, num(a, 10)).forEach((l) => o(l));
C.tail = (a, o, i) => lines(src(a, i)).slice(-num(a, 10)).forEach((l) => o(l));
C.sort = (a, o, i) => {
  const l = lines(src(a, i)).sort();
  (a.includes("-r") ? l.reverse() : l).forEach((x) => o(x));
};
C.uniq = (a, o, i) => {
  const r = [];
  for (const x of lines(src(a, i))) {
    if (r.length && r[r.length - 1][0] === x) r[r.length - 1][1]++;
    else r.push([x, 1]);
  }
  r.forEach(([x, n]) => o(a.includes("-c") ? String(n).padStart(4) + " " + x : x));
};

function addExtra(r, i) {
  const s = D();
  const b = D();
  const y = D();
  const sc = D();
  r.c.srv = s;
  s.c.backups = b;
  b.c["2024"] = y;
  y.c["backup-key.txt"] = F("Old backup key. Nobody remembers why this is here.\n\nFLAG{verb_noun_same_ideas}\n");
  sc.c["template.js"] = F("// A script is just commands saved in a file. Run it with: run scripts/template.js\n// Inside a script you have: print, read, sleep, fs, and normal JavaScript.\nconst text = fs.read('/var/log/auth.log');\nconst lines = text.split('\\n');\nprint('lines in the log: ' + lines.length);\n// Next step: lines.filter(l => l.includes('FAILED')).length\n");
  i.c.scripts = sc;
  addStory(r, i);
}

const M = [
  { t: "Where am I?", d: "Dana wants you to get your bearings. Every computer stores files in a tree of folders. pwd shows where you are, ls lists what is here, cd moves, cat reads a file.\nRead the README in your home folder and submit the flag inside.", h: "ls, then cat README.", a: (x) => x === "FLAG{recon_starts_with_looking}", win: "Dana: Good. Knowing where you stand is step one. Marcus, their sysadmin, was supposed to clean this account up before we arrived. Let's see if he did.\n\nLesson: pwd, ls, cd, cat cover most daily terminal use." },
  { t: "Hidden files", d: "Marcus has been sloppy before. Some files start with a dot and are skipped by plain ls. Find the flag in the one in your home folder.", h: "ls -a shows hidden files.", a: (x) => x === "FLAG{dotfiles_hide_in_plain_sight}", win: "Dana: He hid his notes instead of deleting them. Typical. The client also said last night's logs looked strange. Check /var/log/auth.log.\n\nLesson: hidden is not secret. Config files are dotfiles, so ls -a matters." },
  { t: "Search, do not scroll", d: "Dana wants to know who has been guessing passwords. grep prints only lines containing some text. Search /var/log/auth.log for FAILED logins and submit the IP address that appears most.", h: "grep FAILED /var/log/auth.log", a: (x) => x === "203.0.113.45", win: "Dana: 203.0.113.45. That address is not on the client's network list. Odd. How many times did it try?\n\nLesson: grep is the first tool people reach for in logs." },
  { t: "Pipes", d: "The | symbol sends one command's output into the next, like a conveyor belt. How many FAILED login attempts came from that IP? Submit the number.", h: "Chain greps, then count with wc: grep A file | grep B | wc", a: (x) => x === "6", win: "Dana: Six failures, then look at the last log line: a successful login as 'vault'. We have not even started attacking anything. Someone got in before us.\nDana: Do not touch anything yet. Preserve the evidence.\n\nLesson: small tools plus pipes beat big programs, in Linux and PowerShell alike." },
  { t: "Save your work", d: "Evidence you cannot reproduce is worthless. > sends output into a file instead of the screen. Save only the FAILED lines into /home/intern/failed.txt, then type: submit done", h: "grep FAILED /var/log/auth.log > failed.txt", a: () => { try { const l = lines(fsApi.read("/home/intern/failed.txt")); return l.length === 7 && l.every((s) => s.includes("FAILED")); } catch (e) { return false; } }, win: "Dana: Saved. Now we need to know what they reached. The vault is locked, but Marcus keeps backup keys everywhere. One is called backup-key.txt.\n\nLesson: > overwrites, >> appends." },
  { t: "Two dialects", d: "Find backup-key.txt anywhere on the disk. Linux says find. Both work here. Read the file and submit the flag.", h: "find backup", a: (x) => x === "FLAG{verb_noun_same_ideas}", win: "Dana: That key opens nothing, but it tells me how Marcus stores secrets: carelessly. Look for his password notes in your home folder.\n\nLesson: searching by name matters on any Unix-like system." },
  { t: "Encoded is not encrypted", d: "A file in your home folder holds an 'encoded' vault password. Decode it, unlock the vault with login, and submit the flag inside. Read everything in there.", h: "tree, cat the file, decode base64 <text>, login vault <password>, then cat /vault/flag.txt", a: (x) => x === "FLAG{encoding_is_not_encryption}", win: "Dana: There it is. The attacker copied 48,112 customer records and the payroll file at 2:16 AM, using the password Marcus 'protected' with base64. This is a confirmed breach. We have to tell the client today.\n\nLesson: base64 is a format, not a lock. Real secrets belong in a password manager or vault." },
  { t: "Write a script", d: "Dana needs this in the final report, and the client will want to rerun it. Look at scripts/template.js, then create report.js in your home folder that counts the FAILED lines in the log and prints the number. Run it, then submit the number.", h: "edit report.js, then run report.js. lines.filter(l => l.includes('FAILED')).length", a: (x) => { try { return x === "7" && /fs\.read/.test(fsApi.read("/home/intern/report.js")); } catch (e) { return false; } }, win: "Dana: Report done. We came in to run a test and ended up catching a real breach hours before their own team would have. Orion is calling an emergency meeting.\nDana: Marcus is going to have a long week. You, on the other hand, just got your first real case under your belt. Welcome to Halyard.\n\nLesson: any task you do twice is a candidate for a script." }
];

function addStory(r, i) {
  const m = D();
  i.c.mail = m;
  m.c["from_marcus.txt"] = F("From: Marcus Reyes (IT)\nTo: Priya Nair\nDate: Oct 29\n\nPriya, you asked where the vault password lives. It is in my old notes on the intern account, in the old/ folder.\nI base64'd it so it is safe :) Please do not share it. The auditors would have my head.\n");
  m.c["from_priya.txt"] = F("From: Priya Nair (Finance)\nTo: Marcus Reyes\nDate: Oct 30\n\nThanks. The Brightline negotiation is sensitive, so please keep the payroll files locked down.\nI will be working very late on Saturday for the audit, so do not wait up.\n");
  r.c.srv.c.docs = D();
  r.c.srv.c.docs.c["network.txt"] = F("ORION NETWORK MAP (staff copy)\n10.0.0.0/24        staff LAN\n10.0.1.0/24        warehouse scanners\n203.0.113.50       vpn-gateway\n203.0.113.45       lobby-guest-wifi  (public NAT, no login needed)\n\nNOTE: guest wifi is not on the staff allowlist, yet it can reach this file server.\nTicket open since March. Low priority. -M\n");
  r.c.var.c.log.c["badge.log"] = F([
    "Nov 02 18:02 OUT     m.reyes",
    "Nov 02 18:40 OUT     j.alvarez",
    "Nov 03 01:38 IN      p.nair",
    "Nov 03 01:41 VISITOR V-212 signed in: J. Pike, Brightline Freight (host: p.nair)",
    "Nov 03 02:19 VISITOR V-212 signed out",
    "Nov 03 02:24 OUT     p.nair",
    "Nov 03 07:55 IN      m.reyes"
  ].join("\n") + "\n");
}

function newSeed() {
  const r = D();
  const i = D();
  const lg = D();
  const v = D();
  const old = D();
  r.c.home = D();
  r.c.home.c.intern = i;
  r.c.var = D();
  r.c.var.c.log = lg;
  r.c.vault = v;
  v.lock = "vault";
  i.c.README = F("ORION-7 :: authorized security assessment\n\nFrom: Dana Okafor, Halyard Security\nWelcome aboard, intern. Orion Logistics hired us to test ORION-7, their file server.\nYour account is low-privilege, so you see what any employee would see.\nStay in scope, keep notes, and ask me ('hint') when you are stuck.\n\nType 'mission' for your task and 'hint' if you are stuck.\nFlags look like FLAG{...} and are sent with: submit <flag>\n\nYour first flag:  FLAG{recon_starts_with_looking}\n");
  i.c[".todo"] = F("TODO (admin): delete old notes from the intern account.\nThe auth log lives in /var/log. Review it weekly (never happens).\n\nFLAG{dotfiles_hide_in_plain_sight}\n");
  i.c.old = old;
  addExtra(r, i);
  old.c["passwords.txt"] = F("vault password (encoded so nobody can read it):\ndGVhbHdvbGY5OQ==\n");
  lg.c["auth.log"] = F([
    "Nov 03 02:10:41 sshd: Accepted password for admin from 10.0.0.12",
    "Nov 03 02:14:51 sshd: FAILED login for root from 203.0.113.45",
    "Nov 03 02:14:53 sshd: FAILED login for admin from 203.0.113.45",
    "Nov 03 02:15:02 sshd: FAILED login for guest from 198.51.100.7",
    "Nov 03 02:15:09 sshd: FAILED login for root from 203.0.113.45",
    "Nov 03 02:15:11 sshd: FAILED login for vault from 203.0.113.45",
    "Nov 03 02:15:14 sshd: FAILED login for vault from 203.0.113.45",
    "Nov 03 02:15:20 sshd: Accepted password for intern from 10.0.0.31",
    "Nov 03 02:15:23 sshd: FAILED login for admin from 203.0.113.45",
    "Nov 03 02:15:31 sshd: Accepted password for vault from 203.0.113.45"
  ].join("\n") + "\n");
  v.c["flag.txt"] = F("ACCESS RECORD (auto-generated)\n  02:15:31  user 'vault' logged in from 203.0.113.45\n  02:16:04  copied customers.db (48,112 records)\n  02:16:09  copied payroll.csv\n  02:16:40  session closed\n\nThis was NOT you. This was before the test began.\n\nFLAG{encoding_is_not_encryption}\n");
  return r;
}

M[6].win = "Dana: There it is. At 2:16 AM someone copied 48,112 customer records and the payroll file, using the password Marcus 'protected' with base64. This is a confirmed breach.\nDana: But look at the log again. They tried root, admin and guest, then went straight to 'vault'. Brute force does not do that. They knew which account to hit. Who was this really?\n\nLesson: base64 is a format, not a lock. Real secrets belong in a password manager or vault.";

M.splice(7, 0, {
  t: "Follow the address",
  d: "Every IP address belongs to something. Somewhere on this server is a network map. Find it, work out what 203.0.113.45 actually is, and submit its name.",
  h: "find network, then grep the IP in that file.",
  a: (x) => /lobby/i.test(x),
  win: "Dana: The lobby guest Wi-Fi. The 'hacker' was not overseas. They were physically inside the building, on a network that should never reach the file server. Someone was there at 2 AM.\nDana: Orion keeps badge records. Check who was in the building.\n\nLesson: an IP address is a clue, not an answer. Cross-checking sources turns logs into a story."
}, {
  t: "Who was in the building?",
  d: "The badge log is in /var/log. Look at the early-morning entries of Nov 03 and submit the surname of the Orion employee who was there.",
  h: "grep 'Nov 03' /var/log/badge.log shows that night. Who signed a visitor in?",
  a: (x) => /nair/i.test(x),
  win: "Dana: Priya Nair, the finance director, signed in J. Pike of Brightline Freight at 1:41 AM. Brightline is a competitor. Marcus's email told her exactly where the vault password was. She sat in the lobby, opened the vault, and Pike copied the files.\nDana: Marcus was careless. Priya was the one who did it. We go straight to the CEO, not through Priya.\n\nLesson: security is people and process, not just passwords. Matching logs from different systems by time solves cases."
});

M[9].win = "Dana: Report filed. We showed up for a routine test and caught an insider sale of customer data, hours before their own team would have noticed. The CEO has called in lawyers and locked Priya's accounts.\nDana: Marcus keeps his job, with a password manager and a long talk about guest Wi-Fi. You found it all with ls, grep, pipes and a script. Welcome to Halyard.\n\nLesson: any task you do twice is a candidate for a script.";

["a flag like FLAG{...}", "a flag like FLAG{...}", "an IP address", "a number", "the word: done", "a flag like FLAG{...}", "a flag like FLAG{...}", "the name of the network (a single word is fine)", "a surname", "a number"].forEach((f, i) => M[i].f = f);

function showMission() {
  const m = M[P.done];
  print("── Mission " + (P.done + 1) + " of " + M.length + ": " + m.t + " ──", "pr");
  print(m.d);
  print("Submit " + m.f + " with: submit <answer>   ·   hint for help", "dim");
}

function finale() {
  print("════ CASE CLOSED ════", "pr");
  print("Findings for Orion's report:\n 1. Passwords stored 'encoded' in a plain file (base64 is not encryption)\n 2. Guest Wi-Fi could reach the file server\n 3. After-hours visitor and vault login raised no alert\n 4. Marcus's emails spread the vault's location\n\nSkills you used: navigating, hidden files, grep, pipes, redirects, find, decoding, and a script.\nThe sandbox is still yours: keep exploring, or type 'reset' to replay.", "ok");
}

C.mission = () => {
  if (P.done >= M.length) return finale();
  showMission();
};

C.submit = (a) => {
  if (P.done >= M.length) return finale();
  const m = M[P.done];
  const ans = a.join(" ").trim();
  if (!ans) throw new Error("usage: submit <answer>   (this mission wants " + m.f + ")");
  if (!m.a(ans)) throw new Error("Not it. This mission wants " + m.f + ". Re-read the mission or type 'hint'.");
  P.done++;
  saveP();
  print("✔ Correct", "ok");
  print("");
  print(m.win);
  print("");
  if (P.done < M.length) showMission();
  else finale();
};

[ ["Think about the three basics: where am I, what is here, what does it say?", "One command lists the files in a folder and another prints a file. Check 'help'.", "Your home folder has a note from Dana. The flag is on one of its lines."],
  ["Not everything in a folder is shown by default.", "Shells have a switch that includes hidden items.", "Files that start with a dot are the hidden ones here. One has a flag."],
  ["Do not read the whole log. Ask the computer to show only the interesting lines.", "grep filters lines by text. What word marks a failed attempt?", "After filtering, look for the address that repeats the most."],
  ["You need to filter more than once, then count. Output can flow from one command into the next.", "The | symbol connects commands. The last step should count lines.", "Filter by the address, filter by failure, then count."],
  ["Redirection stores output in a file instead of printing it.", "A symbol after a command points its output at a file instead of the screen.", "Filter the failed lines from the log and send them to failed.txt in your home folder."],
  ["Searching every folder by hand is slow. Both shell families can search the whole disk.", "find searches by name. The filename contains the word 'backup'.", "Use a path-wide search to locate the file."],
  ["The password is not in plain text, but it is not secret either.", "Look through the folders in your home. Decoding is a built-in tool: check 'help'.", "Once decoded, log in to the vault, then read what is inside."],
  ["Where might a network be documented?", "Search the disk for a file about the network, then search inside it for the address.", "The answer is the name the document gives that address."],
  ["Which log records people physically entering the building?", "Filter that log for the date of the breach.", "Look at who brought a visitor in."],
  ["A script is saved commands. Look at the examples in scripts/.", "Your script must read the log, keep only the failed lines, and count them.", "Create the file in your home folder, run it, and submit what it prints."] ].forEach((h, i) => { M[i].hs = h; });

C.hint = (a, o) => {
  if (P.done >= M.length) return o("No more hints: the case is closed.");
  const m = M[P.done];
  P.h = P.h || {};
  const n = P.h[P.done] || 0;
  const k = Math.min(n, m.hs.length - 1);
  P.h[P.done] = n + 1;
  saveP();
  o("Dana (hint " + (k + 1) + " of " + m.hs.length + "): " + m.hs[k] + (k < m.hs.length - 1 ? "\n(type hint again for a bigger nudge)" : ""));
};

async function exec2(line) {
  const stages = line.split(/\|(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/);
  if (stages.length < 2) return exec(line);

  busy = true;
  abort = false;
  let data = "";

  try {
    for (let s = 0; s < stages.length; s++) {
      let st = stages[s].trim();
      let redir = null;
      const last = s === stages.length - 1;

      if (last) {
        const m = st.match(/^(.*?)\s*(>>?)\s*(\S+)$/);
        if (m) {
          st = m[1];
          redir = { ap: m[2] === ">>", file: m[3] };
        }
      }

      const toks = [...st.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((x) => x[1] ?? x[2] ?? x[3]);
      const cmd = norm(toks.shift());
      if (!Object.hasOwn(C, cmd)) throw new Error("unknown command in pipe: " + cmd);
      const buf = [];
      await C[cmd](toks, (t) => buf.push(t), data);
      data = buf.join("\n");

      if (last) {
        if (redir) {
          const text = data + "\n";
          fsApi.write(redir.file, redir.ap ? (get(parts(redir.file))?.d || "") + text : text);
        } else if (data) {
          print(data);
        }
      }
    }
  } catch (e) {
    print(e.message, "err");
  }

  busy = false;
}

async function exec(line) {
  line = line.trim();
  if (!line) return;

  let redir = null;
  const m = line.match(/^(.*?)\s*(>>?)\s*(\S+)\s*$/);
  if (m && (m[1].match(/["']/g) || []).length % 2 === 0) {
    line = m[1];
    redir = { append: m[2] === ">>", file: m[3] };
  }

  const toks = [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((x) => x[1] ?? x[2] ?? x[3]);
  const cmd = norm(toks.shift());
  const args = toks;
  const buf = [];
  const outFn = (t) => redir ? buf.push(t) : print(t);

  abort = false;
  busy = true;

  try {
    if (Object.hasOwn(C, cmd)) {
      await C[cmd](args, outFn);
    } else {
      const cands = [cmd, cmd + ".js", "/programs/" + cmd, "/programs/" + cmd + ".js"];
      const hit = cands.find((c) => {
        const n = get(parts(c));
        return n && n.t === "f";
      });
      if (!hit) throw new Error("unknown command: " + cmd + " (try 'help')");
      await C.run([hit, ...args]);
    }

    if (redir) {
      const text = buf.join("\n") + "\n";
      fsApi.write(redir.file, redir.append ? (get(parts(redir.file))?.d || "") + text : text);
    }
  } catch (e) {
    print(e.message, "err");
  }

  busy = false;
}

function complete() {
  const v = inp.value;
  const idx = v.lastIndexOf(" ") + 1;
  const word = v.slice(idx);
  const slash = word.lastIndexOf("/");
  const dirp = word.slice(0, slash + 1);
  const base = word.slice(slash + 1);

  let pool = [];
  if (idx === 0 && slash < 0) {
    pool = [...Object.keys(C), ...(get(["programs"]) ? Object.keys(get(["programs"]).c).map((k) => k.replace(/\.js$/, "")) : [])];
  } else {
    const d = get(parts(dirp || "."));
    pool = d && d.t === "d" ? Object.keys(d.c).map((k) => k + (d.c[k].t === "d" ? "/" : "")) : [];
  }

  const hits = pool.filter((k) => k.startsWith(base));
  if (hits.length === 1) {
    inp.value = v.slice(0, idx) + dirp + hits[0] + (hits[0].endsWith("/") ? "" : " ");
  } else if (hits.length > 1) {
    let p = hits[0];
    for (const h of hits) while (!h.startsWith(p)) p = p.slice(0, -1);
    inp.value = v.slice(0, idx) + dirp + p;
    print(pl.textContent + v, "dim");
    print(hits.join("  "), "dir");
  }
}

inp.addEventListener("keydown", async (e) => {
  if (e.ctrlKey && e.key === "c") {
    e.preventDefault();
    if (mode === "read" || busy) {
      abort = true;
      if (readRes) {
        const r = readRes;
        readRes = null;
        mode = "shell";
        r.rej(new Error("terminated"));
      }
    } else {
      inp.value = "";
    }
    return;
  }

  if (e.ctrlKey && e.key === "l") {
    e.preventDefault();
    C.clear();
    return;
  }

  if (mode === "shell") {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hi > 0) inp.value = hist[--hi];
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      hi = Math.min(hi + 1, hist.length);
      inp.value = hist[hi] || "";
    } else if (e.key === "Tab") {
      e.preventDefault();
      try { complete(); } catch (err) {}
    }
  }

  if (e.key === "Enter") {
    const v = inp.value;
    inp.value = "";

    if (mode === "read") {
      const r = readRes;
      readRes = null;
      mode = "shell";
      print(pl.textContent + v);
      shellPromptHold();
      r.res(v);
      return;
    }

    if (busy) return;
    print(pl.textContent + v);
    if (v.trim()) {
      hist.push(v);
      hi = hist.length;
    }
    setPrompt("");
    await exec(v);
    partial = null;
    mode = "shell";
    shellPrompt();
    inp.focus();
  }
});

function shellPromptHold() {
  setPrompt("");
}

screen.addEventListener("click", () => {
  if (!window.getSelection().toString()) inp.focus();
});

root = load();
cwd = ["home", "intern"];
try { P = JSON.parse(localStorage.getItem(PKEY)) || P; } catch (e) {}

print("ORION-7 secure file server  ::  authorized assessment", "pr");
print("Halyard Security, Monday 9:02 AM.\nYour first real job: a penetration test for Orion Logistics, a freight company.\nThey signed the paperwork, so everything here is allowed. Stay inside ORION-7.\n\nThis is a made-up machine: nothing here is real. Tab completes names, Up/Down recalls commands, 'help' lists commands.", "dim");
print("");
if (P.done >= M.length) print("Case closed. Type 'reset' to replay.", "ok");
else {
  if (P.done) print("Welcome back.", "ok");
  showMission();
}
print("");
shellPrompt();
inp.focus();

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.theme = "dark";
});

// Extra Unix-style helpers
C.whoami = (a, o) => o(USER);
C.hostname = (a, o) => o(HOST);
C.ll = (a, o) => {
  const flags = ["-l", ...a];
  return C.ls(flags, o);
};
C.man = (a, o) => C.help(a, o);
C.pwd = (a, o) => o(path(cwd) || "/");
C.ls = (a, o) => {
  const args = Array.isArray(a) ? a : [a];
  const flags = args.map((x) => String(x).toLowerCase());
  const all = flags.includes("-a") || flags.includes("-all") || flags.includes("-force");
  const rec = flags.includes("-r") || flags.includes("-recursive");
  const names = args.filter((x) => String(x).charAt(0) !== "-");

  if (rec) {
    walkPaths(names[0] || ".", all).forEach((p) => o(p));
    return;
  }

  const n = get(parts(names[0] || "."));
  if (!n) throw new Error("no such directory");
  if (n.t === "f") return o(names[0] || ".");

  const keys = Object.keys(n.c).filter((k) => all || k[0] !== ".").sort();
  if (keys.length) o(keys.map((k) => n.c[k].t === "d" ? k + "/" : k).join("  "));
};

// keep a Unix shell prompt not a Windows one
const oldSetPrompt = setPrompt;
setPrompt = (s) => {
  const d = shellPromptDisplay(path(cwd));
  pl.textContent = s || `${USER}@${HOST}:${d}$ `;
};

// preserve system prompt on startup and after commands
shellPrompt();
