/* Unix-like shell presentation and commands for the virtual training filesystem.
   This is a safe simulator; commands never access the host operating system. */
"use strict";

const UNIX_HISTORY_KEY = "orion-unix-history-v1";

try {
  const savedHistory = JSON.parse(localStorage.getItem(UNIX_HISTORY_KEY) || "[]");
  if (Array.isArray(savedHistory)) hist = savedHistory.filter((item) => typeof item === "string").slice(-500);
  hi = hist.length;
} catch (error) {
  hist = [];
  hi = 0;
}

function unixHomePath() {
  const current = path(cwd);
  if (current === "/home/intern") return "~";
  if (current.startsWith("/home/intern/")) return "~" + current.slice("/home/intern".length);
  return current || "/";
}

function paintPrompt(value) {
  pl.replaceChildren();
  if (value) {
    pl.textContent = value;
    return;
  }
  const user = document.createElement("span");
  user.className = "prompt-user";
  user.textContent = "intern@orion";
  const separator = document.createTextNode(":");
  const cwdSpan = document.createElement("span");
  cwdSpan.className = "prompt-path";
  cwdSpan.textContent = unixHomePath();
  const symbol = document.createElement("span");
  symbol.className = "prompt-symbol";
  symbol.textContent = "$ ";
  pl.append(user, separator, cwdSpan, symbol);
}

setPrompt = (value) => paintPrompt(value || "");
const unixPrompt = () => paintPrompt("");

/* Convert a small, safe subset of ANSI color codes to text nodes and spans. */
print = (text = "", cls = "") => {
  const ansi = /\x1b\[([0-9;]*)m/g;
  String(text).split("\n").forEach((line) => {
    const node = document.createElement("div");
    node.className = "ln " + cls;
    let last = 0;
    let colorClass = "";
    let match;
    while ((match = ansi.exec(line))) {
      if (match.index > last) appendText(node, line.slice(last, match.index), colorClass);
      const codes = match[1].split(";").map(Number);
      if (codes.includes(0)) colorClass = "";
      if (codes.includes(34) || codes.includes(94)) colorClass = "ansi-blue";
      if (codes.includes(32) || codes.includes(92)) colorClass = "ansi-green";
      last = ansi.lastIndex;
    }
    if (last < line.length) appendText(node, line.slice(last), colorClass);
    out.appendChild(node);
  });
  screen.scrollTop = screen.scrollHeight;
};

function appendText(parent, text, className) {
  if (!className) {
    parent.appendChild(document.createTextNode(text));
    return;
  }
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  parent.appendChild(span);
}

const unixColor = (name, node) => node && node.t === "d" ? `\x1b[34m${name}\x1b[0m` : name;
const unixMode = (node, name) => node.t === "d" ? "drwxr-xr-x" : /\.(js|sh)$/.test(name) ? "-rwxr-xr-x" : "-rw-r--r--";
const unixDate = "Nov  6 09:02";

C.ls = (args, emit) => {
  const values = [...args];
  let all = false;
  let long = false;
  let recursive = false;
  let oneColumn = false;
  for (let index = values.length - 1; index >= 0; index--) {
    const flag = values[index];
    if (!flag.startsWith("-") || flag === "-") continue;
    if (!/^[alR1]+$/.test(flag.slice(1))) continue;
    all ||= flag.includes("a");
    long ||= flag.includes("l");
    recursive ||= flag.includes("R");
    oneColumn ||= flag.includes("1");
    values.splice(index, 1);
  }

  const targets = values.length ? values : ["."];
  const listDirectory = (target, heading) => {
    const components = parts(target);
    const node = get(components);
    if (!node) throw new Error(`ls: cannot access '${target}': No such file or directory`);
    if (node.t === "f") {
      const name = components.at(-1) || target;
      emit(long
        ? `${unixMode(node, name)} 1 intern intern ${String(node.d.length).padStart(6)} ${unixDate} ${name}`
        : unixColor(name, node));
      return;
    }
    if (heading) emit(`${target}:`);

    const entries = Object.keys(node.c).filter((name) => all || !name.startsWith(".")).sort()
      .map((name) => ({ name, node: node.c[name] }));
    if (all) entries.unshift({ name: "..", node }, { name: ".", node });

    if (long) {
      const total = entries.reduce((sum, item) => sum + (item.node.t === "d" ? 8 : Math.max(1, Math.ceil(item.node.d.length / 512))), 0);
      emit(`total ${total}`);
      entries.forEach(({ name, node: child }) => {
        const size = child.t === "f" ? child.d.length : 4096;
        const owner = child.t === "d" && components.length === 0 ? "root" : "intern";
        emit(`${unixMode(child, name)} 1 ${owner} ${owner} ${String(size).padStart(6)} ${unixDate} ${unixColor(name, child)}`);
      });
    } else if (oneColumn || recursive) {
      entries.forEach(({ name, node: child }) => emit(unixColor(name, child)));
    } else if (entries.length) {
      emit(entries.map(({ name, node: child }) => unixColor(name, child)).join("  "));
    }

    if (recursive) {
      entries.forEach(({ name, node: child }) => {
        if (name === "." || name === ".." || child.t !== "d" || (child.lock && !P.unlocked.includes(child.lock))) return;
        emit("");
        listDirectory(path([...components, name]), true);
      });
    }
  };

  targets.forEach((target, index) => {
    if (index) emit("");
    listDirectory(target, targets.length > 1 || recursive);
  });
};

C.ll = (args, emit) => C.ls(["-l", ...args], emit);
C.la = (args, emit) => C.ls(["-a", ...args], emit);
C.whoami = (args, emit) => emit("intern");
C.hostname = (args, emit) => emit("orion");
C.man = (args, emit) => {
  if (!args[0]) return C.help(args, emit);
  const command = args[0];
  const descriptions = { ls: "list directory contents", cat: "concatenate and print files", grep: "print lines that match a pattern", cd: "change the working directory", pwd: "print the working directory" };
  emit(`${command}(1)                 User Commands`);
  emit("");
  emit(`NAME\n    ${command} - ${descriptions[command] || "Unix-like terminal command"}`);
  emit("");
  emit("This is a learning simulator. Type 'help' to see supported commands.");
};
C.help = (args, emit) => emit([
  "GNU/Linux-style commands (simulated):",
  "  ls [-alR] [path]       list directory contents",
  "  cd [path]              change directory; cd - returns to home",
  "  pwd                    print working directory",
  "  cat <file>             print file contents",
  "  grep [-invc] PATTERN [file]  search lines",
  "  find <name>            find matching names",
  "  head/tail [-n N] file  show lines from a file",
  "  wc [-l] [file]         count lines",
  "  sort / uniq [-c]       sort or collapse adjacent duplicates",
  "  mkdir, touch, cp, mv, rm, echo, edit",
  "  command | command      pipe text output",
  "  command > file         redirect output; >> appends",
  "  history                show command history; history -c clears it",
  "  whoami, hostname, date, clear, help, man",
  "",
  "Assessment: mission, hint, submit <answer>, login, decode, reset",
  "Keys: Tab completion · Up/Down history · Ctrl+C interrupt · Ctrl+L clear"
].join("\n"));

C.history = (args, emit) => {
  if (args.includes("-c")) {
    hist = [];
    hi = 0;
    try { localStorage.removeItem(UNIX_HISTORY_KEY); } catch (error) {}
    return;
  }
  emit(hist.map((command, index) => `${String(index + 1).padStart(5)}  ${command}`).join("\n"));
};

C.grep = (args, emit, input = "") => {
  const options = { ignoreCase: false, invert: false, number: false, count: false };
  while (args[0] && /^-[invc]+$/.test(args[0])) {
    for (const flag of args.shift().slice(1)) {
      if (flag === "i") options.ignoreCase = true;
      if (flag === "n") options.number = true;
      if (flag === "v") options.invert = true;
      if (flag === "c") options.count = true;
    }
  }
  if (!args.length) throw new Error("usage: grep [-invc] PATTERN [FILE]");
  const pattern = args.shift();
  const sources = args.length ? args.map((file) => ({ file, text: fsApi.read(file) })) : [{ file: "", text: String(input || "") }];
  const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), options.ignoreCase ? "i" : "");
  sources.forEach(({ file, text }) => {
    const matches = String(text).split("\n").filter((line) => (regex.test(line) !== options.invert));
    if (options.count) emit(String(matches.length));
    else matches.forEach((line, index) => emit(`${sources.length > 1 ? file + ":" : ""}${options.number ? index + 1 + ":" : ""}${line}`));
  });
};

