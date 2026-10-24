# vidday

一个高度还原 Netflix 交互体验的在线影视站点前端，基于 React + Vite + TypeScript 构建。当前版本使用 Mock 影视数据，播放页已接入真实 HLS 播放内核（hls.js），后续可继续接入 DASH 与会员体系。

## 技术栈

## 功能概览

> 播放页基于 hls.js 渲染真实 HLS 画面，播放/暂停、进度、音量、倍速、字幕、音轨、选集、全屏等交互完整可用；
> 画质选项由 master playlist 的轨道信息动态生成，默认停在 720P 档位，可手动切档或交还自适应。

## 目录结构

```
src/
├── components/
│   ├── layout/     # 站点顶栏、页脚、整体布局
│   ├── title/      # 影视相关内容组件（Hero、片单卡片、播放器等）
│   └── ui/         # 基础 UI 组件（按钮、弹窗、下拉菜单等）
├── data/           # Mock 数据（作品、片单、类型、档案、通知）
├── hooks/          # 自定义 Hook
├── lib/            # 工具函数（图片、目录检索、格式化、存储）
├── pages/          # 页面级组件
├── store/          # Redux store 及 slices
├── styles/         # 全局样式
└── types/          # 全局类型定义
```

## 快速开始

```bash
# 安装依赖（推荐 Node 22）
nvm use

npm install

# 启动开发服务器（默认 http://localhost:5173）
npm run dev
```

### 演示账号

```
邮箱：demo@vidday.tv
密码：vidday
```

## 可用脚本

| 命令                  | 说明                  |
| ------------------- | ------------------- |
| `npm run dev`       | 启动开发服务器             |
| `npm run build`     | 类型检查并构建生产产物         |
| `npm run preview`   | 本地预览构建产物            |
| `npm run typecheck` | 仅执行 TypeScript 类型检查 |

## 说明

视频源采用 https://stream.mux.com/XceDtWCR2F01InyWrAcI00JeLtWCDPcOjN4g01im00Y0100FQ.m3u8
