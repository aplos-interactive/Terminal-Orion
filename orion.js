/* Unix-like presentation and shell conveniences layered on the game engine. */
"use strict";

const UNIX_HISTORY_KEY = "orion-unix-history-v1";
const unixExecBase = exec;

try {
  const saved = JSON.parse(localStorage.getItem(UNIX_HISTORY_KEY) || "[]");
  if (Array.isArray(saved)) hist = saved.filter((x) => typeof x === "string").slice(-500);
  hi = hist.length;
} catch (e) {
  hist = [];
  hi = 0;
}

function unixHomePath(ps) {
  const p = path(ps);
  if (p === "/home/intern") return "~";
  if (p.startsWith("/home/intern/")) return "~" + p.slice("/home/intern".length);
  return p || "/";
}

function unixPrompt() {
  pl.textContent = `intern@orion:${unixHomePath(cwd)}$ `;
}

/* Keep interactive prompts (for read/reset) intact; regular shell prompt is Unix style. */
setPrompt = (text) => {
  pl.textContent = text || `intern@orion:${unixHomePath(cwd)}$ `;
};

/* Parse basic ANSI color sequences safely into DOM text and spans. */
print = (text = "", cls = "") => {
  const ansi = /\x1b\[([0-9;]*)m/g;
  String(text).split("\n").forEach((line) => {
    const node = document.createElement("div");
    node.className = "ln " + cls;
    let last = 0;
    let color = "";
    let match;
    while ((match = ansi.exec(line))) {
      if (match.index > last) {
        const part = document.createTextNode(line.slice(last, match.index));
        if (color) {
          const span = document.createElement("span");
          span.className = color;
          span.appendChild(part);
          node.appendChild(span);
        } else node.appendChild(part);
      }
      const codes = match[1].split(";").map(Number);
      if (codes.includes(0)) color = "";
      if (codes.includes(34) || codes.includes(94)) color = "ansi-blue";
      if (codes.includes(32) || codes.includes(92)) color = "ansi-green";
      last = ansi.lastIndex;
    }
    if (last < line.length) {
      const part = document.createTextNode(line.slice(last));
      if (color) {
        const span = document.createElement("span");
        span.className = color;
        span.appendChild(part);
        node.appendChild(span);
      } else node.appendChild(part);
    }
    out.appendChild(node);
  });
  screen.scrollTop = screen.scrollHeight;
};

const unixColor = (name, node) => {
  if (node && node.t === "d") return `\x1b[34m${name}\x1b[0m`;
  return name;
};

const unixMode = (node, name) => {
  if (node.t === "d") return "drwxr-xr-x";
  if (/\.js$|\.sh$/.test(name)) return "-rwxr-xr-x";
  return "-rw-r--r--";
};

const unixTimestamp = "Nov  6 09:02";

C.ls = (args, emit) => {
  const a = [...args];
  let all = false;
  let long = false;
  let recursive = false;
  let oneColumn = false;
  for (let i = a.length - 1; i >= 0; i--) {
    if (!a[i].startsWith("-") || a[i] === "-") continue;
    const flag = a[i].slice(1);
    if (!/^[alR1]+$/.test(flag)) continue;
    if (flag.includes("a")) all = true;
    if (flag.includes("l")) long = true;
    if (flag.includes("R")) recursive = true;
    if (flag.includes("1")) oneColumn = true;
    a.splice(i, 1);
  }
  const targets = a.length ? a : ["."];
  const renderDirectory = (target, heading) => {
    const ps = parts(target);
    const dir = get(ps);
    if (!dir) throw new Error(`ls: cannot access '${target}': No such file or directory`);
    if (dir.t === "f") {
      const full = path(ps);
      const name = ps.at(-1) || "/";
      if (long) emit(`${unixMode(dir, name)} 1 intern intern ${String(dir.d.length).padStart(6)} ${unixTimestamp} ${name}`);
      else emit(unixColor(name, dir));
      return;
    }
    if (heading) emit(`${target}:`);
    const entries = Object.keys(dir.c).filter((name) => all || !name.startsWith(".")).sort();
    const records = entries.map((name) => ({ name, node: dir.c[name] }));
    if (all) records.unshift({ name: "..", node: dir }, { name: ".", node: dir });
    if (long) {
      const total = records.reduce((sum, item) => sum + (item.node.t === "d" ? 4 : Math.max(1, Math.ceil(item.node.d.length / 512))), 0);
      emit(`total ${total}`);
      records.forEach(({ name, node }) => {
        const size = node.t === "f" ? node.d.length : 4096;
        const coloredName = unixColor(name, node);
        emit(`${unixMode(node, name)} 1 ${node.t === "d" ? "root" : "intern"} ${node.t === "d" ? "root" : "intern"} ${String(size).padStart(6)} ${unixTimestamp} ${coloredName}`);
      });
    } else if (oneColumn || recursive) {
      records.forEach(({ name, node }) => emit(unixColor(name, node)));
    } else if (records.length) {
      emit(records.map(({ name, node }) => unixColor(name, node)).join("  "));
    }
    if (recursive) {
      for (const { name, node } of records) {
        if (name === "." || name === ".." || node.t !== "d" || (node.lock && !P.unlocked.includes(node.lock))) continue;
        emit("");
        renderDirectory(path([...ps, name]), true);
      }
    }
  };

  targets.forEach((target, index) => {
    if (targets.length > 1 && index) emit("");
    renderDirectory(target, targets.length > 1 || recursive);
  });
};

C.ll = (a, o) => C.ls(["-l", ...a], o);
C.la = (a, o) => C.ls(["-a", ...a], o);
C.whoami = (a, o) => o("intern");
C.hostname = (a, o) => o("orion");
C.history = (a, o) => {
  if (a.includes("-c")) {
    hist = [];
    hi = 0;
    try { localStorage.removeItem(UNIX_HISTORY_KEY); } catch (e) {}
    return;
  }
  o(hist.map((command, index) => `${String(index + 1).padStart(5)}  ${command}`).join("\n"));
};
C.man = (a, o) => {
  if (!a[0]) return C.help(a, o);
  const command = a[0];
  o(`${command}(1)                 User Commands`);
  o("");
  o(`NAME\n    ${command} - ${command === "ls" ? "list directory contents" : command === "grep" ? "print lines that match a pattern" : "Unix-like terminal command"}`);
  o("");
  o("Try 'help' for the commands available in this learning environment.");
};

/* The browser console is a simulator, not a host shell: keep commands inside its virtual filesystem. */
exec = async (line) => {
  line = line.trim();
  if (!line) return;
  const stages = line.split(/\|(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/);
  const pipes = stages.length > 1;
  let input = "";
  let redirect = null;

  try {
    for (let index = 0; index < stages.length; index++) {
      let stage = stages[index].trim();
      const last = index === stages.length - 1;
      if (last) {
        const redir = stage.match(/^(.*?)\s*(>>?)\s*(\S+)$/);
        if (redir && (redir[1].match(/["']/g) || []).length % 2 === 0) {
          stage = redir[1].trim();
          redirect = { append: redir[2] === ">>", file: redir[3] };
        }
      }
      const tokens = [...stage.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
      const command = (tokens.shift() || "").toLowerCase();
      if (!command) continue;
      if (command === "ll") { tokens.unshift("-l"); }
      if (command === "la") { tokens.unshift("-a"); }
      const output = [];
      const handler = C[command];
      if (!handler) throw new Error(`bash: ${command}: command not found`);
      await handler(tokens, (value) => output.push(String(value)), input);
      input = output.join("\n");
      if (last) {
        if (redirect) {
          const text = input + "\n";
          fsApi.write(redirect.file, redirect.append ? (get(parts(redirect.file))?.d || "") + text : text);
        } else if (input) {
          print(input);
        }
      }
    }
  } catch (error) {
    print(error.message, "err");
  }

  if (!/^login\s/.test(line)) {
    try { localStorage.setItem(UNIX_HISTORY_KEY, JSON.stringify(hist.slice(-500))); } catch (e) {}
  }
};

/* Existing key handler records the command before calling exec; persist and restore shell-like history. */
inp.addEventListener("keydown", (event) => {
  if (event.key === "ArrowUp" && event.ctrlKey) {
    event.preventDefault();
    const value = inp.value;
    const match = [...hist].reverse().find((item) => item.includes(value));
    if (match) inp.value = match;
  }
});

unixPrompt();