const previousCd = C.cd;
C.cd = (args) => {
  if (args[0] === "-") {
    previousCd(["~"]);
    return;
  }
  previousCd(args);
};

const previousExec = exec;
exec = async (commandLine) => {
  const line = String(commandLine).trim();
  if (!line) return;
  const segments = line.split(/\|(?=(?:[^"']*["'][^"']*["'])*[^"']*$)/);
  let input = "";
  let redirect = null;

  try {
    for (let index = 0; index < segments.length; index++) {
      let segment = segments[index].trim();
      const last = index === segments.length - 1;
      if (last) {
        const match = segment.match(/^(.*?)\s*(>>?)\s*(\S+)$/);
        if (match && (match[1].match(/["']/g) || []).length % 2 === 0) {
          segment = match[1].trim();
          redirect = { append: match[2] === ">>", file: match[3] };
        }
      }
      const tokens = [...segment.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((match) => match[1] ?? match[2] ?? match[3]);
      const command = (tokens.shift() || "").toLowerCase();
      if (!command) continue;
      if (command === "ll") tokens.unshift("-l");
      if (command === "la") tokens.unshift("-a");
      const handler = C[command];
      if (!handler) {
        const candidates = [command, command + ".js", "/programs/" + command, "/programs/" + command + ".js"];
        const script = candidates.find((candidate) => {
          const file = get(parts(candidate));
          return file && file.t === "f";
        });
        if (script && !segments.slice(index + 1).length) {
          await C.run([script, ...tokens]);
          input = "";
          continue;
        }
        throw new Error(`bash: ${command}: command not found`);
      }
      const output = [];
      await handler(tokens, (value) => output.push(String(value)), input);
      input = output.join("\n");
      if (last) {
        if (redirect) {
          const contents = input + "\n";
          fsApi.write(redirect.file, redirect.append ? (get(parts(redirect.file))?.d || "") + contents : contents);
        } else if (input) print(input);
      }
    }
  } catch (error) {
    print(error.message, "err");
  }
};

/* Reuse the engine's existing keyboard handler, adding persistence and reverse-search support. */
inp.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && mode === "shell" && inp.value.trim()) {
    queueMicrotask(() => {
      try { localStorage.setItem(UNIX_HISTORY_KEY, JSON.stringify(hist.slice(-500))); } catch (error) {}
    });
  }
  if (event.ctrlKey && event.key === "r") {
    event.preventDefault();
    const query = inp.value;
    const previous = [...hist].reverse().find((item) => item.includes(query));
    if (previous) inp.value = previous;
  }
});

/* Hide legacy status metadata from the older UI and keep the path in the shell title. */
const cwdStatus = $("cwdv");
if (cwdStatus) cwdStatus.hidden = true;
const oldShellPrompt = shellPrompt;
shellPrompt = unixPrompt;
unixPrompt();

