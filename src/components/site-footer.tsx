import { Dialog } from 'radix-ui'
import './site-footer.css'

const SOFTWARE_LICENSE_URL = 'https://github.com/ArkMowers/arknights-mower/blob/main/LICENSE'
const USER_NOTICE_URL = 'https://arkmowers.github.io/arknights-mower/former-manual/manualV2/notice/'
const MODEL_SOURCE_URL = 'https://github.com/isHarryh/Ark-Models/blob/8a3857c250a5c271429aefa82c660ff35803166e/README.md#版权声明'

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="site-footer-links" aria-label="许可与使用说明">
        <a href={SOFTWARE_LICENSE_URL} target="_blank" rel="noopener noreferrer">软件开源许可</a>
        <a href={USER_NOTICE_URL} target="_blank" rel="noopener noreferrer">用户须知</a>
        <Dialog.Root>
          <Dialog.Trigger className="site-footer-license-trigger">第三方许可与素材来源</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="site-license-overlay" />
            <Dialog.Content className="site-license-dialog">
              <header className="site-license-heading">
                <Dialog.Title>第三方许可与素材来源</Dialog.Title>
                <Dialog.Close className="site-license-close" aria-label="关闭许可说明">
                  <span aria-hidden="true">×</span>
                </Dialog.Close>
              </header>
              <Dialog.Description className="site-license-description">
                以下列出第三方组件的许可与角色素材来源。
              </Dialog.Description>
              <section className="site-license-section" aria-labelledby="lens-license-heading">
                <h3 id="lens-license-heading">Lens</h3>
                <p>玻璃按钮使用 Lens 运行时，采用 MIT 许可。</p>
                <a href="/licenses/lens-MIT.txt" target="_blank" rel="noopener noreferrer">阅读 Lens 许可全文</a>
              </section>
              <section className="site-license-section" aria-labelledby="spine-license-heading">
                <h3 id="spine-license-heading">Spine Runtimes</h3>
                <p>角色动画使用 Spine 3.8 运行时，适用独立的 Spine Runtimes 许可。</p>
                <a href="/licenses/spine-runtimes.txt" target="_blank" rel="noopener noreferrer">阅读 Spine 许可全文</a>
              </section>
              <section className="site-license-section" aria-labelledby="model-source-heading">
                <h3 id="model-source-heading">《明日方舟》角色素材</h3>
                <p>但书模型与动画取自 Ark-Models。素材版权归上海鹰角网络有限公司所有；来源仓库注明不得用于商业用途，不得损害版权方利益。</p>
                <a href={MODEL_SOURCE_URL} target="_blank" rel="noopener noreferrer">查看素材来源与版权声明</a>
              </section>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </nav>
      <p>《明日方舟》角色素材版权归上海鹰角网络有限公司所有。</p>
    </footer>
  )
}
