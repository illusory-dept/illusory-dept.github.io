function initSyntaxTree() {
  const STORAGE_KEY = "syntaxTreeCollapsed.v1";

  const tree = document.querySelector(".tree");
  const rootLis = tree.querySelectorAll(".branch > li");

  // Collapse state (localStorage)
  let state = loadState();
  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (_) {
      return {};
    }
  }
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }
  const hasAnyState = () => Object.keys(state).length > 0;

  // Utilities
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function ensureSpacer(li) {
    // Add a spacer in the twist column for leaf nodes so they align with siblings
    const firstNode = li.querySelector(":scope > .node, :scope > a.node");
    const hasTwist = !!li.querySelector(":scope > .twist");
    const hasSpacer = !!li.querySelector(":scope > .twist-spacer");
    if (firstNode && !hasTwist && !hasSpacer) {
      const sp = document.createElement("span");
      sp.className = "twist-spacer";
      sp.setAttribute("aria-hidden", "true");
      li.insertBefore(sp, firstNode);
    }
  }

  function makeToggle(li, uid) {
    li.dataset.uid = uid;
    const hasChildren = !!li.querySelector(":scope > ul");

    if (!hasChildren) {
      ensureSpacer(li);
      return;
    }

    li.classList.add("has-children");

    // caret
    const twist = document.createElement("button");
    twist.className = "twist";
    twist.setAttribute("aria-label", "Toggle children");
    twist.setAttribute("aria-expanded", "true");
    li.insertBefore(twist, li.firstChild);

    const setCollapsed = (collapsed, { persist = true } = {}) => {
      li.classList.toggle("collapsed", collapsed);
      twist.setAttribute("aria-expanded", String(!collapsed));
      if (persist) {
        state[uid] = !!collapsed;
        saveState();
      }
    };

    // restore saved state
    if (state[uid]) {
      li.classList.add("collapsed");
      twist.setAttribute("aria-expanded", "false");
    }

    twist.addEventListener("click", () =>
      setCollapsed(!li.classList.contains("collapsed")),
    );

    // click/keyboard on header toggles too
    const header = li.querySelector(":scope > .node.code:not(a)");
    if (header) {
      header.classList.add("clickable");
      header.setAttribute("tabindex", "0");
      header.setAttribute("role", "button");
      const toggle = () => twist.click();
      header.addEventListener("click", toggle);
      header.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    }
  }

  // Assign stable uids by index path (e.g., "0.2.1")
  rootLis.forEach(function init(li, i) {
    const base = String(i);
    function walk(node, prefix) {
      makeToggle(node, prefix);
      const kids = node.querySelectorAll(":scope > ul > li");
      kids.forEach((child, j) => walk(child, prefix + "." + j));
    }
    walk(li, base);
  });

  // Ensure all leaf nodes get spacers (including ones that may appear later)
  $$(".tree li").forEach(ensureSpacer);

  // Expand/Collapse all
  function setExpandedAll(expanded, { persist = true } = {}) {
    $$(".has-children", tree).forEach((li) => {
      const uid = li.dataset.uid;
      li.classList.toggle("collapsed", !expanded);
      const btn = li.querySelector(":scope > .twist");
      if (btn) btn.setAttribute("aria-expanded", String(expanded));
      if (persist && uid) state[uid] = !expanded;
    });
    if (persist) saveState();
  }
  function applyState() {
    $$(".has-children", tree).forEach((li) => {
      const collapsed = !!state[li.dataset.uid];
      li.classList.toggle("collapsed", collapsed);
      const btn = li.querySelector(":scope > .twist");
      if (btn) btn.setAttribute("aria-expanded", String(!collapsed));
    });
  }

  // Search
  // ======
  const input = $("#search");
  const clearBtn = $("#clearBtn");
  const allLis = $$(".tree li");
  const secretLis = $$('li[data-hidden="true"][data-reveal-on]');
  secretLis.forEach((li) => {
    li.style.display = "none";
    ensureSpacer(li);
  });

  function clearHits() {
    $$('.node[data-hit="true"]').forEach((n) => n.removeAttribute("data-hit"));
  }
  function isSpecialHidden(li, qLower) {
    const trigger = (li.dataset.revealOn || "").toLowerCase();
    return li.dataset.hidden === "true" && qLower !== trigger;
  }

  // helpers for showing/hiding & expanding whole subtrees
  function showSubtree(li) {
    li.style.display = "";
    li.querySelectorAll("li").forEach((el) => (el.style.display = ""));
  }
  function hideSubtree(li) {
    li.style.display = "none";
    li.querySelectorAll("li").forEach((el) => (el.style.display = "none"));
  }
  function expandSubtree(li) {
    // expand li and every descendant that has children
    const allBranches = [li, ...li.querySelectorAll(".has-children")];
    allBranches.forEach((node) => {
      node.classList.remove("collapsed");
      const btn = node.querySelector(":scope > .twist");
      if (btn) btn.setAttribute("aria-expanded", "true");
    });
  }

  function revealSpecialMatches(qLower) {
    secretLis.forEach((li) => {
      const trigger = (li.dataset.revealOn || "").toLowerCase();
      if (qLower && qLower === trigger) {
        // make the entire secret subtree visible & expanded
        showSubtree(li);
        expandSubtree(li);

        // mark headline as a hit
        const node = li.querySelector(":scope > .node, :scope > a.node");
        if (node) node.setAttribute("data-hit", "true");

        // ensure ancestors (if ever nested) are visible
        let p = li.parentElement;
        while (p && p !== tree) {
          if (p.tagName === "UL") {
            const pli = p.closest("li");
            if (pli) pli.style.display = "";
          }
          p = p.parentElement;
        }
      } else {
        hideSubtree(li);
      }
    });
  }

  function filter(query) {
    const q = query.trim();
    const qLower = q.toLowerCase();
    clearHits();

    if (!q) {
      allLis.forEach((li) => {
        li.style.display = isSpecialHidden(li, qLower) ? "none" : "";
      });
      if (hasAnyState()) applyState();
      else setExpandedAll(true, { persist: false });
      return;
    }

    allLis.forEach((li) => (li.style.display = "none"));
    setExpandedAll(true, { persist: false }); // expand during search transiently
    revealSpecialMatches(qLower);

    function visit(li) {
      if (isSpecialHidden(li, qLower)) return false;
      const node = li.querySelector(":scope > .node, :scope > a.node");
      const text = node ? node.textContent.toLowerCase() : "";
      const selfHit = qLower && text.includes(qLower);
      if (selfHit && node) node.setAttribute("data-hit", "true");

      let childHit = false;
      li.querySelectorAll(":scope > ul > li").forEach((child) => {
        if (visit(child)) childHit = true;
      });

      const show = selfHit || childHit;
      if (show) {
        li.style.display = "";
        // reveal ancestors
        let p = li.parentElement;
        while (p && p !== tree) {
          if (p.tagName === "UL") {
            const pli = p.closest("li");
            if (pli && !isSpecialHidden(pli, qLower)) pli.style.display = "";
          }
          p = p.parentElement;
        }
      }
      return show;
    }
    tree.querySelectorAll(":scope > .branch > li").forEach(visit);
  }

  input.addEventListener("input", (e) => filter(e.target.value));
  clearBtn.addEventListener("click", () => {
    input.value = "";
    filter("");
    input.focus();
  });

  // Buttons
  $("#expandAllBtn").addEventListener("click", () => setExpandedAll(true));
  $("#collapseAllBtn").addEventListener("click", () => setExpandedAll(false));

  // Footer year
  $("#year").textContent = new Date().getFullYear();

  // M-x palette
  const mx = $("#mx");
  const mxInput = $("#mxInput");
  const mxList = $("#mxList");

  const COMMANDS = [
    {
      id: "expand-all",
      title: "expand-all",
      desc: "Expand all branches",
      run: () => setExpandedAll(true),
    },
    {
      id: "collapse-all",
      title: "collapse-all",
      desc: "Collapse all branches",
      run: () => setExpandedAll(false),
    },
    {
      id: "focus-search",
      title: "focus-search",
      desc: "Focus the search box",
      run: () => {
        closeMx();
        input.focus();
      },
    },
    {
      id: "clear-search",
      title: "clear-search",
      desc: "Clear search and restore view",
      run: () => {
        input.value = "";
        filter("");
        closeMx();
      },
    },
    // {
    //   id: "wisdom",
    //   title: "wisdom",
    //   desc: "",
    //   run: () => {
    //     input.value = "wisdom";
    //     filter("wisdom");
    //     closeMx();
    //   },
    // },
  ];

  function openMx() {
    mx.hidden = false;
    mxInput.value = "";
    renderMx("");
    mxInput.focus();
  }
  function closeMx() {
    mx.hidden = true;
  }

  // Simple fuzzy score
  function score(item, q) {
    const s = item.title.toLowerCase();
    const t = (q || "").toLowerCase();
    if (!t) return 1;
    if (s === t) return 100;
    if (s.startsWith(t)) return 50;
    let i = 0,
      j = 0,
      hits = 0;
    while (i < s.length && j < t.length) {
      if (s[i++] === t[j]) {
        j++;
        hits++;
      }
    }
    return hits;
  }

  let mxSel = 0;
  function renderMx(q) {
    const items = COMMANDS.map((c) => ({ c, sc: score(c, q) }))
      .filter((x) => x.sc > 0 || q === "")
      .sort((a, b) => b.sc - a.sc)
      .slice(0, 7);

    mxList.innerHTML = "";
    items.forEach(({ c }, idx) => {
      const li = document.createElement("li");
      li.className = "mx-item" + (idx === 0 ? " selected" : "");
      li.setAttribute("role", "option");
      li.dataset.cmd = c.id;
      li.innerHTML = `<span class="mx-item-title">${c.title}</span><span class="mx-item-desc">${c.desc}</span>`;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        runCommand(c.id);
      });
      mxList.appendChild(li);
    });
    mxSel = 0;
  }

  function runCommand(idOrRaw) {
    const id = (idOrRaw || "").toString().trim().toLowerCase();
    const cmd = COMMANDS.find((c) => c.id === id);
    if (cmd) {
      cmd.run();
      return;
    }
    const best = COMMANDS.map((c) => ({ c, sc: score(c, id) })).sort(
      (a, b) => b.sc - a.sc,
    )[0];
    if (best && best.sc > 0) {
      best.c.run();
      return;
    }
    mx.classList.add("mx-shake");
    setTimeout(() => mx.classList.remove("mx-shake"), 250);
  }

  // shortcut handler
  const hint = document.querySelector(".kbd-hint");
  if (hint) {
    hint.tabIndex = 0;
    hint.addEventListener("click", () => openMx());
    hint.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMx();
      }
    });
  }

  function isMxCombo(e) {
    // Use physical key; on macOS Option+X -> key is "≈"
    const isKeyX = e.code === "KeyX";
    const altGraph = e.getModifierState && e.getModifierState("AltGraph");
    return isKeyX && (e.altKey || altGraph) && !e.metaKey && !e.shiftKey;
  }

  function onGlobalKeyDown(e) {
    if (isMxCombo(e)) {
      e.preventDefault(); // prevents "≈" or other glyphs from being inserted
      openMx();
      return;
    }
    if (!mx.hidden && e.key === "Escape") {
      e.preventDefault();
      closeMx();
    }
  }

  // Listen in capture phase so we win even when focus is in an <input> or <textarea>
  window.addEventListener("keydown", onGlobalKeyDown, true);

  mxInput.addEventListener("input", () => renderMx(mxInput.value));
  mxInput.addEventListener("keydown", (e) => {
    const items = Array.from(mxList.querySelectorAll(".mx-item"));
    const n = items.length;
    if (n === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      mxSel = (mxSel + 1) % n; // wrap to top
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      mxSel = (mxSel - 1 + n) % n; // wrap to bottom
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = items[mxSel];
      if (chosen) runCommand(chosen.dataset.cmd || mxInput.value);
      return;
    }
    items.forEach((el, i) => el.classList.toggle("selected", i === mxSel));
  });

  // Close when clicking outside the palette
  window.addEventListener(
    "mousedown",
    (e) => {
      if (!mx.hidden && !mx.contains(e.target)) {
        closeMx();
      }
    },
    true,
  ); // capture so it runs even if other handlers stop propagation
}

function tryInit() {
  const hasTree = document.querySelector(".tree .branch > li");
  if (hasTree) {
    initSyntaxTree();
  } else {
    const once = () => {
      document.removeEventListener("tree:ready", once);
      initSyntaxTree();
    };
    document.addEventListener("tree:ready", once);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", tryInit);
} else {
  tryInit();
}
