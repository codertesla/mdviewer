# MD 预览

一个简约的 Markdown 实时渲染工具：输入、上传或拖入 Markdown 文档，右侧即时渲染为排版良好的 HTML，支持全屏阅读、自动目录、亮暗主题切换。

纯原生 HTML / CSS / JavaScript 实现，无框架、无构建步骤。第三方依赖只有两个本地化的库：[marked](https://marked.js.org/) 负责解析 Markdown，[DOMPurify](https://github.com/cure53/DOMPurify) 负责过滤渲染结果里的危险 HTML。

## 功能特性

- **实时渲染**：输入即渲染，支持 GFM（表格、任务列表、删除线等）
- **文档导入**：点击「打开 .md」或直接拖拽文件，支持 `.md` / `.markdown` / `.txt`
- **全屏阅读模式**：上传 / 打开文档后默认进入预览（单栏 HTML），偏好会记住；手动切回双栏后刷新也保持双栏。`Esc` 或 `⌘/Ctrl+\` 切换
- **自动目录（TOC）**：由标题自动生成，点击跳转、滚动高亮当前章节，宽屏下常驻右侧栏
- **编辑 / 预览同步滚动**：双栏按比例同步滚动
- **文档库**：已上传的文档自动保存在浏览器 `localStorage`，随时点击重新打开，可删除管理
- **草稿恢复**：编辑内容与预览/双栏模式自动写入本地，刷新后仍在
- **亮 / 暗主题**：暖橙强调色 + 冷 slate 中性面（`#f4a261` / `#d35400` accent，浅色 `#eef1f4` / 深色 `#161a1f` 底），偏好自动记忆
- **表格阅读优化**：粘性表头、数字列自动右对齐
- **阅读进度条 + 回到顶部**：长文档浏览更顺手
- **导出 HTML**：一键导出为内嵌样式的独立 HTML 文件
- **XSS 防护**：渲染前经 DOMPurify 过滤，文档里的 `<script>`、`onerror`、`javascript:` 链接不会执行；站外链接自动带 `rel="noopener"`

## 快速开始

页面本身零构建，双击 `index.html` 就能用。不过「导出 HTML」需要读取 `styles.css`，`file://` 下会被浏览器拦住，所以推荐起一个静态服务：

```bash
npm run dev      # 等价于 python3 -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 部署（Cloudflare Workers）

已配置 Workers Static Assets，登录 Cloudflare 后一键发布：

```bash
npx wrangler deploy   # 或 npm run deploy
```

安全响应头（CSP、`nosniff`、`Referrer-Policy` 等）由 `_headers` 提供，由 Cloudflare 在边缘注入，该文件本身不会对外提供。

## 开发

npm 只用于管理依赖和跑测试，**运行页面不需要 Node**。

```bash
npm install
npm test         # jsdom 冒烟测试：HTML 过滤、GFM 渲染、目录、字数统计
npm run vendor   # 把 node_modules 里的 marked / DOMPurify 同步到 lib/
```

升级依赖：改 `package.json` 里的版本号 → `npm install` → `npm run vendor` → `npm test`。`lib/` 下的文件是提交进仓库的产物，这样部署时无需任何构建步骤。

## 使用说明

| 操作 | 方式 |
| --- | --- |
| 输入 Markdown | 左侧编辑区直接输入，右侧实时渲染 |
| 打开本地文档 | 顶栏「打开 .md」或拖拽文件到窗口任意位置 |
| 全屏阅读 | 顶栏全屏按钮，或打开本地文档后自动进入 |
| 目录导航 | 预览区右下角「☰」按钮，宽屏阅读模式下常驻右侧 |
| 主题切换 | 顶栏太阳 / 月亮图标，自动记忆偏好 |
| 重新查看文档 | 顶栏「文档」按钮，从文档库列表点击打开 |
| 导出 | 顶栏「导出 HTML」或 `⌘/Ctrl+S`，文件名跟随当前文档 |
| 打开文件 | 顶栏按钮或 `⌘/Ctrl+O` |
| 切换阅读模式 | 顶栏按钮或 `⌘/Ctrl+\`，`Esc` 退出 |
| 展开 / 收起目录 | 阅读模式下按 `T` |

## 项目结构

```
md2HTML/
├── index.html          # 页面结构
├── styles.css          # 样式与主题变量
├── app.js              # 渲染、文档库、阅读模式等逻辑
├── 404.html            # 自定义 404 页
├── favicon.svg         # 站点图标
├── _headers            # Cloudflare 安全响应头（CSP 等）
├── .assetsignore       # 部署时排除的文件
├── wrangler.jsonc      # Cloudflare Workers 配置
├── lib/                # 本地化的浏览器端依赖（提交进仓库）
│   ├── marked.umd.js   # Markdown 解析
│   └── purify.min.js   # HTML 过滤
└── scripts/
    ├── vendor.mjs      # 同步依赖到 lib/
    └── smoke-test.mjs  # jsdom 冒烟测试
```

## 技术说明

- 零构建：页面运行不需要 Node / npm，浏览器直接打开即可
- 数据存储：草稿、文档库与主题偏好存于 `localStorage`（上限约 5MB，超大文档会提示保存失败）
- 导入限制：单个文件上限 2MB，超出会提示；文档库最多保留 20 篇，按时间淘汰
- 兼容性：现代浏览器（Chrome / Edge / Safari / Firefox），移动端自动切换为编辑 / 预览 Tab 布局

## License

MIT
