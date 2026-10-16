# Mower Homepage

Mower 产品首页，使用 React、TypeScript、Vite、Tailwind CSS 与 GSAP。

源码仓库：[ArkMowers/mower-website](https://github.com/ArkMowers/mower-website)。

## 开发

```sh
npm install
npm run dev
npm run build
npm run preview
```

## 页面与素材

默认使用亮色薄荷背景，保留现有标题、导航、下载与软件窗口布局。页头月亮／太阳按钮
切换亮暗模式，并在本机记住选择；`?theme=dark` 或 `?theme=light` 可指定初始主题。
主预览随主题切换真实的亮／暗软件截图。切换时背景、玻璃按钮和弹窗同步配色，保留
当前时装及玻璃实例；暗色下但书保持睡眠，切回亮色后醒来并恢复随机活动，
系统减少动态效果时显示对应静态姿势。浏览器禁用本地存储时
仍可切换主题。

背景由 `LightField` 的 WebGL2 画布生成。文字、导航、下载按钮与软件窗口使用 GSAP
入场；控件在入场期间仍可点击。导航使用位置偏移，下载区移动父层，保留玻璃控件本身
的弹性变换；动画中同步玻璃采样，结束后清除临时样式。页面隐藏时暂停背景更新，
系统要求减少动态效果时跳过入场并显示静态画面。

亮色主图保留原来的画面，并清理原始绿幕圆角；暗色主图采用新增的运行日志截图。
标题后方以低透明度、倾斜与边缘淡化展示排班编辑页面，跟随亮暗主题变化，不接收点击。
独立的 `ProductPreview` 与 `ScheduleBackdrop` 管理主图和装饰图；主图按实际比例限高，
提前缓存另一主题的图片，减少首次切换的等待。

游戏昵称与 ID 已在图片文件内不透明遮盖，标题栏按用户要求原样保留。匿名补丁通过
内建 ImageGen 制作并保存在 `scripts/assets/account-redaction.png`，再精确合成到原截图；
生成器检查遮盖区域外的 UI 像素不变。素材准备的最终提示要求为：不透明深灰账号面板，
两条浅灰匿名横条，不含任何文字数字，只输出账号补丁。
完整提示词与补丁来源见 `scripts/assets/account-redaction.md`。

旧公开原图与未匿名衍生图归档于忽略目录 `.screenshots.local/original-public/`，不进入
发布目录；本地开发服务也拒绝读取原图和旧检查截图。生成主图与排班图的完整尺寸和
960px WebP（需要本机原始截图）：

```sh
node scripts/prepare-showcase-assets.mjs
```

原始截图、本地检查文件和 `src/assets/cutouts/` 不提交到源码仓库。正常构建直接使用
`public/` 中已匿名处理的发布素材，无需重新生成截图；部署时只上传 `dist/`。

页头与标签页图标使用用户提供的原始透明 Logo。`mower-logo-original.png` 与 `mower-logo.png` 的字节和 RGBA 完全一致，保留原图的深色脸部、白色五官和原有阴影，不裁剪、不重着色、不增加底色或额外投影。页头以 42px 显示原图，避免内部留白使标志过小。`scripts/generate-brand-logo.mjs` 直接复制原图并生成透明 favicon，标签页图标带缓存版本。此前生成的单色轮廓图片已停止使用。

首页保持一屏高度，不纵向滚动。垂直空间不足时收紧间距、隐藏次要简介；较宽的短窗口
将下载按钮与版本切换并排，保留角色、预览和页脚入口。预览窗口按截图自身比例限高，
缩小时不会拉出图片下方的长条空白。背景固定在视口内，缩放时同步光晕、玻璃采样和
DPR，减少动态效果模式也会刷新布局。菜单与许可弹窗可在各自内部滚动。

## 许可与用户须知

独立组件 `src/components/site-footer.tsx` 在页面底部提供「软件开源许可」「用户须知」
和「第三方许可与素材来源」。前两项分别链接 Mower 软件的 MIT 许可证和官方已有的
用户须知；第三项打开可滚动的站内弹窗，列出 Lens、Spine 与角色模型来源和许可全文。
页脚同时保留角色素材的版权归属。软件许可证不代表全部网站素材的使用许可。

## Lens 按钮

下载按钮、GitHub 按钮与版本通道的选中按钮使用 [Lens](https://github.com/ruiqichenbiec/design-systems/tree/main/lens) 官方 WebGL2 折射与弹性引擎，默认 Thick 材质。版本通道保留原生按钮与读屏状态，下载链接和平台识别逻辑由 React 管理。

Lens 运行时及传递依赖保存在 `src/vendor/lens/`，固定版本、提交、来源和本项目的兼容性修改见该目录的 `UPSTREAM.md`，原始 MIT 许可证一并保留；构建产物也包含 `public/licenses/lens-MIT.txt`。无需远程 API、密钥、CDN 或额外运行时依赖。

`src/lib/use-lens-material.ts` 在页头、下载区域和打开的平台菜单上挂载独立材质。每个区域只接管自己的控件，排除嵌套菜单。光学场景保留完整 RGB，最后解算玻璃与原版动态投影的透明输出，不绘制整块背景矩形；重叠控件也能正确采样。渲染坐标按实际画布与 DOM 的比例换算，菜单入场缩放和不同 DPR 不会使玻璃选中层漂移。版本切换使用独立的玻璃滑块，文字按钮保持固定；链接与普通按钮采用相同的 18px 拖动范围，画布边缘保留足够的回弹空间。

Lens 通过 `artwork` 回调采样同一区域的真实背景画布；它不会自动捕获任意 DOM。保留 Demo 的 Thick 参数、0.95 光学亮度、悬停选中色、随压力变化的投影及弹簧形变，在纯色背景上也有边缘明暗和厚度。

背景先在布局阶段绘制，再初始化 Lens；导航和下载按钮从首屏可用，不再等待 GSAP 入场结束。渲染器提交真实首帧后才声明 `webgl-ready`。缓慢背景最多每秒绘制 24 次，纹理最多每秒刷新 10 次；按压、拖动和回弹期间暂停背景绘制与纹理上传，Lens 自身继续按浏览器帧率更新，回弹结束后恢复背景。交互声音关闭，WebGL2 不可用或上下文丢失时回退到 CSS 磨砂材质，保留所有按钮功能。卸载时销毁材质实例及监听器。

## 跨平台下载

主下载按钮识别当前平台，有对应安装包时直接下载；其他平台从页头菜单选择。支持 Windows、macOS Apple / Intel、Linux x64 / ARM64 和 Android APK / 更新包，支持正式版与测试版通道。

页面在后台请求 GitHub Releases API，同时查询最新正式版，避免频繁发布的测试版将正式版
挤出前 100 条。正式版保留最新版本，即使没有安装包也不会退回旧版；此时按钮改为
「查看正式版」，菜单注明暂无该平台安装包，并链接对应发布说明。2026-10-16 核实的
桌面正式版是 v4.1.5，官方仅提供源码附件。测试版仍可选择较早的兼容架构安装包，并
显示它的实际版本号。Android APK 单独使用其项目的发布数据。

网络不可用、限流或超时时，使用 `src/lib/releases.ts` 中已经核实的后备资源；各来源
独立回退，成功获取的数据优先于本地资料。按钮材质本身不发送网络请求。

## 首页基建小人

预览窗口顶部由独立组件 `src/components/operator-stage/operator-stage.tsx` 展示但书。
角色会在窗口宽度内缓慢走动，随机闲置、互动、坐下或睡眠；点击或通过键盘激活角色，
触发一次随机动作。悬停或聚焦角色时显示菜单按钮，可指定动作，或选择默认、悠然假日
HD78、秋高气爽三套时装。触屏设备始终显示菜单入口。菜单支持键盘操作，按 Escape
或点击外部关闭；操作时停止行走，方便选择。

组件接收首页的 `theme`，暗色下以睡眠为默认状态，亮色下恢复活动。暗色下主动点击或
选择动作仍播放一次，结束后继续睡眠；换装或加载过程中切换主题也采用最后一次选择。
切换主题复用已有播放器，不重新加载模型或重建 WebGL 上下文。

两套时装额外提供「特殊动作」：菜单按当前时装显示可用动作，原皮保留五个常规动作，
悠然假日 HD78 与秋高气爽各有第六个 `Special`。特殊动作也可通过点击或随机行为触发，
完整播放一次后返回当前主题的默认状态，不循环截断。

组件自行管理活动空间、点击区域、缩放和动画生命周期，首页仅增加一处挂载。
`models.ts` 定义时装清单与姿态基线；`spine-renderer.ts` 封装延迟加载的 Spine 3.8
播放器。一个透明画布绘制角色和道具，原生按钮提供局部点击与键盘操作，Radix Popover
管理菜单定位、焦点和关闭。行走边界使用整个动作与过渡的可见轮廓，避免睡姿或道具在
边缘截断。坐姿以座位对齐窗口顶边，画布在标题栏前额外保留空间，完整显示下垂的腿。
动画最多每秒更新 30 次，画布以 2 倍分辨率绘制以保留细小轮廓；页面隐藏或角色离屏时暂停。
系统要求减少动态效果时停止自动动画，用户主动选择的动作只播放一次；仍可换装。
WebGL 不可用、上下文丢失或模型加载
失败时使用本地静态图，保留换装功能。

三套模型及静态图保存在 `public/models/proviso/`，网站运行时不依赖外部模型服务。
资源来源、固定版本和素材使用条件见该目录的 `SOURCE.md`；播放器版本、适配说明和
许可证见 `src/vendor/spine/UPSTREAM.md`。更新资源后可运行：

```sh
node scripts/fetch-proviso-assets.mjs
node scripts/generate-operator-posters.mjs
```

## 检查

```sh
npm run lint
npm run build
node scripts/verify-lens-ui.mjs
node scripts/verify-lens-geometry.mjs
node scripts/verify-operator-stage.mjs
node scripts/verify-operator-poses.mjs
node scripts/verify-zoom-layout.mjs
node scripts/verify-single-screen-layout.mjs
node scripts/verify-theme-toggle.mjs
node scripts/verify-showcase-updates.mjs
node scripts/verify-releases.mjs
node scripts/verify-theme-operator.mjs
```

浏览器检查使用 Playwright 和本机 Edge，自动启动临时 Vite 服务。覆盖桌面、平板、手机和横屏布局，亮色截图、Logo、Lens 实际画布、键盘导航、版本通道、平台下载、减少动态效果及 CSS 回退。截图和检查结果保存到本地忽略目录 `.taste-skill/lens/after/`。

版本检查使用实际解析器和下载组件，模拟分页、空附件、部分 API 失败及离线后备数据，
验证正式版发布说明和安装包的链接。角色主题检查使用 Edge 的实际 WebGL 画面，覆盖
睡眠、唤醒、互动后回睡、换装与加载期间切换主题、减少动态效果及手机一屏布局。

缩放检查使用 CSS 视口与 DPR 组合模拟 75%–200% 的布局条件，覆盖矮屏、手机、
人物菜单及许可弹窗，结果写入 `.taste-skill/zoom/`；这与浏览器 UI 快捷键缩放的自动化
测试不同。

单屏检查按 2560×1187 物理浏览器内容区、150% 系统缩放，模拟 25%–200% 浏览器缩放，
并覆盖手机与横屏。验证首页无滚动、关键入口在屏内、预览无过长空白，以及弹窗内部
滚动不影响首页；结果保存在 `.taste-skill/single-screen/`。

本机 Edge 的 CDP 仅改变 DPR 时没有派发原生分辨率变化事件，该子项显式模拟媒体查询事件，
验证画布尺寸更新的响应；报告保留事件模拟记录，不将其视为原生浏览器事件验证。

## 主要文件

- `src/App.tsx`：文案、导航与真实亮色截图
- `src/App.css`：布局、Lens 材质适配、回退与响应式样式
- `src/components/download-control.tsx`：平台菜单、版本通道与直接下载
- `src/components/light-field.tsx`：动态背景与 Lens 纹理刷新事件
- `src/components/site-footer.tsx`：许可、用户须知与第三方素材说明
- `src/components/theme-toggle.tsx`：页头亮暗色切换按钮
- `src/components/product-screenshots.tsx`：按主题切换的主图与标题后排班图
- `src/lib/theme.ts`：初始主题、本地偏好与浏览器配色同步
- `src/lib/use-lens-material.ts`：Lens 的 React 生命周期与背景采样
- `src/vendor/lens/`：原始开源运行时、类型声明和许可证
- `scripts/generate-light-screenshot.mjs`：亮色截图裁剪与响应式图片生成
- `scripts/verify-lens-ui.mjs`：当前页面的浏览器验证

旧版 `scripts/verify-ui.mjs` 面向此前的截图弹窗与页面结构，保留供历史参考。
