# 部署到 Cloudflare

本项目使用 Cloudflare Workers Static Assets 托管 Vite 构建产物。部署配置保存在
`wrangler.jsonc`，只发布 `dist/`；网站没有服务端入口、数据库或运行时密钥。

## 连接 GitHub 仓库

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)，选择承载官网的账户。
2. 进入 **Workers & Pages → Create application → GitHub**。
3. 在 GitHub 授权中选择 **ArkMowers**，为 **Cloudflare Workers and Pages** 应用
   选择 **Only select repositories**，勾选 `mower-website`。
   如果应用已安装，在现有安装的 Repository access 中加入此仓库。
4. 回到 Cloudflare，选择 `ArkMowers/mower-website`，填写下表，然后 **Save and Deploy**。

| 配置项 | 值 |
| --- | --- |
| Worker 名称 | `mower-website`，与 `wrangler.jsonc` 中的 `name` 一致 |
| 生产分支 | `main` |
| 根目录 | 仓库根目录，留空或 `/` |
| 构建命令 | `npm run build` |
| 部署命令 | `npm run deploy` |
| Node.js | `.node-version` 指定的 24；通常无需另填变量 |
| 运行时变量与密钥 | 无需添加 |

依赖由 Cloudflare 根据 `package-lock.json` 安装，静态资源目录由 `wrangler.jsonc`
指定为 `./dist`。这套配置使用 Workers 的构建和部署流程。

安装组织级 GitHub App 需要组织 owner 或具备相应应用管理权限的成员。若授权页要求
组织批准，请让有权限的成员批准此仓库；无需把私有仓库改为公开。

连接成功后，推送到 `main` 会自动触发构建与部署。首次部署成功后，从项目页面打开
实际返回的 `workers.dev` 地址，检查页面加载、亮暗主题、手机布局、角色动画和各平台下载。
安装包仍由 GitHub 提供；版本查询失败时使用页面内置的后备数据。

如果 CF 中已有同名 Worker，进入该项目的 **Settings → Builds → Connect**
连接仓库，并使用同一组构建参数。

## 正式域名

在域名所属的 Cloudflare zone 生效后，进入 Worker 的
**Settings → Domains & Routes → Add → Custom Domain**，绑定计划使用的域名。
验证域名与 HTTPS 可访问后，将 `index.html` 的分享图改为该域名下的绝对地址，
并补充 canonical 与 `og:url`。

GitHub 仓库保持私有不会限制部署后网站的公开访问。

## 本地检查与手动部署

```sh
npm ci
npm run build
npm run preview:cloudflare
```

生产构建与部署配置可通过 dry run 检查，无需发布：

```sh
npm run deploy -- --dry-run
```

手动部署时，先运行 `npx wrangler login` 登录目标 Cloudflare 账户，再运行
`npm run build` 和 `npm run deploy`。Git 自动部署不需要在仓库内保存个人登录凭据。

## 官方说明

- [Workers Builds：连接新项目与已有项目](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [构建命令、部署命令与根目录](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [GitHub 组织授权与仓库访问范围](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
- [构建环境与 Node.js 版本](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [静态资源与 SPA 路由](https://developers.cloudflare.com/workers/static-assets/)
- [绑定自定义域名](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
