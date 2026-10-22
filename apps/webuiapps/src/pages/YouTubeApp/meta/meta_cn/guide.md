# YouTubeApp 数据指南

YouTube 应用对 Agent 来说是无状态的 —— Kayley 不需要写任何云端文件。
她通过 `SEARCH` action 驱动整个应用：

```
vibe_action(
  app_name="youtube",
  action_type="SEARCH",
  params='{"query":"fleetwood mac landslide","max_results":10}'
)
```

应用内部执行搜索，并将结果渲染为可点击的卡片网格。
点击卡片后内嵌 YouTube 播放器播放。

## 搜索后端

优先使用 `youtube-search-api` npm 包（无需 API key，公开抓取）。
如浏览器环境不兼容（CORS、Node-only 依赖或 YouTube 页面结构变化），
则回退到固定的 5 条 stub 结果，保证 vibe_action 往返始终完成。
