import { useState } from 'react'

/**
 * 1. Elevated Emulator Screen Component
 * Real Arknights Terminal screen (MuMu12 @16384 with Magellan) + Active YOLOv8 HUD Reticle
 */
export function LayerEmulatorScreen() {
  const [hudActive, setHudActive] = useState(true)

  return (
    <div
      className="mower-layer-card layer-emulator"
      onClick={(e) => {
        e.stopPropagation()
        setHudActive(!hudActive)
      }}
      title="点击切换视觉目标检测 HUD"
      aria-label="安卓模拟器运行终端"
    >
      {/* Emulator Chrome Header */}
      <div className="emulator-chrome">
        <div className="chrome-left">
          <span className="live-dot" aria-hidden="true" />
          <span className="chrome-tag">MuMu12 @16384</span>
          <span className="chrome-divider">/</span>
          <span className="chrome-sub">明日方舟 终端画面</span>
        </div>
        <div className="chrome-right">
          <span className={`hud-badge ${hudActive ? 'hud-active' : ''}`}>
            {hudActive ? 'YOLOv8 识别中' : '实时预览'}
          </span>
        </div>
      </div>

      {/* Screen Viewport */}
      <div className="emulator-display-wrap">
        <img
          src="/images/mower-emulator-screen.webp"
          alt="明日方舟终端运行界面"
          className="emulator-screen-img"
          width="512"
          height="288"
          loading="eager"
        />

        {/* Bionic Vision Target Detection Reticle Overlay HUD */}
        {hudActive && (
          <div className="vision-reticle-overlay" aria-hidden="true">
            <div className="reticle-box box-base">
              <span className="box-corner c-tl" />
              <span className="box-corner c-tr" />
              <span className="box-corner c-bl" />
              <span className="box-corner c-br" />
              <div className="reticle-laser-line" />
              <span className="reticle-label">目标: 制造站 · 产物满溢 (99.8%)</span>
            </div>
            <div className="reticle-box box-terminal">
              <span className="box-corner c-tl" />
              <span className="box-corner c-tr" />
              <span className="box-corner c-bl" />
              <span className="box-corner c-br" />
              <span className="reticle-label">理智正常 (135/135)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 2. Elevated Base Scheduling Matrix Component
 * Exact data and layout from Mower screenshot
 */
export function LayerScheduleTable() {
  const scheduleRows = [
    { time: '09:19:25', room: 'room_1_1', ops: ['但书'], tag: '已完成' },
    { time: '10:42:02', room: '肥鸭', ops: ['充能就绪'], tag: '就绪' },
    { time: '10:46:47', room: 'room_2_1', ops: ['Current', '但书', '龙舌兰'], highlight: true, tag: '收益+150%' },
    { time: '10:46:47', room: 'central', ops: ['Current', '歌蒂', 'Current', 'Current', 'Current'], tag: '全天轮驻' },
    { time: '12:19:40', room: 'room_2_2', ops: ['Current', '乌尔比安', '安哲拉'], tag: '作战记录' },
    { time: '12:19:40', room_3_2: true, room: 'room_3_2', ops: ['斯卡蒂', '幽灵鲨'], tag: '深海猎人' },
  ]

  return (
    <div className="mower-layer-card layer-schedule" aria-label="基建排班流水任务">
      <div className="schedule-card-header">
        <div className="schedule-header-left">
          <span className="schedule-title-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="3" y="4" width="14" height="13" rx="2" />
              <line x1="3" y1="8" x2="17" y2="8" />
            </svg>
          </span>
          <span className="schedule-title">基建排班流水任务</span>
        </div>
        <span className="schedule-badge">自动轮换</span>
      </div>

      <div className="schedule-table-wrap">
        <div className="schedule-table-head">
          <span className="th-time">时间</span>
          <span className="th-task">任务与干员分配</span>
          <span className="th-status">状态</span>
        </div>
        <div className="schedule-table-body">
          {scheduleRows.map((row, idx) => (
            <div key={idx} className={`schedule-table-row ${row.highlight ? 'row-highlight' : ''}`}>
              <span className="td-time">{row.time}</span>
              <div className="td-task">
                <span className="room-label">{row.room}</span>
                <div className="ops-wrap">
                  {row.ops.map((op, i) => (
                    <span
                      key={i}
                      className={`op-pill ${
                        op === '但书' || op === '龙舌兰'
                          ? 'op-gold'
                          : op === '歌蒂' || op === '乌尔比安' || op === '斯卡蒂'
                          ? 'op-cyan'
                          : ''
                      }`}
                    >
                      {op}
                    </span>
                  ))}
                </div>
              </div>
              <span className={`td-status ${row.highlight ? 'status-boost' : ''}`}>{row.tag}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * 3. Elevated Live Console Log Stream Component
 * Verbatim logs & subtable banner from Mower screenshot
 */
export function LayerConsoleLog() {
  return (
    <div className="mower-layer-card layer-console" aria-label="运行日志">
      {/* Sub-table banner */}
      <div className="console-subtable-banner">
        <span className="subtable-prefix">当前激活的副表为:</span>
        <span className="subtable-name">深海下水 但书跑单 龙舌兰副名誉</span>
      </div>

      {/* Terminal log lines */}
      <div className="console-log-stream">
        <div className="log-line">
          <span className="log-timestamp">2026-10-14 09:08:56,833</span>
          <span className="log-level-info">INFO</span>
          <span className="log-msg">记录MA 本次执行时间 2026-10-14 09:08:56.833614</span>
        </div>
        <div className="log-line">
          <span className="log-timestamp">2026-10-14 09:08:56,837</span>
          <span className="log-level-info">INFO</span>
          <span className="log-msg">记录首次信用作战</span>
        </div>
        <div className="log-line">
          <span className="log-timestamp">2026-10-14 09:08:56,886</span>
          <span className="log-level-info">INFO</span>
          <span className="log-msg">切回主界面</span>
        </div>
        <div className="log-line log-line-active">
          <span className="log-timestamp">2026-10-14 09:08:56,937</span>
          <span className="log-level-info">INFO</span>
          <span className="log-msg">
            下一次任务:{`{'room_1_1': ['但书']}`} · 休息 10 分钟, 到09:19:25开始工作
          </span>
        </div>
        <div className="log-line">
          <span className="log-timestamp">2026-10-14 09:08:56,938</span>
          <span className="log-level-info">INFO</span>
          <span className="log-msg">第26次任务结束</span>
        </div>
      </div>
    </div>
  )
}

/**
 * 4. Elevated Bottom Action Bar Component
 * The authentic Mower tactile buttons & quick toggles + Fullscreen expand
 */
export function LayerBottomActionBar({ onExpandOriginal }: { onExpandOriginal?: () => void }) {
  const [running, setRunning] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [previewShot, setPreviewShot] = useState(true)

  return (
    <div className="mower-layer-card layer-action-bar" aria-label="底栏控制操作区">
      <div className="action-buttons-left">
        <button
          type="button"
          className={`mower-btn ${running ? 'btn-stop' : 'btn-start'}`}
          onClick={(e) => {
            e.stopPropagation()
            setRunning(!running)
          }}
          title={running ? '点击停止任务' : '点击启动任务'}
        >
          <span className="btn-icon">{running ? '■' : '▶'}</span>
          <span>{running ? '立即停止' : '启动调度'}</span>
        </button>

        <span className="status-sleep-pill">
          <span className="sleep-icon">▲</span>
          <span>休眠中</span>
        </span>

        <button type="button" className="mower-btn btn-add" onClick={(e) => e.stopPropagation()}>
          <span className="btn-plus">+</span>
          <span>新增任务</span>
        </button>

        <span className="btn-help-circle" title="帮助文档">?</span>

        <button type="button" className="mower-btn btn-feedback" onClick={(e) => e.stopPropagation()}>
          <span className="btn-chat">💬</span>
          <span>反馈问题</span>
        </button>

        <button type="button" className="mower-btn btn-database" onClick={(e) => e.stopPropagation()}>
          <span className="btn-db-icon">🗄</span>
          <span>数据库管理</span>
        </button>
      </div>

      <div className="action-toggles-right">
        <label
          className="mower-checkbox"
          onClick={(e) => {
            e.stopPropagation()
            setPreviewShot(!previewShot)
          }}
        >
          <input type="checkbox" checked={previewShot} readOnly />
          <span>预览截图</span>
        </label>

        <label
          className="mower-toggle-switch"
          onClick={(e) => {
            e.stopPropagation()
            setAutoScroll(!autoScroll)
          }}
        >
          <span className={`toggle-track ${autoScroll ? 'toggle-on' : ''}`}>
            <span className="toggle-thumb" />
          </span>
          <span>自动滚动</span>
        </label>

        {onExpandOriginal && (
          <button
            type="button"
            className="mower-expand-trigger-btn"
            onClick={(e) => {
              e.stopPropagation()
              onExpandOriginal()
            }}
            title="放大查看完整高清运行原画"
          >
            <span className="expand-icon" aria-hidden="true">⤢</span>
            <span>全屏原画</span>
          </button>
        )}
      </div>
    </div>
  )
}
