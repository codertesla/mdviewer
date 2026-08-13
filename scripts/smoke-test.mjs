// 在 jsdom 里真实加载一遍页面脚本，覆盖最容易回归的几处：
// HTML 过滤、GFM 渲染、目录生成、中英文字数统计。
// 用法：npm install && npm test
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFile(resolve(root, p), "utf8");

const failures = [];
let passed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    return;
  }
  failures.push(detail ? `${name} — ${detail}` : name);
}

async function boot() {
  const html = await read("index.html");
  const dom = new JSDOM(html, {
    url: "https://mdviewer.test/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });

  // jsdom 不实现 matchMedia，而主题初始化与滚动动画都依赖它。
  dom.window.matchMedia = (query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });

  // 外链样式表不会由 jsdom 自动加载；注入后才能覆盖显示状态和层级回归。
  const style = dom.window.document.createElement("style");
  style.textContent = await read("styles.css");
  dom.window.document.head.appendChild(style);

  // index.html 里的 <script src> 在 jsdom 中不会自动拉取，按页面顺序手动注入。
  for (const file of ["lib/marked.umd.js", "lib/purify.min.js", "app.js"]) {
    const script = dom.window.document.createElement("script");
    script.textContent = await read(file);
    dom.window.document.head.appendChild(script);
  }
  return dom.window;
}

async function renderMarkdown(win, markdown) {
  const editor = win.document.getElementById("editor");
  editor.value = markdown;
  editor.dispatchEvent(new win.Event("input"));
  await new Promise((r) => setTimeout(r, 250));
  return win.document.getElementById("preview");
}

const win = await boot();
win.localStorage.clear();

check("marked 已加载", typeof win.marked?.parse === "function");
check("DOMPurify 已加载", typeof win.DOMPurify?.sanitize === "function");

{
  const preview = await renderMarkdown(
    win,
    ['<script>window.__pwned = 1;<\/script>', '<img src=x onerror="window.__pwned = 2">', "[链接](javascript:alert(1))"].join(
      "\n\n"
    )
  );
  check("<script> 被移除", !preview.querySelector("script"));
  check("内联脚本未执行", win.__pwned === undefined, `__pwned = ${win.__pwned}`);
  check("onerror 属性被移除", !preview.querySelector("[onerror]"));
  const href = preview.querySelector("a")?.getAttribute("href") || "";
  check("javascript: 链接被拦截", !href.toLowerCase().startsWith("javascript:"), `href = ${href}`);
}

{
  const preview = await renderMarkdown(
    win,
    `# 标题一

## 标题二

- [x] 已完成
- [ ] 待办

| 名称 | 数量 |
| --- | ---: |
| A | 1,024 |
| B | 2,048 |

\`\`\`js
const a = 1;
\`\`\`

[外部链接](https://example.com)
`
  );

  check("表格已渲染", !!preview.querySelector("table td"));
  check("任务列表复选框保留", !!preview.querySelector('input[type="checkbox"]'));
  check("代码块语言标签", preview.querySelector(".lang-badge")?.textContent === "js");
  check("数字列右对齐", !!preview.querySelector("td.num"));
  check("标题带锚点 id", preview.querySelector("h1")?.id === "标题一", preview.querySelector("h1")?.id);

  const tocLinks = win.document.querySelectorAll("#toc-list a");
  check("目录含两条", tocLinks.length === 2, `实际 ${tocLinks.length} 条`);
  check("目录按钮已显示", win.document.getElementById("toc-toggle").hidden === false);

  const external = [...preview.querySelectorAll("a")].find((a) =>
    a.getAttribute("href")?.startsWith("https://")
  );
  check("外链新窗口打开", external?.getAttribute("target") === "_blank");
  check("外链带 noopener", (external?.getAttribute("rel") || "").includes("noopener"));
}

{
  await renderMarkdown(win, "汉字五个字 hello world");
  const label = win.document.getElementById("word-count").textContent;
  check("中英文混排字数", label.includes("7 词"), label);
}

{
  const preview = await renderMarkdown(win, "");
  check("空内容回到占位图", !!preview.querySelector(".placeholder"));
  check("空内容清空目录", win.document.getElementById("toc-toggle").hidden === true);
}

{
  // 内置示例文档里有转义过的模板字符串，升级解析库时容易出问题。
  await renderMarkdown(win, "");
  win.document.getElementById("btn-sample").click();
  await new Promise((r) => setTimeout(r, 100));
  const preview = win.document.getElementById("preview");
  check("示例文档渲染出标题", preview.querySelector("h1")?.textContent === "Markdown 实时预览");
  check("示例文档渲染出表格", (preview.querySelectorAll("table tbody tr") || []).length === 3);
  check("示例文档标题写入 document.title", win.document.title.startsWith("示例.md"));
}

{
  // 回到顶部按钮曾因 HTML 上的 hidden 属性永远显示不出来（[hidden] 是 display:none !important）。
  // 这里同时守住两件事：属性没被写回去，以及滚动确实会加上 .show。
  const backTop = win.document.getElementById("back-top");
  check("回到顶部未被 hidden 锁死", backTop.hasAttribute("hidden") === false);

  await renderMarkdown(win, "# 长文\n\n正文\n");
  const preview = win.document.getElementById("preview");
  const fakeScroll = (scrollTop) => {
    for (const [prop, value] of [
      ["scrollTop", scrollTop],
      ["scrollHeight", 4000],
      ["clientHeight", 800],
    ]) {
      Object.defineProperty(preview, prop, { value, configurable: true });
    }
    preview.dispatchEvent(new win.Event("scroll"));
    return new Promise((r) => setTimeout(r, 50));
  };

  await fakeScroll(600);
  check("向下滚动后出现回到顶部", backTop.classList.contains("show"));
  const scaled = win.document.getElementById("reading-progress").style.transform;
  check("阅读进度条随滚动更新", scaled.startsWith("scaleX(0.1"), scaled);

  await fakeScroll(0);
  check("回到顶部后按钮隐藏", backTop.classList.contains("show") === false);
}

{
  // 阅读模式隐藏低频编辑操作，但必须保留打开文件；文档弹窗要盖在固定 TOC 上方。
  win.document.body.classList.add("reading-mode");
  check("已进入阅读模式", win.document.body.classList.contains("reading-mode"));
  check(
    "阅读模式隐藏示例按钮",
    win.getComputedStyle(win.document.getElementById("btn-sample")).display === "none"
  );
  check(
    "阅读模式隐藏清空按钮",
    win.getComputedStyle(win.document.getElementById("btn-clear")).display === "none"
  );
  check(
    "阅读模式保留打开按钮",
    win.getComputedStyle(win.document.getElementById("btn-open")).display !== "none"
  );

  win.document.getElementById("btn-docs").click();
  const topbarZ = Number(win.getComputedStyle(win.document.querySelector(".topbar")).zIndex);
  const tocZ = Number(win.getComputedStyle(win.document.getElementById("toc")).zIndex);
  check("文档弹窗所在顶栏高于 TOC", topbarZ > tocZ, `topbar=${topbarZ}, toc=${tocZ}`);
}

win.close();

console.log(`${passed} 项通过${failures.length ? `，${failures.length} 项失败` : ""}`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length ? 1 : 0);
