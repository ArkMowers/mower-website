# 维护参考

本文件记录当前实现的边界、素材更新方式和检查入口。日常维护约束见
[AGENTS.md](../AGENTS.md)，Cloudflare 连接步骤见 [部署指南](deployment.md)。

## 主题与页面布局

`src/lib/theme.ts` 管理初始主题、本地偏好与系统配色同步。
`?theme=dark` 或 `?theme=light` 可指定初始主题；浏览器禁用本地存储时仍可切换。
`src/components/product-screenshots.tsx` 中的 `ProductPreview` 和 `ScheduleBackdrop`
分别管理主软件窗口和标题后的排班装饰图，提前缓存另一主题图片。

`src/App.css` 维持单屏布局。垂直空间不足时收紧间距、隐藏次要简介；
较宽的短窗口将下载按钮和版本通道并排。主图按实际比例限高，
背景固定于视口，装饰图不接收点击；菜单与许可弹窗在各自内部滚动。
缩放变化时，背景和玻璃采样须同步尺寸与 DPR。

## 背景与 Lens

`src/components/light-field.tsx` 提供 WebGL2 背景画布；
`src/lib/use-lens-material.ts` 在页头、下载区和打开的平台菜单上挂载独立 Lens 材质。
区域只接管自身控件，排除嵌套菜单；版本切换使用玻璃滑块，文字按钮位置保持固定。

Lens 运行时在 `src/vendor/lens/`，来源、固定版本和兼容性修改见该目录的
`UPSTREAM.md`。`artwork` 回调只采样真实背景画布，不能自动捕获任意 DOM。
光学场景保留 RGB，最终输出透明玻璃和投影，避免绘制整块背景矩形。
渲染坐标按实际画布与 DOM 比例换算，覆盖菜单入场缩放、重叠控件和不同 DPR。
当前材质使用 Thick 参数、0.95 光学亮度，链接与普通按钮使用相同的 18px 拖动范围。

背景先在布局阶段绘制，再初始化 Lens；真实首帧提交后才声明 `webgl-ready`。
缓慢背景最多每秒更新 24 次，纹理最多每秒刷新 10 次。按压、拖动与回弹期间暂停
背景绘制和纹理上传，Lens 自身继续按浏览器帧率更新，回弹后恢复背景。
声音关闭，组件卸载时销毁材质与监听器。

GSAP 入场动画需要同步玻璃采样，动画结束后清除临时变换；导航使用位置偏移，
下载区移动父层，保留控件自己的弹性变换。页面隐藏时暂停更新，
减少动态效果时显示静态画面；WebGL2 不可用或上下文丢失时使用 CSS 磨砂回退。

## 下载与版本数据

`src/components/download-control.tsx` 管理平台识别、版本通道和下载菜单；
`src/lib/releases.ts` 负责 GitHub Releases 数据解析与后备资源。
覆盖 Windows、macOS Apple／Intel、Linux x64／ARM64 和 Android APK／更新包。

桌面端分别请求 releases 列表和最新正式 release，避免正式版被频繁发布的测试版
挤出前 100 条。正式版缺少安装包时显示「查看正式版」，链接该版本发布说明，
菜单注明缺少对应平台附件；测试版可选较早的兼容架构安装包，并显示实际版本号。
Android APK 使用独立项目的发布数据。

网络失败、限流或超时时，各来源独立使用本地后备数据，成功获取的数据优先。
更新后备数据时重新核实版本和安装包链接；将核实日期留在数据或提交说明中，
避免把会过时的最新版本号写入通用维护规则。按钮材质不负责网络请求。

## 角色播放器

`src/components/operator-stage/operator-stage.tsx` 管理但书的活动、互动和时装菜单，
`models.ts` 定义模型清单与姿态基线，`spine-renderer.ts` 封装延迟加载的 Spine 3.8 播放器。
模型与静态图均位于 `public/models/proviso/`；运行时不依赖外部模型服务。

亮色下角色缓慢走动，随机闲置、互动、坐下或睡眠；暗色下默认睡眠，主动操作播放一次
后回到睡眠。切换主题复用播放器，加载或换装过程中以最后一次主题和时装选择为准。
默认、悠然假日 HD78、秋高气爽三套时装共享常规动作，两套时装额外提供 `Special`，
特殊动作完整播放一次后回到当前主题的默认状态。

