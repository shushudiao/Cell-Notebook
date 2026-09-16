# Firebase 免费发布设置

这个版本使用 Firebase Spark 免费方案：Firebase Hosting 负责网页，Google 登录负责账号，Cloud Firestore 负责自动同步。网页不再要求用户单独连接 Google Drive；登录状态会保存在浏览器中，再次打开通常会直接进入记录页。

## 当前项目

代码已连接到 Firebase 项目 `cell-notebook-zihan`，Google 登录和 Firestore 已启用，用户隔离安全规则已经发布。以下步骤保留给以后更换 Firebase 项目时参考。

## 1. 创建免费 Firebase 项目

1. 打开 https://console.firebase.google.com/ 并选择“创建项目”。
2. Google Analytics 可以关闭；本应用不需要它。
3. 项目建立后，添加一个 Web 应用（`</>` 图标），应用名称可填写 `Cell Notebook`。
4. 复制页面给出的 `firebaseConfig` 四个值：`apiKey`、`authDomain`、`projectId`、`appId`。
5. 把这些值填写到 `firebase/firebase-config.ts`。它们是 Firebase Web 应用的公开标识，不是需要保密的服务器密钥。

## 2. 打开 Google 登录

1. Firebase 控制台进入 **Authentication → Sign-in method**。
2. 启用 **Google**，选择项目支持邮箱并保存。
3. 发布到自定义域名时，把该域名加入 **Authentication → Settings → Authorized domains**。Firebase 自带的 `web.app` 与 `firebaseapp.com` 域名会自动加入。

## 3. 建立数据库

1. 进入 **Firestore Database → Create database**。
2. 选择 **Production mode** 和离用户较近的区域。
3. 本项目的 `firestore.rules` 只允许登录用户读写自己 UID 下的数据。

## 4. 构建与发布

如果使用已经生成的部署包，解压后双击 `deploy-firebase.cmd`，在打开的浏览器中登录 Google 账号即可。脚本会自动发布并打开新网址。

也可以手动运行：

安装 Node.js 22 和 pnpm 后，在项目目录运行：

```text
pnpm install
pnpm build:firebase
npx firebase-tools login
npx firebase-tools deploy --only hosting,firestore:rules
```

`.firebaserc` 已指定当前项目。发布成功后，终端会显示免费的 `https://cell-notebook-zihan.web.app` 地址。

## 5. 从旧版迁移记录

1. 在旧版打开“同步与备份”，点击“下载备份”。
2. 打开 Firebase 新版并使用 Google 账号登录。
3. 在“同步与备份”中点击“读取备份”，选择旧版下载的 JSON 文件，查看概况后确认恢复。

以后每次新增、修改或删除记录都会自动保存到 Firestore。应用仍保留 JSON 下载和恢复，建议重要实验阶段额外下载一份备份。

