# Mower Website

[Arknights Mower](https://github.com/ArkMowers/arknights-mower) 的产品官网，
提供项目介绍、使用文档入口和各平台正式版／测试版下载。

使用 React、TypeScript、Vite、Tailwind CSS 和 GSAP。网站采用静态构建，
图片、字体与角色模型随站点提供；下载版本从 GitHub Releases 获取。

## 本地开发

需要 Node.js 24（见 `.node-version`）和 npm。

```sh
npm ci
npm run dev
```

构建并预览生产版本：

```sh
npm run build
npm run preview
```

构建产物位于 `dist/`。常规构建使用仓库中已有的素材，无需重新生成截图或模型。

## 部署

项目使用 Cloudflare Workers Static Assets，配置见 [wrangler.jsonc](wrangler.jsonc)。
连接 [ArkMowers/mower-website](https://github.com/ArkMowers/mower-website)
的 `main` 分支后，构建命令使用 `npm run build`，部署命令使用 `npm run deploy`。

首次授权 GitHub、填写项目参数和绑定域名的步骤见 [部署指南](docs/deployment.md)。

## 检查与维护

```sh
npm run lint
npm run build
```

维护约束见 [AGENTS.md](AGENTS.md)；实现说明、素材生成和按任务选择的浏览器检查
见 [维护文档](docs/maintenance.md)。

## 第三方许可与素材

网站使用的 Lens、Spine 运行时和角色模型分别遵循各自的许可与使用条件：

- [Lens 来源与修改说明](src/vendor/lens/UPSTREAM.md)
- [Spine 来源与适配说明](src/vendor/spine/UPSTREAM.md)
- [角色模型与素材来源](public/models/proviso/SOURCE.md)

Mower 软件的 MIT 许可证适用于软件本身；网站中的第三方代码和美术素材按各自许可使用。
