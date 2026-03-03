# VibeApps

中文 | [English](./README.md)

> 想象一个运行在浏览器里的桌面系统 —— 而且有个 AI 知道怎么操作上面的每一个应用。

![License](https://img.shields.io/badge/license-MIT-blue.svg)

**[官网](https://www.openroom.ai)** · **[X / Twitter](https://x.com/openroom_ai_)**


## 这是什么？

VibeApps 把完整的桌面体验搬进了浏览器 —— 可以拖拽、缩放的窗口，可以并排打开的应用，一切都裹在简洁的类 macOS 界面里。但真正让它不一样的，是内置的那个 **AI Agent**。

不用翻菜单、找按钮，直接告诉它你想做什么：

> *"来点爵士乐"* —— 音乐应用开始播放。
>
> *"帮我写一篇今天爬山的日记"* —— 日记本打开，新条目已经写好。
>
> *"下一盘棋吧"* —— 棋盘已经摆好。

Agent 不只是打开应用 —— 它真的在**操作**它们。它读取数据、触发动作、更新状态，所有交互都通过一套结构化的 Action 系统完成。

所有数据都存在浏览器本地。没有后端、不用注册、开箱即用。你的数据留在 IndexedDB 里，完全属于你自己。

## 内置应用

开箱即有一整套应用，随时可以探索：

| 应用 | 说明 |
|------|------|
| 🎵 Music | 完整的播放器，支持播放列表、播放控制和专辑封面 |
| ♟️ Chess | 经典国际象棋，完整规则判定 |
| ⚫ Gomoku | 五子棋 —— 规则简单，策略深远 |
| 🃏 FreeCell | 靠实力说话的空当接龙 |
| 📧 Email | 收件箱、已发送、草稿箱，熟悉的邮件体验 |
| 📔 Diary | 带心情标记的个人日记，记录你的每一天 |
| 🐦 Twitter | 一个你能完全掌控的社交信息流 |
| 📷 Album | 浏览和管理你的照片集 |
| 📰 CyberNews | 精选新闻聚合，保持信息灵通 |

每个应用都与 AI Agent 深度集成 —— 你可以用自然语言和它们中的任何一个互动。

## 快速开始

### 前置条件

| 工具 | 版本 | 检查 | 安装 |
|------|------|------|------|
| **Node.js** | 18+ | `node -v` | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 9+ | `pnpm -v` | `npm install -g pnpm@9` |

> **国内用户？** 取消 `.npmrc` 中的镜像注释行，通过 npmmirror 加速下载。

### 60 秒跑起来

```bash
# 克隆并进入项目
git clone https://github.com/MiniMax-AI/OpenRoom.git
cd OpenRoom

# 安装依赖
pnpm install

# （可选）配置环境变量
cp apps/webuiapps/.env.example apps/webuiapps/.env

# 启动
pnpm dev
```

打开 `http://localhost:3000` —— 你会看到一个带应用图标的桌面。**双击**即可打开任意应用。

### 认识 AI Agent（浏览器内聊天）

点击右下角的**聊天图标**，一个面板会滑出来 —— 这就是你的 Agent。

自然地输入：*"播放下一首歌"*、*"看看我的邮件"*、*"开一局新棋"*。Agent 会自动判断该找哪个应用、执行什么操作，然后帮你搞定。

> **提示：** 需要配置 LLM API Key，在聊天面板的设置中完成。
>
> 这个聊天面板用来**使用**已有的应用。想要**创建**新应用？请看下方的 [Vibe 工作流](#用一句话创造新应用) —— 那是在 Claude Code CLI 中运行的。

## 用一句话创造新应用

这才是最有意思的部分。通过 **Vibe 工作流**，你只需要描述想要什么，就能生成一个完整的、可以直接使用的应用。不用写模板代码、不用搭脚手架 —— [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 会处理一切。

> **注意区分：** Vibe 工作流运行在 **Claude Code（CLI 终端）** 中，不是浏览器里的聊天面板。浏览器里的聊天面板用来操作已有应用；创建新应用是在你的开发环境中进行的。

### 从零创建

```bash
/vibe WeatherApp 做一个天气仪表盘，展示 5 天天气预报和温度曲线图
```

背后，工作流会依次走过 **6 个阶段** —— 每一步都建立在前一步的基础上：

```
需求分析    →  到底要做什么？
架构设计    →  组件、数据模型、状态结构
任务规划    →  拆成可执行的开发任务
代码生成    →  写出 React + TypeScript 代码
资源生成    →  生成图标和图片素材
项目集成    →  注册应用，让它出现在桌面上
```

完成后，你的新应用就上线了 —— 自带 AI Agent 集成。

### 迭代现有应用

已经有了一个应用，想加点东西？描述你的需求就行：

```bash
/vibe MusicApp 添加一个歌词面板，播放时显示同步歌词
```

这会触发一个聚焦的 **4 阶段变更工作流**：影响分析 → 任务规划 → 代码实现 → 验证检查。

### 续跑与重跑

```bash
# 从中断处继续
/vibe MyApp

# 跳到指定阶段
/vibe MyApp --from=04-codegen
```

## 项目架构

### 目录结构

```
OpenRoom/
├── apps/webuiapps/              # 桌面主应用
│   └── src/
│       ├── components/          # Shell、窗口管理、聊天面板
│       ├── lib/                 # 核心 SDK — 文件 API、Action、应用注册表
│       ├── pages/               # 每个应用的所在地
│       └── routers/             # 路由定义
├── packages/
│   └── vibe-container/          # iframe 通信 SDK（开源模式为 stub）
├── .claude/                     # AI 工作流引擎
│   ├── commands/vibe.md         # 工作流入口
│   ├── workflow/                # 阶段定义与规则
│   └── rules/                   # 代码生成约束
└── .github/workflows/           # CI 流水线
```

> **关于 `vibe-container`：** 在开源独立版中，真实的 iframe SDK 被本地 mock（`src/lib/vibeContainerMock.ts`）替代，使用 IndexedDB 存储数据、本地事件总线处理 Agent 通信。`packages/vibe-container/` 下的包提供类型定义和客户端 SDK 接口。详见其 [README](./packages/vibe-container/README.md)。

### 应用的解剖结构

每个应用遵循统一的结构 —— 一致、可预测、容易上手：

```
pages/MusicApp/
├── components/         # UI 组件
├── data/               # 种子数据（JSON）
├── store/              # 状态管理（Context + Reducer）
├── actions/            # AI Agent 与这个应用的对话方式
│   └── constants.ts    # APP_ID + Action 类型定义
├── i18n/               # 翻译文件（en.ts + zh.ts）
├── meta/               # Vibe 工作流的元数据
│   ├── meta_cn/        # guide.md + meta.yaml（中文）
│   └── meta_en/        # guide.md + meta.yaml（英文）
├── index.tsx           # 入口
├── types.ts            # TypeScript 类型定义
└── index.module.scss   # 局部样式
```

## 开发

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器 → `http://localhost:3000` |
| `pnpm build` | 生产构建 |
| `pnpm run lint` | Lint + 自动修复 |
| `pnpm run pretty` | Prettier 格式化 |
| `pnpm clean` | 清除构建产物 |

## 技术栈

| | |
|---|---|
| **框架** | React 18 + TypeScript + Vite |
| **样式** | Tailwind CSS + CSS Modules + Design Tokens |
| **图标** | Lucide React |
| **状态管理** | React Context + Reducer |
| **存储** | IndexedDB（单机）/ Cloud NAS（生产） |
| **国际化** | i18next + react-i18next |
| **工程化** | pnpm workspaces + Turborepo |
| **CI** | GitHub Actions |

## 环境变量

```bash
cp apps/webuiapps/.env.example apps/webuiapps/.env
```

| 变量 | 必须 | 说明 |
|------|------|------|
| `CDN_PREFIX` | 否 | 静态资源 CDN 前缀 |
| `VITE_RUM_SITE` | 否 | RUM 监控端点 |
| `VITE_RUM_CLIENT_TOKEN` | 否 | RUM 客户端 Token |

全部可选。不配置也能正常运行。

## 参与贡献

无论是修 bug、做新应用，还是改文档 —— 我们都欢迎。看看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解如何开始。

## 许可证

[MIT](LICENSE) — Copyright (c) 2025 MiniMax
