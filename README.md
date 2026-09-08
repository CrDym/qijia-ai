<div align="center">

# 栖家 · Qijia AI

**让家庭资料、知识与健康记录，有处可寻。**

一个面向家庭日常的信息管理与 AI 辅助整理平台。

![版本](https://img.shields.io/badge/版本-0.1.0-54754d)
![Next.js](https://img.shields.io/badge/Next.js-16-111111?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-本地存储-003b57?logo=sqlite&logoColor=white)

[快速开始](#快速开始) · [核心特性](#核心特性) · [使用指南](docs/guide.md) · [参与贡献](CONTRIBUTING.md) · [反馈问题](https://github.com/CrDym/qijia-ai/issues)

</div>

## 为什么做栖家

家电说明书、维修经验、出行准备、家人的病历和检查报告，常常散落在聊天记录、相册与文件夹里。栖家将这些信息收进一个可搜索、可持续积累的家庭资料库，在需要时找得到、看得懂，也能回到原始文件核对。

项目从小而实用的功能开始，按 **MVP → V1 → V2** 逐步迭代。当前为 V0，聚焦资料管理、图片识别和家庭健康档案，优先简单、模块化与长期可维护性。

## 核心特性

| 功能 | 当前能力 |
| --- | --- |
| 家庭资料库 | 新增、编辑、分类、标签、摘要和来源记录；支持中文关键词搜索 |
| 文件导入 | 拖拽或选择 PDF、Word、TXT、Markdown，提取文字后可编辑 |
| 图片识别 | 上传 JPG、PNG、WebP，预览原图，使用 AI 识别文字并核对草稿 |
| AI 辅助整理 | 提炼标题、摘要和标签；严格 JSON Schema 输出与服务端校验 |
| 家庭健康 | 建立成员档案，记录过敏史、既往病史，按成员与日期管理病历、报告和处方 |
| 原件保留 | 文件与资料一同保存，支持下载、替换和移除附件 |
| 本地存储 | SQLite 持久保存；无需单独运行数据库服务 |
| 响应式界面 | 支持桌面和手机，包含空状态、错误提示、未保存提醒和删除确认 |

**AI 由你主动触发。** 上传或保存资料不会自动调用 AI；识别与整理结果先作为草稿展示，采用后仍需手动保存。没有 AI Key 也能使用资料管理、文件上传和健康档案。

## 快速开始

需要 **Node.js 22.13+** 与 npm，建议使用兼容的 LTS 版本。

```bash
git clone git@github.com:CrDym/qijia-ai.git
cd qijia-ai
npm ci
cp .env.example .env.local
npm run dev
```

访问 [http://127.0.0.1:3000](http://127.0.0.1:3000)。如果尚未配置 GitHub SSH，也可以使用 HTTPS 克隆：

```bash
git clone https://github.com/CrDym/qijia-ai.git
```

初始资料库为空，数据库会按需创建到 `data/family.sqlite`。应用不会自动插入示例成员或健康资料。

### 配置 AI（可选）

在 `.env.local` 中填写，修改后重启服务：

```dotenv
OPENAI_API_KEY=你的_OpenAI_API_Key
OPENAI_MODEL=gpt-4.1-mini
DATABASE_PATH=./data/family.sqlite
```

| 环境变量 | 说明 |
| --- | --- |
| `OPENAI_API_KEY` | 启用 AI 时必填，仅在服务端读取 |
| `OPENAI_MODEL` | 默认 `gpt-4.1-mini`；需支持图片输入、Responses API 和结构化输出 |
| `DATABASE_PATH` | 可选，默认 `./data/family.sqlite`；部署时应指向持久磁盘 |

请勿为密钥添加 `NEXT_PUBLIC_` 前缀，也不要提交 `.env.local`。完整配置示例见 [`.env.example`](.env.example)。

## 开始使用

- **收藏资料**：点击“新增资料”，填写文字或拖入文件，核对后保存。
- **识别图片**：选择图片后点击“AI 解析图片”，查看识别草稿，再选择是否采用。
- **整理健康档案**：进入“家庭健康”，添加成员，再上传病历、检查报告或处方；可按成员、类型和关键词查找。

详细操作、文件格式、保存规则与备份方式见 [使用与部署指南](docs/guide.md)。

## 技术与结构

采用 Next.js App Router、TypeScript、Tailwind CSS、SQLite、OpenAI SDK 与 Zod。文件解析使用 `pdf-parse`、`mammoth` 和 `sharp`。

```text
src/
├── app/             # 页面与 API Route
├── components/      # 资料库、图片解析、成员与健康档案界面
├── schemas/         # 输入、存储数据与 AI 输出的数据契约
├── services/
│   ├── ai/          # AI 业务入口与 Provider 适配
│   └── files/       # 文件校验、提取与上传请求解析
├── repositories/    # 资料与成员的持久化操作
└── lib/             # 数据库连接与通用请求处理
tests/               # 使用临时数据库和模拟 AI 的基础测试
docs/                # 使用、部署与维护文档
```

AI 调用集中在 service 层，页面不直接依赖供应商 SDK；数据访问集中在 repository 层。替换 AI Provider 或调整存储时，可以从对应模块开始。

### 开发与检查

```bash
npm run lint
npm run typecheck
npm test
```

测试覆盖资料与成员管理、附件持久化、图片校验、健康记录归属、删除保护和 AI 输出校验。测试不使用真实家庭资料，不调用付费 AI，也不代表对真实模型识别准确率的验证。

### 生产运行

```bash
npm run build
npm start
```

当前适合单台、有持久磁盘的 Node.js 服务，默认仅监听 `127.0.0.1`。部署与数据备份请参阅 [使用与部署指南](docs/guide.md)。

## 当前边界与数据说明

- 每条资料保留一个原文件，最大 **10 MB**。PDF 最多 100 页，正文最多 20,000 字符。
- 图片支持静态 JPG/JPEG、PNG、WebP，最多 4,000 万像素。扫描 PDF 需先将所需页面转为图片再识别；HEIC、GIF、SVG 暂不支持。
- 当前没有登录、成员权限隔离或应用层数据加密。家庭成员是资料档案，不是独立账号；请勿将服务直接暴露到公网。
- 点击 AI 整理时，正文会发送给 OpenAI；点击图片解析时，图片会发送给 OpenAI。服务端设置 `store: false`，这不等同于供应商所有日志或留存政策的承诺。
- 健康 AI 仅整理原文，不进行诊断、不推荐或调整用药。请核对药名、剂量、数值与单位，诊疗以医生意见为准。
- 数据库、原件和备份应妥善保管。删除无法在应用内撤销，备份方式见使用指南。

## 迭代方向

当前已实现资料管理、原件保存、图片识别与家庭健康档案。后续会根据实际使用反馈确定优先级，再评估更好的资料检索、多附件管理和知识库问答等方向；这些能力尚未实现，也不作为当前版本的承诺。

## 参与贡献

欢迎通过 [Issues](https://github.com/CrDym/qijia-ai/issues) 提交问题与建议，或通过 Pull Request 改进代码和文档。较大功能请先讨论范围，避免提前增加复杂度。

请使用中文 commit，功能或配置变化时同步更新文档。具体约定见 [贡献指南](CONTRIBUTING.md)。反馈问题时请使用虚构样例，不上传真实病历、家庭资料或 API Key。

## 许可证

当前尚未指定开源许可证，后续由维护者确定并补充 `LICENSE`。公开托管不代表已授予开源许可证下的使用权限。
