// @t(kw,id)
// \  \@ \\
// @hidden("x") data-hidden="true" data-reveal-on="x"
// @u("path") @u(["path",false])
const TREE_SEL = ".tree";

function textNode(txt) {
  return document.createTextNode(txt);
}

// Decode only string-literal escapes for display: \" -> ", \\ -> \
function decodeStringToken(tok) {
  if (tok.length >= 2 && tok[0] === '"' && tok[tok.length - 1] === '"') {
    const s = tok.slice(1, -1);
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "\\" && i + 1 < s.length) {
        const nx = s[i + 1];
        if (nx === "\\") {
          // ||nx === '"'
          out += nx;
          i++;
          continue;
        }
        // keep unknown escapes literally
        out += "\\" + nx;
        i++;
        continue;
      }
      out += ch;
    }
    return '"' + out + '"';
  }
  return tok;
}

// Tokenizer with escapes and quoted strings
function tokenize(line) {
  const tokens = [];
  let i = 0;
  const n = line.length;
  let buf = "";
  let inStr = false;
  while (i < n) {
    const ch = line[i];
    if (inStr) {
      if (ch === "\\") {
        // keep simple escapes inside strings
        if (i + 1 < n) {
          buf += line[i] + line[i + 1];
          i += 2;
          continue;
        }
      }
      if (ch === '"') {
        buf += ch;
        i++;
        inStr = false;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      // flush previous token
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
      buf += ch;
      inStr = true;
      i++;
      continue;
    }

    if (ch === "\\") {
      const next = i + 1 < n ? line[i + 1] : "";
      if (next === " " || next === "\t" || next === "\n") {
        // escape whitespace: include it in token, don't split
        buf += next;
        i += 2;
        continue;
      } else if (next === "@" || next === "\\") {
        // escape @ or \
        buf += next;
        i += 2;
        continue;
      } else {
        // unknown sequence: keep backslash and next char
        if (next) {
          buf += "\\" + next;
          i += 2;
        } else {
          buf += "\\";
          i++;
        }
        continue;
      }
    }

    if (ch === " " || ch === "\t") {
      if (buf) {
        tokens.push(buf);
        buf = "";
      }
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  if (buf) tokens.push(buf);
  return tokens;
}

// Parse trailing annotations
function parseAnnotations(raw) {
  const ann = { types: null, hidden: null, url: null, urlBlank: true };
  const dirRe = /@([a-zA-Z]+)\(([^)]*)\)/g;
  let m;
  const seen = [];
  while ((m = dirRe.exec(raw))) {
    seen.push({
      name: m[1],
      body: m[2].trim(),
      start: m.index,
      end: dirRe.lastIndex,
    });
  }
  let cleaned = raw;
  if (seen.length > 0) {
    const minStart = Math.min(...seen.map((d) => d.start));
    cleaned = raw.slice(0, minStart).trimEnd();
  }

  for (const d of seen) {
    const name = d.name.toLowerCase();
    const body = d.body.trim();
    if (name === "t") {
      const parts = body
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      ann.types = parts.map((s) => s.replace(/^"|"$/g, ""));
    } else if (name === "hidden") {
      const m2 = body.match(/^\s*"([^"]*)"\s*$/);
      if (m2) ann.hidden = m2[1];
    } else if (name === "u") {
      const b = body.trim();
      if (b.startsWith("[")) {
        try {
          const arr = JSON.parse(b);
          if (Array.isArray(arr) && arr.length >= 1) {
            ann.url = arr[0];
            ann.urlBlank = arr.length >= 2 ? !!arr[1] : true;
          }
        } catch (_) {}
      } else {
        const m2 = b.match(/^\s*"([^"]*)"\s*$/);
        if (m2) {
          ann.url = m2[1];
          ann.urlBlank = true;
        }
      }
    }
  }

  return { cleaned, ann };
}

function parseCatalog(text) {
  const lines = text.split(/\r?\n/);
  const root = { children: [] };
  const stack = [{ indent: -1, node: root }];

  for (let rawLine of lines) {
    if (!rawLine.trim()) continue; // skip empty
    const indentSpaces = (rawLine.match(/^\s*/) || [""])[0].length;
    const indent = Math.floor(indentSpaces / 2); // 2-space indentation
    let line = rawLine.trim();

    const { cleaned, ann } = parseAnnotations(line);
    line = cleaned.trim();
    if (!line) continue;

    const toks = tokenize(line);
    const types = (ann.types || []).slice(0, toks.length);
    if (ann.types && ann.types.length !== toks.length) {
      console.warn(
        `[treeloader] @t count (${ann.types.length}) != tokens (${toks.length}) for: ${line}`,
      );
    }
    while (types.length < toks.length) types.push("id");

    const node = {
      tokens: toks.map((t, i) => ({ text: t, type: types[i] || "id" })),
      url: ann.url || null,
      urlBlank: ann.urlBlank !== false,
      hidden: ann.hidden || null,
      children: [],
    };

    while (stack.length && indent <= stack[stack.length - 1].indent)
      stack.pop();
    const parent = stack[stack.length - 1].node;
    parent.children.push(node);
    stack.push({ indent, node });
  }

  return root.children;
}

function renderNodes(nodes, containerUl) {
  for (const n of nodes) {
    const li = document.createElement("li");
    if (n.hidden) {
      li.dataset.hidden = "true";
      li.dataset.revealOn = n.hidden;
    }

    const isLink = !!n.url;
    const head = document.createElement(isLink ? "a" : "div");
    head.className = "node code";
    if (isLink) {
      head.href = n.url;
      if (n.urlBlank) {
        head.target = "_blank";
        head.rel = "noopener";
      }
    }
    n.tokens.forEach((tk, idx) => {
      const span = document.createElement("span");
      span.className = tk.type || "id";
      const display = decodeStringToken(tk.text);
      span.appendChild(textNode(display));
      head.appendChild(span);
      if (idx < n.tokens.length - 1) head.appendChild(textNode(" "));
    });

    li.appendChild(head);

    if (n.children && n.children.length) {
      const ul = document.createElement("ul");
      renderNodes(n.children, ul);
      li.appendChild(ul);
    }
    containerUl.appendChild(li);
  }
}

async function load() {
  const tree = document.querySelector(TREE_SEL);
  if (!tree) return;
  let branch = tree.querySelector(".branch");
  if (!branch) {
    branch = document.createElement("ul");
    branch.className = "branch";
    tree.appendChild(branch);
  }
  branch.innerHTML = "";

  try {
    const res = await fetch("catalog.idw", { cache: "no-cache" });
    const txt = await res.text();
    const nodes = parseCatalog(txt);
    renderNodes(nodes, branch);
    document.dispatchEvent(new CustomEvent("tree:ready"));
  } catch (err) {
    console.error("Failed to load catalog.idw:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", load);
} else {
  load();
}
