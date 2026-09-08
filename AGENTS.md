<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## 项目协作约定

以下约定来自项目维护者的明确要求，后续修改应持续遵循：

- 项目名称为「栖家 · Qijia AI」，仓库为 `git@github.com:CrDym/qijia-ai.git`，GitHub 同步使用 SSH。
- 完成一组相关修改并通过相应检查后，主动创建 Git commit，提交信息使用中文，例如「新增：支持病历图片识别」。不要只修改文件而遗漏提交。
- 推送沿用已配置的远程与分支；不强制推送，不覆盖或丢弃已有远端历史。用户对提交或推送的临时指示优先。
- 功能、配置、安装、接口或使用限制发生变化时，同步更新 `README.md` 和相关文档。README 保持面向开源项目访客的结构：项目定位、核心特性、快速开始、文档入口和参与贡献；详细操作与部署说明放在 `docs/guide.md`。
- API Key、真实家庭资料、健康记录、原文件、数据库、日志和本地测试产物不得提交。测试使用虚构资料与隔离数据库。
- 保持简单与模块化：所有 AI 调用集中在 `src/services/ai/`；不提前实现未获确认的后续功能。
- 保留工作区内不属于本次任务的修改。验证范围与实际改动相称，提交前检查暂存区内容。