一个透明画布绘制角色及道具，原生按钮提供局部点击与键盘操作，Radix Popover
管理菜单定位、焦点和关闭。触屏始终显示菜单入口，操作菜单时停止行走。
行走边界计入动作与过渡的可见轮廓；坐姿按座位对齐窗口顶边，并为下垂的腿保留空间。
动画最多每秒更新 30 次，画布使用 2 倍分辨率；页面隐藏或角色离屏时暂停。
减少动态效果时停止自动动画，主动选择的动作只播放一次；WebGL 或模型加载失败时
回退到本地静态图，保留换装功能。

## 素材生成

正常开发与构建使用仓库已有的发布素材。以下原图生成任务需要本机忽略目录中的
原始截图，不能假设全新克隆拥有这些文件。

| 任务 | 入口与所需资料 |
| --- | --- |
| 主图与排班图 | `node scripts/prepare-showcase-assets.mjs`；需要根目录的中文原图与 `.screenshots.local/original-public/` 中的亮色原图 |
| 匿名补丁 | `scripts/assets/account-redaction.png`；提示词、来源与合成说明见同目录 `account-redaction.md` |
| Logo 与 favicon | `node scripts/generate-brand-logo.mjs`；读取 `public/brand/mower-logo.png`，生成字节一致的 `mower-logo-original.png` 副本和透明 favicon |
| 角色模型 | `node scripts/fetch-proviso-assets.mjs`；来源及使用条件见 `public/models/proviso/SOURCE.md` |
| 角色静态图 | `node scripts/generate-operator-posters.mjs`；使用已下载的模型 |

截图生成器输出完整尺寸和 960px WebP，并检查匿名遮盖区域外的 UI 像素不变。
原始绿幕圆角需要清理；游戏昵称和 ID 必须在实际文件内不透明遮盖。
Logo 的发布副本与原图保持字节和 RGBA 一致，页头显示尺寸为 42px，
favicon 更新后使用缓存版本；已有单色轮廓文件未用于当前页头。

旧的 `scripts/generate-window-assets.mjs` 依赖被忽略的 `src/assets/cutouts/`，
不属于常规构建流程。

## 按变更选择检查

代码或构建配置检查先使用 `npm run build`，代码静态检查使用 `npm run lint`。
部署配置另运行 `npm run deploy -- --dry-run`。浏览器脚本使用 Playwright 与本机 Edge，
自行启动临时 Vite 服务，输出图片和报告到 `.taste-skill/` 下的忽略目录。

| 变更范围 | 检查入口（均位于 `scripts/`，使用 `node` 运行） |
| --- | --- |
| Lens、按钮交互、采样与菜单几何 | `verify-lens-ui.mjs`、`verify-lens-geometry.mjs` |
| 主题、截图、Logo 与原图访问保护 | `verify-theme-toggle.mjs`、`verify-showcase-updates.mjs` |
| 角色活动、姿态与菜单 | `verify-operator-stage.mjs`、`verify-operator-poses.mjs` |
| 角色与主题联动 | `verify-theme-operator.mjs` |
| 缩放、矮屏、手机与一屏布局 | `verify-zoom-layout.mjs`、`verify-single-screen-layout.mjs` |
| 版本通道、空附件与网络失败 | `verify-releases.mjs` |

版本检查使用实际解析器和下载组件，模拟分页、空附件、部分 API 失败及离线后备。
角色主题检查覆盖睡眠、唤醒、互动后回睡、换装、加载期间切换主题及减少动态效果。
缩放脚本使用 CSS 视口与 DPR 组合模拟布局，并非浏览器快捷键缩放的自动化操作。
本机 Edge 的 CDP 仅改变 DPR 时可能不派发分辨率事件，该子项显式模拟媒体查询事件，
报告应保留模拟记录。`verify-ui.mjs` 面向旧版截图弹窗与页面结构，仅供历史参考。

## 许可入口

`src/components/site-footer.tsx` 提供软件许可、用户须知以及第三方许可弹窗。
维护运行时或模型时同步核对 `src/vendor/lens/UPSTREAM.md`、
`src/vendor/spine/UPSTREAM.md`、`public/models/proviso/SOURCE.md` 与 `public/licenses/`。
