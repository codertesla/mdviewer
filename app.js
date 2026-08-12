(() => {
  "use strict";

  const editor = document.getElementById("editor");
  const preview = document.getElementById("preview");
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
  const toastEl = document.getElementById("toast");

  marked.setOptions({ gfm: true, breaks: true });

  // marked 不过滤 HTML：Markdown 里的 <script> 或 onerror 会直接在页面里执行，
  // 所以渲染前一律经过 DOMPurify。禁掉 <style> 是为了防止文档里的 CSS 泄漏到整个应用。
  const SANITIZE_CONFIG = { FORBID_TAGS: ["style"] };

  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName !== "A") return;
    if (!/^https?:/i.test(node.getAttribute("href") || "")) return;
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  });

  const DRAFT_KEY = "md-preview-draft";
  const TITLE_BASE = "MD 预览";
  let currentDocName = null;
  let toastTimer = null;

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function setDocTitle(name) {
    document.title = name ? `${name} - ${TITLE_BASE}` : `${TITLE_BASE} - Markdown 实时渲染`;
  }

  function setFilename(name) {
    currentDocName = name || null;
    setDocTitle(name);
  }

  function saveDraft() {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          content: editor.value,
          name: currentDocName,
          reading: document.body.classList.contains("reading-mode"),
          updatedAt: Date.now(),
        })
      );
    } catch {
      /* quota - ignore draft */
    }
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || typeof data.content !== "string") return null;
      return data;
    } catch {
      return null;
    }
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
  }

  const PLACEHOLDER_HTML = `<div class="placeholder">
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/>
    <path d="M14 3v5h5"/>
    <path d="M9 13h6M9 17h6"/>
  </svg>
  <p>在左侧输入 Markdown，或拖入文件。<br>也可点顶栏「示例」快速体验。</p>
</div>`;

  const SAMPLE = `# Markdown 实时预览

这是一个 **简洁** 的 Markdown 渲染工具，支持 *输入*、*上传* 与 *拖拽* 三种方式导入文档。点右上角全屏按钮即可进入纯阅读模式。

## 功能特性

- [x] 输入即渲染，无需额外操作
- [x] 支持上传 \`.md\` / \`.markdown\` 文件
- [x] 全屏阅读 + 自动目录导航
- [x] 一键导出渲染后的 HTML

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

  const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/gu;

  // 中日韩文本没有空格分词，按空白切会把整段算成一个词，所以汉字逐字计数、
  // 拉丁字母按连续串计数。
  function countWords(text) {
    const cjk = (text.match(CJK_RE) || []).length;
    const rest = text.replace(CJK_RE, " ");
    const latin = (rest.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) || []).length;
    return cjk + latin;
  }

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
      if (rows.length < 2) return;
      const colCount = rows[0].children.length;
      for (let c = 0; c < colCount; c++) {
        const cells = rows.slice(1).map((r) => r.children[c]).filter(Boolean);
        if (!cells.length) continue;
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
    tocToggle.setAttribute("aria-expanded", "true");
  }

  function closeToc() {
    toc.classList.remove("open");
    tocToggle.setAttribute("aria-expanded", "false");
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

  function toSafeHtml(text) {
    try {
      return DOMPurify.sanitize(marked.parse(text), SANITIZE_CONFIG);
    } catch (err) {
      console.error("Markdown 渲染失败", err);
      return `<p class="render-error">渲染失败，以下是原始文本。</p><pre><code>${escapeHtml(text)}</code></pre>`;
    }
  }

  function render() {
    const text = editor.value;
    preview.innerHTML = text.trim() ? toSafeHtml(text) : PLACEHOLDER_HTML;
    enhanceCodeBlocks();
    enhanceTables();
    buildToc();
    updateScrollUI();
    wordCountEl.textContent = text.length
      ? `${text.length} 字符 / ${countWords(text)} 词`
      : "0 字符";
  }

  let timer = null;
  let draftTimer = null;
  editor.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    // 长文档每次都要重新解析并重建 DOM，稍微放宽节流避免输入卡顿。
    timer = setTimeout(render, editor.value.length > 40000 ? 300 : 120);
    if (draftTimer) clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 400);
  });

  function loadText(text, name, openReading = false) {
    editor.value = text;
    render();
    if (name) setFilename(name);
    saveDraft();
    jumpScroll(preview, 0);
    jumpScroll(getScroller(), 0);
    if (openReading && !document.body.classList.contains("reading-mode")) {
      setReading(true);
    }
  }

  /* ---------- 操作按钮 ---------- */

  document.getElementById("btn-brand").addEventListener("click", () => {
    if (document.body.classList.contains("reading-mode")) setReading(false);
    else {
      switchTab("edit");
      editor.focus();
    }
  });

  document.getElementById("btn-sample").addEventListener("click", () => {
    if (editor.value.trim() && !confirm("载入示例将覆盖当前内容，继续？")) return;
    loadText(SAMPLE, "示例.md");
    editor.focus();
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    if (editor.value.trim() && !confirm("确定清空当前内容？")) return;
    editor.value = "";
    setFilename(null);
    setReading(false);
    clearDraft();
    render();
    editor.focus();
  });

  document.getElementById("btn-open").addEventListener("click", () => {
    fileInput.click();
  });

  const MAX_FILE_MB = 2;

  function importFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      showToast(`文件超过 ${MAX_FILE_MB}MB，暂不支持`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result);
      loadText(content, file.name, true);
      saveDoc(file.name, content);
    };
    reader.onerror = () => showToast("文件读取失败，请重试");
    reader.readAsText(file);
  }

  fileInput.addEventListener("change", () => {
    importFile(fileInput.files[0]);
    fileInput.value = "";
  });

  /* ---------- 文档库（localStorage） ---------- */

  const DOCS_KEY = "md-preview-docs";
  const MAX_DOCS = 20;
  const docsPanel = document.getElementById("docs-panel");
  const docsList = document.getElementById("docs-list");
  const docsEmpty = document.getElementById("docs-empty");
  const docsCount = document.getElementById("docs-count");

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
      showToast("存储空间不足，该文档未能保存");
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
        closeDocsPanel();
        renderDocsPanel();
      });

      const del = document.createElement("button");
      del.className = "docs-del";
      del.textContent = "×";
      del.title = "从文档库删除";
      del.setAttribute("aria-label", `删除 ${d.name}`);
      del.addEventListener("click", () => {
        if (d.name === currentDocName) setFilename(null);
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
      setFilename(null);
      renderDocsPanel();
      showToast("已清空文档库");
    }
  });

  function exportHtml() {
    const body = preview.querySelector(".placeholder") ? "" : preview.innerHTML;
    if (!body) {
      showToast("暂无内容可导出");
      return;
    }
    return (async () => {
      let css = "";
      try {
        const res = await fetch("styles.css");
        if (!res.ok) throw new Error(String(res.status));
        css = await res.text();
      } catch {
        /* file:// 直开时 fetch 会被拦，只能导出无样式的 HTML */
      }
      const theme = document.documentElement.dataset.theme;
      const exportTitle = escapeHtml(currentDocName || "Markdown");
      const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${theme}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${exportTitle}</title>
<style>${css}</style>
</head>
<body>
<main class="preview" style="max-width:800px;margin:0 auto;min-height:100vh;">${body}</main>
</body>
</html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const a = document.createElement("a");
      const base = (currentDocName || "export").replace(/\.(md|markdown|txt)$/i, "");
      a.href = URL.createObjectURL(blob);
      a.download = `${base}.html`;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast(css ? "已导出 HTML" : "已导出，但样式缺失（请用 http 方式打开本页）");
    })();
  }

  document.getElementById("btn-export").addEventListener("click", () => {
    exportHtml();
  });

  /* ---------- 全屏阅读模式 ---------- */

  const btnFullscreen = document.getElementById("btn-fullscreen");

  function setReading(on, opts = {}) {
    const focusPane = opts.focus !== false;
    document.body.classList.toggle("reading-mode", on);
    btnFullscreen.setAttribute("aria-pressed", String(on));
    btnFullscreen.title = on
      ? "退出预览（Esc 或 ⌘/Ctrl+\\）"
      : "预览模式（⌘/Ctrl+\\，Esc 退出）";
    closeToc();
    closeDocsPanel();
    jumpScroll(preview, 0);
    jumpScroll(document.scrollingElement, 0);
    updateScrollUI();
    saveDraft();
    if (!focusPane) return;
    if (on) {
      preview.focus({ preventScroll: true });
    } else if (editor.value.trim()) {
      editor.focus();
    }
  }

  btnFullscreen.addEventListener("click", () => {
    setReading(!document.body.classList.contains("reading-mode"));
  });

  function isTypingTarget(el) {
    if (!el || el === document.body) return false;
    const tag = el.tagName;
    return (
      tag === "TEXTAREA" ||
      tag === "INPUT" ||
      el.isContentEditable
    );
  }

  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.key.toLowerCase() === "o") {
      e.preventDefault();
      if (!document.body.classList.contains("reading-mode")) fileInput.click();
      return;
    }

    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      exportHtml();
      return;
    }

    if (mod && e.key === "\\") {
      e.preventDefault();
      setReading(!document.body.classList.contains("reading-mode"));
      return;
    }

    if (e.key === "Escape") {
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
      return;
    }

    if (
      !mod &&
      e.key.toLowerCase() === "t" &&
      !isTypingTarget(e.target) &&
      document.body.classList.contains("reading-mode")
    ) {
      if (toc.hidden) return;
      if (toc.classList.contains("open")) closeToc();
      else openToc();
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
      showToast("请拖入 .md / .markdown / .txt 文件");
      return;
    }
    importFile(file);
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
    Object.entries(tabs).forEach(([key, tab]) => {
      const on = key === name;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", String(on));
      panes[key].classList.toggle("active", on);
    });
    if (name === "edit") editor.focus();
  }

  tabs.edit.addEventListener("click", () => switchTab("edit"));
  tabs.preview.addEventListener("click", () => switchTab("preview"));

  if (window.innerWidth <= 820) switchTab("edit");

  const draft = loadDraft();
  if (draft && draft.content) {
    editor.value = draft.content;
    if (draft.name) setFilename(draft.name);
  }

  render();
  renderDocsPanel();

  // Restore preview-only mode after content is ready (upload/open persists this)
  if (draft && draft.content && draft.reading) {
    setReading(true, { focus: false });
  }
})();
