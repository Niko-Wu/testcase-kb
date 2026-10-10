# Changelog

## 0.1.0

- 插件化：Claude Code 插件（/kb-init /kb-case /kb-run /kb-view /kb-analyze）+ kb-authoring 技能
- 数据纯本地私有（~/.testcase-kb），git init 即转团队共享
- kb-server：静态站点 + 执行 API + runs 实时聚合，局域网可分享
- 判定口径：只看 spec 断言；三态 checklist（✅/❌/⚠️，失败后未执行项标阻塞）
- 本地 demo 示例域（离线可用）：通过/失败/阻塞三态 + 多图用例
- 引擎：画像参数化（envs/headers/locale/auth）、登录态生命周期（浏览器导入+探针+自动续期）、断言双源同构
