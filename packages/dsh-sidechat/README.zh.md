# DSH Side Chat

[English](README.md) · [简体中文](README.zh.md)

DeepSeek Harness 原生右侧栏中的独立侧聊：每条侧聊拥有自己的标签页、草稿、消息流和子会话控制，不把临时追问混进主会话。

> **v1.0.0-rc.1 是架构重写的大版本预发布，不是稳定版升级。** 仅支持 **DSH `0.2.0-rc.2`**。Desktop 冷启动及与 Better Sidebar 共存尚未验证。本版通过 GitHub 提供可安装的 tarball，**没有发布到 npm**。替换 v0.4 前请先阅读[迁移说明](MIGRATION.md)。

## 安装预发布版

在 [v1.0.0-rc.1 Release](https://github.com/Lukeknow0/dsh-side-chat/releases/tag/v1.0.0-rc.1) 下载 **`lukeknow0-dsh-side-chat-1.0.0-rc.1.tgz`** 和 **`SHA256SUMS`**，在下载目录校验：

```sh
shasum -a 256 -c SHA256SUMS
```

请先使用一次性隔离配置测试。使用 DSH Web CLI 时，在独立终端执行：

```sh
export DSH_HOME="$(mktemp -d)"
dsh plugin --profile web add /absolute/path/lukeknow0-dsh-side-chat-1.0.0-rc.1.tgz
```

然后启动该隔离 Web 配置，使用它自己的正常认证流程；不要豁免版本限制。Desktop 配置由桌面应用的插件管理器管理，Web CLI 不能代管。决定安装到日常配置前请先备份，不能把 Web 检查等同于 Desktop 验收。

正式包名保持为 **`@lukeknow0/dsh-side-chat@1.0.0-rc.1`**。从 npm 安装包名，或直接把源码仓库根目录当插件安装，**不会**安装这个仅在 GitHub 分发的预发布版。

## 主要变化

- **原生多标签：** 使用右侧栏加号和“新建侧聊”指南打开独立空白页，可同时打开多条侧聊。
- **延迟创建子会话：** 打开空白页不创建 Session；首次发送才创建。选择文件时会先创建上传回执所需的子会话，但不发送提示词。
- **独立草稿与历史：** 每个标签只访问自己的子会话；从空白页重新打开已有侧聊。关闭标签不取消、不归档、不删除子会话。
- **子会话控制：** 使用 Host 实时目录提供的模型/权限选项，处理侧聊自己的问题和审批，并可显式取消生成。
- **Web 附件：** 按钮上传、拖放文件或粘贴剪贴板图片；显示进度，支持移除和重试。文件使用子会话专属上传回执，图片使用原生图片消息。支持只发送附件。
- **不自动写回主会话：** 侧聊消息不会追加到父会话。切换模型不改写已有父 Session，但 Host 可能把成功选择保存为后续未显式配置的新会话默认值。

当前界面文案为中文。最多 10 个附件、每个 20 MB，Host 可能施加更严格的限制。未发送文件可在标签切换时保留在内存中，**刷新浏览器后不会保留**。批注和答案回流仍是开发内容，不属于本预发布版已验收的运行时功能。

## 权限与数据保留

**重写版不再是强制只读子智能体。** 它使用 Host 的子会话模型、权限预设和审批流程。发送前请检查侧聊当前权限；旧版固定工具白名单/执行拒绝守卫没有沿用。完整访问或自动权限预设需要走 Host 的风险确认路径。

关闭标签是 UI 生命周期变化，不是数据擦除边界，不会结束子会话或删除持久历史。旧版停放 30 分钟自动过期逻辑已移除，旧版侧聊元数据不会自动导入。详见[安全说明](SECURITY.md)与[迁移说明](MIGRATION.md)。

## 兼容性与验证范围

| 项目 | 本预发布版范围 |
| --- | --- |
| DeepSeek Harness | 仅 `0.2.0-rc.2` |
| 插件 Node.js 运行时 | `>=22.19.0` |
| 开发 / CI | Node `22.20.0` 或 `24`，pnpm `11.7.0` |
| Client | DSH Web 原生右侧栏服务 |
| Desktop 冷启动 / Better Sidebar 共存 | 尚未验证 |

本次实际执行的检查见[发布验证记录](https://github.com/Lukeknow0/dsh-side-chat/blob/v1.0.0-rc.1/docs/RELEASE-VERIFICATION.md)。早期阶段文档、品牌图和旧版截图仅是历史资料，不代表本版运行时兼容性已经通过。

## 从源码构建

```sh
git clone https://github.com/Lukeknow0/dsh-side-chat.git
cd dsh-side-chat
git checkout v1.0.0-rc.1
pnpm install --frozen-lockfile
pnpm run check
pnpm run pack:release
pnpm run verify:package
```

`check` 执行 Host/Client 类型检查，构建 Typert 生成接口和 lazy-CJS 浏览器包，再运行工作区与插件测试；`pack:release` 将版本化安装包写入 `artifacts/`；`verify:package` 检查包身份、导出文件和模块加载连接。它们不会发布 npm，也不会安装到 DSH 配置中。Host/Remote 声明会在 Client 自引用类型检查之前生成，干净检出不依赖已有构建缓存。无法加载第三方原生扩展的签名托管 Node 可使用 `NAPI_RS_FORCE_WASI=1 pnpm run check`；工作区/锁文件已包含 Rolldown 官方可选 WASI 回退。

```text
packages/dsh-sidechat/  可安装插件、Host/Client 源码与测试
packages/.codegen/     仅供 Typert 分析的类型声明
tests/                 工作区、发布和安装包契约测试
scripts/               安装包审计及保留的旧品牌图工具
docs/                  迁移、验证与历史设计证据
```

[贡献指南](https://github.com/Lukeknow0/dsh-side-chat/blob/v1.0.0-rc.1/CONTRIBUTING.md) · [更新记录](CHANGELOG.md) · [MIT 许可证](LICENSE) · [第三方说明](THIRD_PARTY_NOTICES.md)

这是独立重写，不修改 Better Sidebar，不复制 `dsh-sidenote` 源码。DeepSeek Harness、Codex 商标归各自所有者；本项目与 DeepSeek、OpenAI 无隶属关系。
