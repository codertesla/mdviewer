(() => {
  "use strict";

  const editor = document.getElementById("editor");
  const preview = document.getElementById("preview");
  const filenameEl = document.getElementById("filename");
  const wordCountEl = document.getElementById("word-count");
  const fileInput = document.getElementById("file-input");
  const editorPane = document.getElementById("editor-pane");
  const dropVeil = document.getElementById("drop-veil");
  const toc = document.getElementById("toc");
  const tocList = document.getElementById("toc-list");
  const tocToggle = document.getElementById("toc-toggle");
  const tocClose = document.getElementById("toc-close");
  const backTop = document.getElementById("back-top");
  const progress = document.getElementById("reading-progress");

  marked.setOptions({ gfm: true, breaks: true });

  const PLACEHOLDER_HTML = `<div class="placeholder">
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>
    <path d="M14 3v5h5"/>
    <path d="M9 13h6M9 17h6"/>
  </svg>
  <p>输入内容后自动渲染，或点击「示例」查看效果</p>
</div>`;

  const SAMPLE = `# Markdown 实时预览

这是一个 **简洁** 的 Markdown 渲染工具，支持 *输入*、*上传* 与 *拖拽* 三种方式导入文档，点击右上角的全屏按钮即可进入纯阅读模式。

## 功能特性

- [x] 输入即渲染，无需任何操作
- [x] 支持上传 \`.md\` / \`.markdown\` 文件
- [x] 全屏阅读 + 自动目录导航
- [ ] 一键导出渲染后的 HTML

## 代码示例

\`\`\`js
function greet(name) {
  return \\\`你好，\\\${name}！\\\`;
}

console.log(greet("世界"));
\`\`\`

> 行内的 \`code\` 片段、引用块与代码块的**语言标签**都有良好的视觉样式。

### 表格示例

| 版本   | 下载量 | 支持 GFM | 发布时间 |
| ------ | -----: | :------: | -------- |
| v1.0   | 12,480 |    ✅    | 2023-02 |
| v2.0   | 48,215 |    ✅    | 2024-06 |
| v3.0   | 96,701 |    ✅    | 2025-11 |

表格支持**粘性表头**，滚动时表头固定，数字列自动右对齐。

### 引用与分隔

> 阅读模式右侧有自动目录，点击即可跳转到对应章节，滚动时高亮当前位置。

---

**提示：** 点击右上角「打开 .md」或直接拖拽文件到编辑器，即可导入本地文档。
`;

  /* ---------- 工具 ---------- */

  const getScroller = () =>
    document.body.classList.contains("reading-mode")
      ? document.scrollingElement
      : preview;

  const escapeHtml = (s) =>
    s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));

  function slugify(text, used) {
    let s = text
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}_-]+/gu, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    if (!s) s = "section";
    const base = s;
    let i = 2;
    while (used.has(s)) s = `${base}-${i++}`;
    used.add(s);
    return s;
  }

  /* ---------- 渲染 ---------- */

  function enhanceCodeBlocks() {
    preview.querySelectorAll("pre code[class^='language-']").forEach((block) => {
      const pre = block.parentElement;
      if (pre.querySelector(".lang-badge")) return;
      const badge = document.createElement("span");
      badge.className = "lang-badge";
      badge.textContent = block.className.replace("language-", "");
      pre.appendChild(badge);
    });
  }

  function enhanceTables() {
    preview.querySelectorAll("table").forEach((table) => {
      const rows = [...table.querySelectorAll("tr")];
      if (rows.length < 3) return;
      const colCount = rows[0].children.length;
      for (let c = 0; c < colCount; c++) {
        const cells = rows.slice(1).map((r) => r.children[c]).filter(Boolean);
        if (cells.length < 3) continue;
        const numeric = cells.filter((td) =>
          /^[-+]?\d[\d,.]*(%|℃|°|万|亿)?$/.test(td.textContent.trim())
        ).length;
        if (numeric / cells.length >= 0.8) {
          cells.forEach((td) => td.classList.add("num"));
        }
      }
    });
  }

  /* ---------- 目录 ---------- */

  let tocItems = [];

  function buildToc() {
    const used = new Set();
    tocItems = [...preview.querySelectorAll("h1, h2, h3")].map((h) => {
      h.id = slugify(h.textContent, used);
      const level = h.tagName === "H1" ? 1 : h.tagName === "H2" ? 2 : 3;
      return { h, level };
    });

    tocList.innerHTML = tocItems
      .map(
        (item, i) =>
          `<li><a href="#${item.h.id}" data-index="${i}" data-level="${item.level}">${escapeHtml(item.h.textContent)}</a></li>`
      )
      .join("");

    tocList.querySelectorAll("a").forEach((a, i) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        scrollToHeading(tocItems[i]);
        if (toc.classList.contains("open")) closeToc();
      });
    });

    const hasToc = tocItems.length > 0;
    toc.hidden = !hasToc;
    tocToggle.hidden = !hasToc;
    if (!hasToc) toc.classList.remove("open");
    updateTocActive();
  }

  let programmatic = false;

  function jumpScroll(sc, top) {
    programmatic = true;
    sc.scrollTop = Math.max(0, top);
    requestAnimationFrame(() => {
      programmatic = false;
    });
  }

  function smoothScrollTo(sc, top) {
    const target = Math.max(0, top);
    const start = sc.scrollTop;
    const delta = target - start;
    if (Math.abs(delta) < 2) {
      jumpScroll(sc, target);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      jumpScroll(sc, target);
      return;
    }
    programmatic = true;
    const dur = 280;
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      sc.scrollTop = start + delta * ease(p);
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        requestAnimationFrame(() => {
          programmatic = false;
        });
      }
    };
    requestAnimationFrame(step);
  }

  function scrollToHeading(item) {
    const sc = getScroller();
    const rect = item.h.getBoundingClientRect();
    const scTop =
      sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
    smoothScrollTo(sc, sc.scrollTop + rect.top - scTop - 16);
  }

  function updateTocActive() {
    if (!tocItems.length) return;
    const sc = getScroller();
    const top =
      sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top;
    const mark = top + 96;
    let idx = -1;
    for (let i = 0; i < tocItems.length; i++) {
      if (tocItems[i].h.getBoundingClientRect().top <= mark) idx = i;
      else break;
    }
    const links = tocList.querySelectorAll("a");
    links.forEach((a, i) => a.classList.toggle("active", i === idx));
  }

  function openToc() {
    toc.classList.add("open");
  }

  function closeToc() {
    toc.classList.remove("open");
  }

  tocToggle.addEventListener("click", () => {
    if (toc.classList.contains("open")) closeToc();
    else {
      closeDocsPanel();
      openToc();
    }
  });

  tocClose.addEventListener("click", closeToc);

  /* ---------- 滚动 UI ---------- */

  function updateScrollUI() {
    const sc = getScroller();
    const max = sc.scrollHeight - sc.clientHeight;
    const pct = max > 0 ? sc.scrollTop / max : 0;
    progress.style.transform = `scaleX(${Math.min(1, Math.max(0, pct))})`;
    backTop.classList.toggle("show", sc.scrollTop > 240);
    updateTocActive();
  }

  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateScrollUI();
        ticking = false;
      });
    },
    true
  );

  backTop.addEventListener("click", () => {
    smoothScrollTo(getScroller(), 0);
  });

  /* ---------- 编辑 / 预览滚动同步 ---------- */

  let syncingFlag = false;
  let syncTicking = false;
  let syncSource = null;

  function applySync(src) {
    if (document.body.classList.contains("reading-mode")) return;
    const target = src === editor ? preview : editor;
    const maxS = src.scrollHeight - src.clientHeight;
    if (maxS <= 0) return;
    const maxT = target.scrollHeight - target.clientHeight;
    const next = Math.round((src.scrollTop / maxS) * maxT);
    if (Math.abs(target.scrollTop - next) > 1) {
      syncingFlag = true;
      target.scrollTop = next;
      requestAnimationFrame(() => {
        syncingFlag = false;
      });
    }
  }

  function scheduleSync(src) {
    syncSource = src;
    if (syncTicking) return;
    syncTicking = true;
    requestAnimationFrame(() => {
      syncTicking = false;
      if (syncSource) applySync(syncSource);
    });
  }

  editor.addEventListener("scroll", () => {
    if (programmatic || syncingFlag) return;
    scheduleSync(editor);
  });

  preview.addEventListener("scroll", () => {
    if (programmatic || syncingFlag) return;
    scheduleSync(preview);
  });

  /* ---------- 主渲染 ---------- */

  function render() {
    const text = editor.value;
    preview.innerHTML = text.trim() ? marked.parse(text) : PLACEHOLDER_HTML;
    enhanceCodeBlocks();
    enhanceTables();
    buildToc();
    updateScrollUI();
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    wordCountEl.textContent = text.length ? `${text.length} 字符 · ${words} 词` : "0 字符";
  }

  let timer = null;
  editor.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(render, 120);
  });

  function loadText(text, name, openReading = false) {
    editor.value = text;
    render();
    if (name) {
      currentDocName = name;
      filenameEl.textContent = name;
      filenameEl.hidden = false;
    }
    jumpScroll(preview, 0);
    jumpScroll(getScroller(), 0);
    if (openReading && !document.body.classList.contains("reading-mode")) {
      setReading(true);
    }
  }

  /* ---------- 操作按钮 ---------- */

  document.getElementById("btn-sample").addEventListener("click", () => {
    loadText(SAMPLE, "示例.md");
    editor.focus();
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    editor.value = "";
    filenameEl.hidden = true;
    render();
    editor.focus();
  });

  document.getElementById("btn-open").addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result);
      loadText(content, file.name, true);
      saveDoc(file.name, content);
    };
    reader.readAsText(file);
    fileInput.value = "";
  });

  /* ---------- 文档库（localStorage） ---------- */

  const DOCS_KEY = "md-preview-docs";
  const MAX_DOCS = 20;
  const docsPanel = document.getElementById("docs-panel");
  const docsList = document.getElementById("docs-list");
  const docsEmpty = document.getElementById("docs-empty");
  const docsCount = document.getElementById("docs-count");
  let currentDocName = null;

  function loadDocs() {
    try {
      const raw = localStorage.getItem(DOCS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function persistDocs(docs) {
    try {
      localStorage.setItem(DOCS_KEY, JSON.stringify(docs));
      return true;
    } catch {
      alert("存储空间不足，该文档未能保存");
      return false;
    }
  }

  function saveDoc(name, content) {
    const docs = loadDocs().filter((d) => d.name !== name);
    docs.unshift({ name, content, updatedAt: Date.now() });
    if (docs.length > MAX_DOCS) docs.length = MAX_DOCS;
    if (persistDocs(docs)) renderDocsPanel();
  }

  function deleteDoc(name) {
    persistDocs(loadDocs().filter((d) => d.name !== name));
    renderDocsPanel();
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function renderDocsPanel() {
    const docs = loadDocs().sort((a, b) => b.updatedAt - a.updatedAt);
    docsCount.textContent = docs.length;
    docsCount.hidden = docs.length === 0;
    docsEmpty.hidden = docs.length > 0;
    document.getElementById("docs-clear").disabled = docs.length === 0;
    docsList.innerHTML = "";
    docs.forEach((d) => {
      const li = document.createElement("li");
      li.className = "docs-item";
      if (d.name === currentDocName) li.classList.add("active");

      const nameBtn = document.createElement("button");
      nameBtn.className = "docs-name";
      const nameSpan = document.createElement("span");
      nameSpan.className = "docs-name-text";
      nameSpan.textContent = d.name;
      const meta = document.createElement("span");
      meta.className = "docs-meta";
      meta.textContent = fmtTime(d.updatedAt);
      nameBtn.append(nameSpan, meta);
      nameBtn.addEventListener("click", () => {
        loadText(d.content, d.name, true);
        currentDocName = d.name;
        closeDocsPanel();
        renderDocsPanel();
      });

      const del = document.createElement("button");
      del.className = "docs-del";
      del.textContent = "×";
      del.title = "从文档库删除";
      del.setAttribute("aria-label", `删除 ${d.name}`);
      del.addEventListener("click", () => {
        if (d.name === currentDocName) {
          currentDocName = null;
          filenameEl.hidden = true;
        }
        deleteDoc(d.name);
      });

      li.append(nameBtn, del);
      docsList.appendChild(li);
    });
  }

  const btnDocs = document.getElementById("btn-docs");

  function openDocsPanel() {
    renderDocsPanel();
    closeToc();
    docsPanel.hidden = false;
    btnDocs.setAttribute("aria-expanded", "true");
  }

  function closeDocsPanel() {
    docsPanel.hidden = true;
    btnDocs.setAttribute("aria-expanded", "false");
  }

  btnDocs.addEventListener("click", () => {
    if (docsPanel.hidden) openDocsPanel();
    else closeDocsPanel();
  });

  document.addEventListener("click", (e) => {
    if (!docsPanel.hidden && !e.target.closest(".docs-wrap")) closeDocsPanel();
  });

  document.getElementById("docs-clear").addEventListener("click", () => {
    if (!loadDocs().length) return;
    if (confirm("确定清空全部已保存文档？")) {
      localStorage.removeItem(DOCS_KEY);
      currentDocName = null;
      filenameEl.hidden = true;
      renderDocsPanel();
    }
  });

  document.getElementById("btn-export").addEventListener("click", async () => {
    const body = preview.querySelector(".placeholder") ? "" : preview.innerHTML;
    if (!body) {
      alert("暂无内容可导出");
      return;
    }
    let css = "";
    try {
      const res = await fetch("styles.css");
      css = await res.text();
    } catch {
      /* 离线或本地直开时忽略 */
    }
    const theme = document.documentElement.dataset.theme;
    const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${theme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${(document.title || "Markdown").replace(/</g, "&lt;")}</title>
<style>${css}</style>
</head>
<body>
<main class="preview" style="max-width:800px;margin:0 auto;min-height:100vh;">${body}</main>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "export.html";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  /* ---------- 全屏阅读模式 ---------- */

  const btnFullscreen = document.getElementById("btn-fullscreen");

  function setReading(on) {
    document.body.classList.toggle("reading-mode", on);
    btnFullscreen.setAttribute("aria-pressed", String(on));
    btnFullscreen.title = on ? "退出全屏（Esc）" : "全屏阅读（Esc 退出）";
    closeToc();
    jumpScroll(preview, 0);
    jumpScroll(document.scrollingElement, 0);
    updateScrollUI();
    if (on) {
      preview.focus({ preventScroll: true });
    } else {
      editor.focus();
    }
  }

  btnFullscreen.addEventListener("click", () => {
    setReading(!document.body.classList.contains("reading-mode"));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!docsPanel.hidden) {
      closeDocsPanel();
      return;
    }
    if (toc.classList.contains("open")) {
      closeToc();
      return;
    }
    if (document.body.classList.contains("reading-mode")) {
      setReading(false);
    }
  });

  /* ---------- 拖拽导入 ---------- */

  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");

  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    dropVeil.hidden = false;
  });

  window.addEventListener("dragover", (e) => {
    if (hasFiles(e)) e.preventDefault();
  });

  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropVeil.hidden = true;
  });

  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dropVeil.hidden = true;
    const file = [...e.dataTransfer.files].find(
      (f) =>
        /\.(md|markdown|txt)$/i.test(f.name) ||
        /^(text\/|application\/octet-stream)/.test(f.type)
    );
    if (!file) {
      alert("请拖入 .md / .markdown / .txt 文件");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result);
      loadText(content, file.name, true);
      saveDoc(file.name, content);
    };
    reader.readAsText(file);
  });

  /* ---------- 主题 ---------- */

  const btnTheme = document.getElementById("btn-theme");
  const stored = localStorage.getItem("md-preview-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = stored || (prefersDark ? "dark" : "light");

  btnTheme.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("md-preview-theme", next);
  });

  /* ---------- 移动端 Tab ---------- */

  const tabs = {
    edit: document.getElementById("tab-edit"),
    preview: document.getElementById("tab-preview"),
  };
  const panes = {
    edit: editorPane,
    preview: document.getElementById("preview-pane"),
  };

  function switchTab(name) {
    tabs.edit.classList.toggle("active", name === "edit");
    tabs.preview.classList.toggle("active", name === "preview");
    panes.edit.classList.toggle("active", name === "edit");
    panes.preview.classList.toggle("active", name === "preview");
    if (name === "edit") editor.focus();
  }

  tabs.edit.addEventListener("click", () => switchTab("edit"));
  tabs.preview.addEventListener("click", () => switchTab("preview"));

  if (window.innerWidth <= 820) switchTab("edit");

  render();
  renderDocsPanel();
})();
