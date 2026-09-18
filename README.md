# Cell Notebook

个人细胞培养记录网页版。界面支持手机和电脑。

推荐发布方式为 Firebase Spark 免费方案。它使用 Google 登录和 Firestore 自动同步，用户不需要每次单独连接 Google Drive。完整配置步骤见 `FIREBASE_SETUP.md`。

## 已实现

- 多项目、多培养容器；6/12/24/48/96 孔板、T25/T75/T175 Flask、Tube、自定义容器。
- 每张 Slide 至少两次读数，科学计数法输入 Total / Live / Dead（cells/mL）。
- 均值、逐次存活率平均值、样本标准差、Total CV；按日期、容器查看和导出。
- 孔位选择、每孔体积、计数时容器快照；添加/移除/换液/取样处理和剩余体积。
- 培养概览按处理时间展示操作、容器、用量和分瓶去向，支持日期与容器筛选。
- 传代 / 分瓶可设置新瓶类型、数量、名称及每瓶原液与培养液体积；自动创建同项目新瓶和稀释估算起始记录。原瓶计数保留，全部分出后标记为历史容器；新瓶随后追加实测计数。
- 实验取样保留独立的原始计数快照；实验后重复测量、体积与前后对比。
- 私有云端保存、版本冲突保护、恢复上一个版本；数据按登录账号隔离。
- Excel 五工作表、CSV 原始读数、打印/另存 PDF 报告、完整 JSON 备份。
- Google Drive appDataFolder 手动版本备份与恢复；首次授权后由服务器自动续期。

## Google Drive 设置

在 Google Cloud 启用 Drive API，创建 Web application OAuth 客户端，并把
`https://cell-notebook-zihan.zihandiao230.chatgpt.site/api/google/callback`
加入 Authorized redirect URIs。测试模式添加自己的账号。生产环境通过 Sites
密钥配置 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` 和 32 字节的
`GOOGLE_TOKEN_ENCRYPTION_KEY`。

Google 官方资料：
- https://developers.google.com/identity/oauth2/web/guides/use-code-model
- https://developers.google.com/workspace/drive/api/guides/appdata

日常跨设备数据由应用的私有 D1 数据库保存。Drive 保存不可变的时间戳备份，读取后先展示恢复概况，确认后再恢复工作记录。Google 刷新令牌使用 AES-GCM 加密后保存在 D1，访问令牌按需在服务器刷新；断开连接会删除保存的刷新令牌。

## 数据定义与边界

浓度统一为 cells/mL；无自动稀释倍数校正，请填写需要记录的最终浓度。存活率可选 Live/(Live+Dead) 或 Live/Total，先逐次计算再平均；零分母返回不可用。SD 使用 n−1；CV = Total SD / Mean Total。处理只维护体积，不把处理前浓度当作处理后的实测浓度。实验细胞总数仅由指定快照的浓度乘体积估算。孔板的每孔体积须在新计数时按实际情况核对。

需联网读取和保存；离线写入队列、照片附件、提醒、二维码和完整传代谱系不属于本次已交付版本。导出 Excel 保存完整字段；PDF 提供趋势与主要数据，可通过浏览器打印对话框另存为 PDF。

## 开发和验证

使用 Node >=22.13 与 pnpm，运行 `pnpm install`、`pnpm dev`、`pnpm build`。首次本地运行需把 drizzle 下迁移应用到本地 D1；生产迁移随 Sites 发布。

Firebase 版本使用 `pnpm dev:firebase` 本地预览、`pnpm build:firebase` 构建，输出目录为 `dist-firebase`。

- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/tsx/dist/cli.mjs tests/verify.ts`（先创建 work 目录）
- `node node_modules/tsx/dist/cli.mjs tests/passage.ts`：验证分瓶计算、体积约束、历史保留、备份兼容及导出标识。
- `tests/verify-api.ps1`：启动本地服务和本地数据库后，验证保存、读回、冲突、无权限请求、历史；结束恢复原始本地数据。

Google Drive 需要在生产站点完成一次真实账号授权验证。WebMCP 不受支持的浏览器自动忽略项目读取/导航接口。
