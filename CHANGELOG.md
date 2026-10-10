# Changelog

## 0.1.2

- CI 修复：build 步骤补传 KB_ROOT（config.mts 默认回退 `~/.testcase-kb` 在 runner 不存在）
- 构建修复：vue peer dep 导致的 vitepress build 失败

## 0.1.1

- kb-run 自动拉起本地 kb-server（端口取自 BASE_URL）
- 安装两步化：marketplace.json + 插件注册安装命令写实
- 安装自举：/kb-init 首次运行自动装插件依赖与 Chromium
- 示例域改本地 demo 站（离线可用，不打外网站点）
- 修复：md 附件异步化后 server 未 await 崩溃、抽屉全链断裂与断言明细可读性

## 0.1.0

- 插件化：Claude Code 插件（/kb-init /kb-case /kb-run /kb-view /kb-analyze）+ kb-authoring 技能
- 数据纯本地私有（~/.testcase-kb），git init 即转团队共享
- kb-server：静态站点 + 执行 API + runs 实时聚合，局域网可分享
- 判定口径：只看 spec 断言；三态 checklist（✅/❌/⚠️，失败后未执行项标阻塞）
- 本地 demo 示例域（离线可用）：通过/失败/阻塞三态 + 多图用例
- 引擎：画像参数化（envs/headers/locale/auth）、登录态生命周期（浏览器导入+探针+自动续期）、断言双源同构
