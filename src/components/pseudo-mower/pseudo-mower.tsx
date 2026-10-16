import { useEffect, useRef, useState } from 'react'
import {
  BookOpen,
  Gear,
  CalendarBlank,
  TrendUp,
  ChartBar,
  Question,
  Backpack,
  Sliders,
  Wrench,
  ChatsCircle,
  Play,
  Stop,
  Plus,
  Check,
  CaretDown,
  Minus,
  Square,
  X,
  Sparkle,
  Database,
  ArrowClockwise,
} from '@phosphor-icons/react'
import './pseudo-mower.css'

export type TabType =
  | 'logs'
  | 'settings'
  | 'schedule'
  | 'growth'
  | 'charts'
  | 'skills'
  | 'ai'

interface LogEntry {
  id: string
  time: string
  level: 'INFO' | 'WARN' | 'SUCCESS'
  tag?: string
  text: string
  color?: string
}

interface ScheduleItem {
  id: string
  time: string
  room: string
  ops: string[]
  highlight?: boolean
  tag?: string
}

const INITIAL_SCHEDULE: ScheduleItem[] = [
  { id: '1', time: '09:19:25', room: 'room_1_1', ops: ['但书'], tag: '已完成' },
  { id: '2', time: '10:42:02', room: '肥鸭', ops: ['充能就绪'], tag: '就绪' },
  { id: '3', time: '10:46:47', room: 'room_2_1', ops: ['Current', '但书', '龙舌兰'], highlight: true, tag: '收益+150%' },
  { id: '4', time: '10:46:47', room: 'central', ops: ['Current', '歌蕾蒂娅', 'Current', 'Current', 'Current'], tag: '全天轮驻' },
  { id: '5', time: '12:19:40', room: 'room_2_2', ops: ['Current', '乌尔比安', '安哲拉'], tag: '作战记录' },
  { id: '6', time: '12:19:40', room: 'room_3_2', ops: ['斯卡蒂', '幽灵鲨'], tag: '深海猎人' },
]

const INITIAL_LOGS: LogEntry[] = [
  { id: 'l1', time: '09:08:56,833', level: 'INFO', text: '记录MAA 本次执行时间 2026-10-15 09:08:56.833614' },
  { id: 'l2', time: '09:08:56,837', level: 'INFO', text: '记录首次信用作战，获取 300 信用' },
  { id: 'l3', time: '09:08:56,886', level: 'INFO', text: '切回明日方舟终端主界面' },
  { id: 'l4', time: '09:08:56,937', level: 'INFO', text: "下一次任务: {'room_1_1': ['但书']}。到 09:19:25 开始工作", color: '#4ade80' },
  { id: 'l5', time: '09:08:56,937', level: 'INFO', text: '休息 10 分钟，到 09:19:25 开始工作' },
  { id: 'l6', time: '09:08:56,938', level: 'SUCCESS', text: '第 26 次基建智能轮驻任务圆满完成' },
]

const RANDOM_LOG_POOL = [
  { level: 'INFO' as const, text: '[基建调度] 扫描制造站产物：作战记录 12 份已自动入库' },
  { level: 'INFO' as const, text: '[贸易管理] 发现高价值贵金属订单：4 份赤金成交，龙门币 +2,000' },
  { level: 'INFO' as const, text: '[无人机] 监测到充能满溢，自动加速制造站【赤金产线】' },
  { level: 'INFO' as const, text: '[公招识别] 词条识别完成：[高级资深干员] [近卫] -> 锁定 6★ 干员池' },
  { level: 'INFO' as const, text: '[宿舍轮替] 肥鸭(菲亚梅塔) 精神充能恢复完毕，准备移出宿舍' },
  { level: 'INFO' as const, text: '[好友互动] 拜访好友基建 10/10，领取 300 信用点数' },
  { level: 'SUCCESS' as const, text: '[纯本地图像识别] YOLOv8 目标推理完成，延迟 16.4ms，零注入拦截' },
  { level: 'INFO' as const, text: '[控制中枢] 歌蕾蒂娅深海猎人羁绊生效，全体深海成员心情消耗 -0.5/h' },
]

export function PseudoMower() {
  const [activeTab, setActiveTab] = useState<TabType>('logs')
  const [isRunning, setIsRunning] = useState(true)
  const [showPreview, setShowPreview] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const [schedule, setSchedule] = useState<ScheduleItem[]>(INITIAL_SCHEDULE)
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS)
  const [activeSubtables, setActiveSubtables] = useState<Record<string, boolean>>({
    深海下班: true,
    但书黑名单: true,
    龙舌兰黑名单: false,
  })
  const [showAddTask, setShowAddTask] = useState(false)
  const [showDbInfo, setShowDbInfo] = useState(false)
  const [tapRipple, setTapRipple] = useState<{ x: number; y: number } | null>(null)
  const [windowState, setWindowState] = useState<'normal' | 'maximized'>('normal')

  const logContainerRef = useRef<HTMLDivElement>(null)

  // Real-time log generator simulation when isRunning is true
  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      const template = RANDOM_LOG_POOL[Math.floor(Math.random() * RANDOM_LOG_POOL.length)]
      const now = new Date()
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')},${String(now.getMilliseconds()).padStart(3, '0')}`
      setLogs((prev) => [
        ...prev.slice(-35),
        {
          id: `log-${Date.now()}`,
          time: timeStr,
          level: template.level,
          text: template.text,
        },
      ])
    }, 3800)
    return () => clearInterval(interval)
  }, [isRunning])

  // Auto-scroll log container to bottom
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Handle simulated tap on emulator preview
  const handleEmulatorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setTapRipple({ x, y })
    setTimeout(() => setTapRipple(null), 600)
    
    // Append simulated interaction log
    const now = new Date()
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')},${String(now.getMilliseconds()).padStart(3, '0')}`
    setLogs((prev) => [
      ...prev,
      {
        id: `tap-${Date.now()}`,
        time: timeStr,
        level: 'INFO',
        text: `[网页交互模拟] 收到点击事件坐标 (${Math.round(x)}, ${Math.round(y)}) · 识别为基建快捷操作`,
        color: '#67e8f9',
      },
    ])
  }

  // Toggle subtable tag
  const toggleSubtable = (name: string) => {
    setActiveSubtables((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  return (
    <div className={`pseudo-mower-window ${windowState === 'maximized' ? 'window-maximized' : ''}`}>
      {/* 1. Authentic Windows / Mower Client Title Bar */}
      <div className="mower-titlebar">
        <div className="titlebar-left">
          <img
            src="/brand/mower-logo.png"
            alt="Mower Logo"
            className="titlebar-logo"
            width="18"
            height="18"
          />
          <span className="titlebar-title">
            Mower <span className="titlebar-version">4.1.6-alpha.12+0e151ae</span>
            <span className="titlebar-meta"> - 昨日海#1009 · 默认实例@4629 · MuMu12 (MuMu安卓设备) @16384</span>
          </span>
          <span className={`titlebar-status-badge ${isRunning ? 'status-running' : 'status-paused'}`}>
            <span className="status-dot" />
            {isRunning ? '自动化托管中' : '已暂停'}
          </span>
        </div>

        <div className="titlebar-controls">
          <button
            type="button"
            className="titlebar-btn btn-min"
            title="最小化"
            onClick={() => {
              // Fun interactive reaction
              alert('Mower 正在系统托盘后台持续托管您的明日方舟基建，随时为您服务！')
            }}
          >
            <Minus size={13} weight="bold" />
          </button>
          <button
            type="button"
            className="titlebar-btn btn-max"
            title={windowState === 'maximized' ? '还原' : '最大化'}
            onClick={() => setWindowState(windowState === 'maximized' ? 'normal' : 'maximized')}
          >
            <Square size={11} weight="bold" />
          </button>
          <button
            type="button"
            className="titlebar-btn btn-close"
            title="关闭 (保留托盘)"
            onClick={() => {
              alert('Mower 正在全天候保护您的理智，点击主页面【立即停止】可完全休眠。')
            }}
          >
            <X size={13} weight="bold" />
          </button>
        </div>
      </div>

      {/* 2. Client Main Body (Sidebar + Content Workspace) */}
      <div className="mower-body">
        {/* Left Navigation Sidebar */}
        <nav className="mower-sidebar" aria-label="软件功能导航">
          <div className="sidebar-group">
            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'logs' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('logs')}
            >
              <BookOpen size={16} weight={activeTab === 'logs' ? 'fill' : 'regular'} />
              <span>运行日志</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'settings' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Gear size={16} weight={activeTab === 'settings' ? 'fill' : 'regular'} />
              <span className="item-with-arrow">
                全部设置
                <CaretDown size={11} className="nav-caret" />
              </span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'schedule' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('schedule')}
            >
              <CalendarBlank size={16} weight={activeTab === 'schedule' ? 'fill' : 'regular'} />
              <span>排班编辑</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'growth' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('growth')}
            >
              <TrendUp size={16} weight={activeTab === 'growth' ? 'fill' : 'regular'} />
              <span>养成规划</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'charts' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('charts')}
            >
              <ChartBar size={16} weight={activeTab === 'charts' ? 'fill' : 'regular'} />
              <span className="item-with-arrow">
                数据图表
                <CaretDown size={11} className="nav-caret" />
              </span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'skills' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('skills')}
            >
              <Sliders size={16} weight={activeTab === 'skills' ? 'fill' : 'regular'} />
              <span>基建技能</span>
            </button>

            <button
              type="button"
              className={`sidebar-nav-item ${activeTab === 'ai' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('ai')}
            >
              <ChatsCircle size={16} weight={activeTab === 'ai' ? 'fill' : 'regular'} />
              <span className="ai-item-label">
                Mower AI 助手
                <Sparkle size={12} weight="fill" className="ai-sparkle-icon" />
              </span>
            </button>
          </div>

          <div className="sidebar-divider" />

          <div className="sidebar-group secondary-group">
            <a
              href="https://arkmowers.github.io/arknights-mower/"
              target="_blank"
              rel="noreferrer"
              className="sidebar-nav-item external-nav-item"
            >
              <Question size={16} />
              <span>帮助文档</span>
            </a>

            <a
              href="https://github.com/ArkMowers/arknights-mower/releases"
              target="_blank"
              rel="noreferrer"
              className="sidebar-nav-item external-nav-item"
            >
              <Backpack size={16} />
              <span>其他资源</span>
            </a>

            <a
              href="https://prts.wiki/"
              target="_blank"
              rel="noreferrer"
              className="sidebar-nav-item external-nav-item"
            >
              <Wrench size={16} />
              <span>明日方舟工具箱</span>
            </a>
          </div>
        </nav>

        {/* Workspace Content Display */}
        <main className="mower-workspace">
          {/* TAB 1: 运行日志 (The Real Mower Core Experience) */}
          {activeTab === 'logs' && (
            <div className="workspace-logs-view">
              {/* Lumen Artwork Background Layer on the right */}
              <div className="workspace-lumen-bg" aria-hidden="true">
                <img
                  src="/images/mower-lumen-backdrop.webp"
                  alt=""
                  className="lumen-art-img"
                  width="629"
                  height="710"
                />
              </div>

              {/* Functional Interactive Panels */}
              <div className="logs-left-column">
                {/* 1. Android Emulator Screen Preview (Collapsible) */}
                {showPreview && (
                  <div
                    className="emulator-preview-panel"
                    onClick={handleEmulatorClick}
                    title="点击在模拟器中发送触控指令"
                  >
                    <div className="emulator-panel-header">
                      <div className="panel-header-left">
                        <span className="live-pill">LIVE</span>
                        <span className="panel-tag">MuMu12 @16384 · 1280×720</span>
                      </div>
                      <div className="panel-header-right">
                        <span className="ocr-engine-tag">YOLOv8 本地推理 (16ms)</span>
                      </div>
                    </div>

                    <div className="emulator-viewport">
                      <img
                        src="/images/mower-emulator-screen.webp"
                        alt="明日方舟游戏终端运行画面"
                        className="emulator-screen-image"
                        width="512"
                        height="288"
                      />

                      {/* Click Ripple Effect */}
                      {tapRipple && (
                        <span
                          className="emulator-tap-ripple"
                          style={{ left: `${tapRipple.x}px`, top: `${tapRipple.y}px` }}
                        />
                      )}

                      <div className="emulator-hud-bar">
                        <span>理智: 135/135 (满溢保护)</span>
                        <span>赤金订单: 10/10</span>
                        <span>宿舍恢复: 3/4 满员</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Base Scheduling Table (排班流水任务) */}
                <div className="schedule-panel">
                  <div className="schedule-panel-header">
                    <span className="col-head col-time">时间</span>
                    <span className="col-head col-task">任务</span>
                    <span className="col-head col-status">状态</span>
                  </div>

                  <div className="schedule-rows-wrap">
                    {schedule.map((item) => (
                      <div
                        key={item.id}
                        className={`schedule-row ${item.highlight ? 'row-highlight' : ''}`}
                      >
                        <span className="row-time">{item.time}</span>
                        <div className="row-task-desc">
                          <span className="room-label">{item.room}</span>
                          <span className="ops-chain">{item.ops.join(', ')}</span>
                        </div>
                        <span className={`row-tag ${item.highlight ? 'tag-accent' : ''}`}>
                          {item.tag || '计划中'}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Active Sub-table Filter Tags */}
                  <div className="subtables-status-bar">
                    <span className="subtables-lead">当前激活的副表为:</span>
                    {Object.entries(activeSubtables).map(([name, active]) => (
                      <button
                        key={name}
                        type="button"
                        className={`subtable-chip ${active ? 'chip-active' : 'chip-inactive'}`}
                        onClick={() => toggleSubtable(name)}
                        title="点击切换该副表启闭"
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Real-Time Streaming Console Log */}
                <div className="console-panel">
                  <div className="console-panel-header">
                    <div className="console-head-left">
                      <span className="console-title">实时运行日志</span>
                      <span className="console-count">{logs.length} 条记录</span>
                    </div>
                    <div className="console-head-right">
                      <button
                        type="button"
                        className="console-mini-btn"
                        onClick={() => setLogs(INITIAL_LOGS)}
                        title="清空日志屏幕"
                      >
                        <ArrowClockwise size={12} />
                        重置
                      </button>
                    </div>
                  </div>

                  <div className="console-log-scroll" ref={logContainerRef}>
                    {logs.map((log) => (
                      <div key={log.id} className="console-log-line">
                        <span className="log-time">2026-10-15 {log.time}</span>
                        <span className={`log-level level-${log.level.toLowerCase()}`}>
                          {log.level}
                        </span>
                        <span className="log-msg" style={{ color: log.color }}>
                          {log.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom Control Action Bar */}
              <div className="mower-bottom-bar">
                <div className="bottom-bar-left">
                  {/* Start/Stop Button */}
                  <button
                    type="button"
                    className={`mower-ctrl-btn ${isRunning ? 'btn-stop' : 'btn-start'}`}
                    onClick={() => {
                      const next = !isRunning
                      setIsRunning(next)
                      const now = new Date()
                      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
                      setLogs((prev) => [
                        ...prev,
                        {
                          id: `status-${Date.now()}`,
                          time: timeStr,
                          level: next ? 'SUCCESS' : 'WARN',
                          text: next ? '>>> 用户已启动 Mower 自动化托管服务 <<<' : '>>> 用户已触发【立即停止】，Mower 暂停中 <<<',
                          color: next ? '#4ade80' : '#fb7185',
                        },
                      ])
                    }}
                  >
                    {isRunning ? (
                      <>
                        <Stop size={14} weight="fill" />
                        <span>立即停止</span>
                        <CaretDown size={11} className="btn-split-arrow" />
                      </>
                    ) : (
                      <>
                        <Play size={14} weight="fill" />
                        <span>启动运行</span>
                      </>
                    )}
                  </button>

                  <span className={`status-pill ${isRunning ? 'pill-idle' : 'pill-paused'}`}>
                    {isRunning ? '休眠中' : '已暂停'}
                  </span>

                  {/* Add Task Button */}
                  <button
                    type="button"
                    className="mower-ctrl-btn btn-add-task"
                    onClick={() => setShowAddTask(true)}
                  >
                    <Plus size={14} weight="bold" />
                    <span>新增任务</span>
                  </button>

                  {/* Feedback Button */}
                  <a
                    href="https://github.com/ArkMowers/arknights-mower/issues"
                    target="_blank"
                    rel="noreferrer"
                    className="mower-ctrl-btn btn-feedback"
                  >
                    <ChatsCircle size={14} weight="fill" />
                    <span>反馈问题</span>
                  </a>

                  {/* Database Management Button */}
                  <button
                    type="button"
                    className="mower-ctrl-btn btn-database"
                    onClick={() => setShowDbInfo(!showDbInfo)}
                  >
                    <Database size={14} weight="fill" />
                    <span>数据库管理</span>
                  </button>
                </div>

                <div className="bottom-bar-right">
                  {/* Checkbox: Preview Screenshot */}
                  <label className="mower-toggle-label">
                    <input
                      type="checkbox"
                      checked={showPreview}
                      onChange={(e) => setShowPreview(e.target.checked)}
                      className="mower-checkbox"
                    />
                    <span className="checkbox-text">预览截图</span>
                  </label>

                  {/* Switch: Auto Scroll */}
                  <button
                    type="button"
                    className={`mower-switch ${autoScroll ? 'switch-on' : 'switch-off'}`}
                    onClick={() => setAutoScroll(!autoScroll)}
                    aria-label="自动滚动开关"
                  >
                    <span className="switch-thumb" />
                    <span className="switch-text">自动滚动</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 全部设置 (Interactive Settings Simulation) */}
          {activeTab === 'settings' && (
            <div className="workspace-subview settings-view">
              <div className="subview-header">
                <h2>全局配置与策略偏好</h2>
                <p>实时调整 Mower 运行参数，本地零拦截图像识别技术确保安全高效</p>
              </div>

              <div className="settings-grid">
                <div className="settings-card">
                  <div className="card-title">
                    <Gear size={17} />
                    <span>模拟器与连接设置</span>
                  </div>
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="row-name">ADB 连接地址</span>
                      <span className="row-desc">默认端口 16384 (MuMu12 原生支持)</span>
                    </div>
                    <input
                      type="text"
                      defaultValue="127.0.0.1:16384"
                      className="mower-input"
                    />
                  </div>
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="row-name">截图传输模式</span>
                      <span className="row-desc">DroidCast 高速共享内存</span>
                    </div>
                    <select className="mower-select" defaultValue="droidcast">
                      <option value="droidcast">DroidCast 极速模式 (推荐)</option>
                      <option value="adb">原生 ADB Screencap</option>
                      <option value="nemu">MuMu 共享显存模式</option>
                    </select>
                  </div>
                </div>

                <div className="settings-card">
                  <div className="card-title">
                    <CalendarBlank size={17} />
                    <span>基建自动化规则</span>
                  </div>
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="row-name">无人机充能满溢自动消耗</span>
                      <span className="row-desc">优先加速生产赤金或经验作战记录</span>
                    </div>
                    <input type="checkbox" defaultChecked className="mower-checkbox" />
                  </div>
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="row-name">宿舍换班优先回满模式</span>
                      <span className="row-desc">菲亚梅塔精神充能优先给主力制造干员</span>
                    </div>
                    <input type="checkbox" defaultChecked className="mower-checkbox" />
                  </div>
                  <div className="setting-row">
                    <div className="setting-info">
                      <span className="row-name">好友线索自动全送</span>
                      <span className="row-desc">每日自动收送线索，全清信用商店折扣商品</span>
                    </div>
                    <input type="checkbox" defaultChecked className="mower-checkbox" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: 排班编辑 (Interactive Base Shift Planner) */}
          {activeTab === 'schedule' && (
            <div className="workspace-subview schedule-edit-view">
              <div className="subview-header">
                <h2>基建智能排班矩阵</h2>
                <p>预设 243 极限产金、153 纯经验书与 333 综合流，一键套用最优解</p>
              </div>

              <div className="rooms-matrix-grid">
                <div className="room-card card-trading">
                  <div className="room-card-head">
                    <span className="room-badge">贸易站 1 (room_1_1)</span>
                    <span className="room-eff">产物收益 +152%</span>
                  </div>
                  <div className="room-ops-row">
                    <span className="op-chip chip-gold">但书</span>
                    <span className="op-chip chip-gold">龙舌兰</span>
                    <span className="op-chip">孑</span>
                  </div>
                  <span className="room-meta">策略: 赤金高价变现订单流</span>
                </div>

                <div className="room-card card-manufacture">
                  <div className="room-card-head">
                    <span className="room-badge">制造站 1 (room_2_1)</span>
                    <span className="room-eff">效率 +120%</span>
                  </div>
                  <div className="room-ops-row">
                    <span className="op-chip chip-boost">菲亚梅塔 (肥鸭)</span>
                    <span className="op-chip">极境</span>
                    <span className="op-chip">截云</span>
                  </div>
                  <span className="room-meta">策略: 肥鸭精神充能无限轮转</span>
                </div>

                <div className="room-card card-central">
                  <div className="room-card-head">
                    <span className="room-badge">控制中枢 (central)</span>
                    <span className="room-eff">深海羁绊全生效</span>
                  </div>
                  <div className="room-ops-row">
                    <span className="op-chip chip-blue">歌蕾蒂娅</span>
                    <span className="op-chip chip-blue">乌尔比安</span>
                    <span className="op-chip chip-blue">斯卡蒂</span>
                    <span className="op-chip chip-blue">安哲拉</span>
                    <span className="op-chip">阿米娅</span>
                  </div>
                  <span className="room-meta">策略: 全体深海成员心情消耗 -0.5/h</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: 养成规划 (Operator Growth & Sanity Simulator) */}
          {activeTab === 'growth' && (
            <div className="workspace-subview growth-view">
              <div className="subview-header">
                <h2>干员养成与理智规划</h2>
                <p>自动同步 PRTS 数据，精准计算精二 90 级、专精三所需材料与最佳刷图体力</p>
              </div>

              <div className="growth-cards-grid">
                <div className="growth-target-card">
                  <div className="target-top">
                    <span className="target-op-name">维什戴尔 (Wis'adel)</span>
                    <span className="target-progress-tag">专三进行中 (2/3)</span>
                  </div>
                  <div className="progress-bar-wrap">
                    <div className="progress-bar-fill" style={{ width: '78%' }} />
                  </div>
                  <div className="target-materials">
                    <span className="mat-pill mat-ok">聚合剂 4/4</span>
                    <span className="mat-pill mat-ok">D32钢 4/4</span>
                    <span className="mat-pill mat-needed">切削原液 2/6 (缺 4)</span>
                    <span className="mat-pill mat-needed">龙门币 180,000 / 300,000</span>
                  </div>
                  <span className="target-advice">建议刷取: 10-11 (掉落期望综合最高) 或 基建制造站全速合成</span>
                </div>

                <div className="growth-target-card">
                  <div className="target-top">
                    <span className="target-op-name">玛恩纳 (Młynar)</span>
                    <span className="target-progress-tag">精二 90 级 · 已就绪</span>
                  </div>
                  <div className="progress-bar-wrap">
                    <div className="progress-bar-fill" style={{ width: '100%' }} />
                  </div>
                  <div className="target-materials">
                    <span className="mat-pill mat-ok">晶体电子单元 4/4</span>
                    <span className="mat-pill mat-ok">精炼溶剂 6/6</span>
                    <span className="mat-pill mat-ok">龙门币 充足</span>
                  </div>
                  <span className="target-advice">材料已集齐，随时可在游戏内完成晋升</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: 数据图表 (Base Yield Analytics) */}
          {activeTab === 'charts' && (
            <div className="workspace-subview charts-view">
              <div className="subview-header">
                <h2>基建收益与监控看板</h2>
                <p>实时统计近 7 日龙门币收获、无人机消耗速率与干员心情恢复效率</p>
              </div>

              <div className="metrics-strip">
                <div className="metric-box">
                  <span className="metric-title">今日龙门币收获</span>
                  <span className="metric-value">+185,400</span>
                  <span className="metric-change">↑ 较昨日 +14.2%</span>
                </div>
                <div className="metric-box">
                  <span className="metric-title">中级作战记录</span>
                  <span className="metric-value">54 份</span>
                  <span className="metric-change">制造站满载产出</span>
                </div>
                <div className="metric-box">
                  <span className="metric-title">图像识别推理延迟</span>
                  <span className="metric-value">16.4 ms</span>
                  <span className="metric-change">极速纯本地 YOLOv8</span>
                </div>
                <div className="metric-box">
                  <span className="metric-title">无人机充能利用率</span>
                  <span className="metric-value">100%</span>
                  <span className="metric-change">零溢出损耗</span>
                </div>
              </div>

              {/* Chart Visual Simulation */}
              <div className="chart-preview-box">
                <div className="chart-bars-wrap">
                  {[45, 62, 58, 75, 82, 94, 100].map((h, i) => (
                    <div key={i} className="bar-col">
                      <div className="bar-fill" style={{ height: `${h}%` }} />
                      <span className="bar-date">{`10-${8 + i}`}</span>
                    </div>
                  ))}
                </div>
                <span className="chart-caption">近 7 天每日基建产出总产值趋势 (折合龙门币)</span>
              </div>
            </div>
          )}

          {/* TAB 6: 基建技能 (Operator Base Skills) */}
          {activeTab === 'skills' && (
            <div className="workspace-subview skills-view">
              <div className="subview-header">
                <h2>明日方舟干员基建技能库</h2>
                <p>内置全干员基建技能索引，快速检索制造站、贸易站、控制中枢加成</p>
              </div>

              <div className="skills-table-wrap">
                <div className="skill-row head-row">
                  <span>干员</span>
                  <span>设施</span>
                  <span>技能名称</span>
                  <span>加成效果</span>
                </div>
                <div className="skill-row">
                  <span className="skill-op">但书</span>
                  <span className="skill-room">贸易站</span>
                  <span className="skill-name">非商业性采购</span>
                  <span className="skill-eff">订单交付时，龙门币收益增加 +40%</span>
                </div>
                <div className="skill-row">
                  <span className="skill-op">龙舌兰</span>
                  <span className="skill-room">贸易站</span>
                  <span className="skill-name">言语艺术</span>
                  <span className="skill-eff">高品质贵金属订单出现概率提升 +250%</span>
                </div>
                <div className="skill-row">
                  <span className="skill-op">菲亚梅塔</span>
                  <span className="skill-room">宿舍</span>
                  <span className="skill-name">苦难陈述</span>
                  <span className="skill-eff">将自身精神回复完全灌注给心情最低的干员</span>
                </div>
                <div className="skill-row">
                  <span className="skill-op">歌蕾蒂娅</span>
                  <span className="skill-room">控制中枢</span>
                  <span className="skill-name">潮涌漫溢</span>
                  <span className="skill-eff">控制中枢与制造站深海猎人心情消耗降低 -0.5/h</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: Mower AI 助手 */}
          {activeTab === 'ai' && (
            <div className="workspace-subview ai-view">
              <div className="subview-header">
                <h2>Mower 智能排班问答顾问</h2>
                <p>专为明日方舟基建优化的决策助手，为您推荐最佳干员搭配与体力理智分配</p>
              </div>

              <div className="ai-chat-card">
                <div className="ai-message msg-assistant">
                  <div className="ai-avatar">M</div>
                  <div className="ai-bubble">
                    您好！我是 Mower 智能助手。我已经接管了您的基建日常：
                    目前您的 <strong>但书 + 龙舌兰</strong> 极速赤金变现流正在平稳运转中，预计今天将带来 <strong>+185,400 龙门币</strong> 的纯利润。
                    有什么我可以帮您优化的吗？
                  </div>
                </div>

                <div className="ai-quick-prompts">
                  <button
                    type="button"
                    className="ai-prompt-chip"
                    onClick={() => {
                      alert('但书 + 龙舌兰组合核心：依靠龙舌兰拉高订单品质，但书结算增加额外收益，搭配孑快速清空赤金库存。')
                    }}
                  >
                    💡 如何配置但书+龙舌兰赤金流？
                  </button>
                  <button
                    type="button"
                    className="ai-prompt-chip"
                    onClick={() => {
                      alert('深海中枢流：歌蕾蒂娅进驻控制中枢，制造站配置乌尔比安、安哲拉、斯卡蒂，可实现超长待机无需频繁换班。')
                    }}
                  >
                    ⚓ 深海猎人控制中枢减疲劳怎么触发？
                  </button>
                  <button
                    type="button"
                    className="ai-prompt-chip"
                    onClick={() => {
                      alert('当前基建健康度 99.8%，无人机自动消耗率 100%，无心情赤字风险。')
                    }}
                  >
                    📊 诊断当前基建运行效率
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Database Statistics Modal */}
      {showDbInfo && (
        <div className="mower-inline-modal" onClick={() => setShowDbInfo(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>本地 SQLite 运行数据库状态</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowDbInfo(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              <div className="db-stat-item">
                <span className="stat-label">存储路径</span>
                <span className="stat-val font-mono">./data/mower_runtime.sqlite3</span>
              </div>
              <div className="db-stat-item">
                <span className="stat-label">历史排班轮替记录</span>
                <span className="stat-val">38,420 条 (已归档)</span>
              </div>
              <div className="db-stat-item">
                <span className="stat-label">公招出星统计</span>
                <span className="stat-val">6★: 14 次 · 5★: 82 次</span>
              </div>
              <div className="db-stat-item">
                <span className="stat-label">本地文件大小</span>
                <span className="stat-val">4.28 MB (极低磁盘占用)</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddTask && (
        <div className="mower-inline-modal" onClick={() => setShowAddTask(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>新增基建临时调度任务</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowAddTask(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              <label className="form-group">
                <span className="form-label">目标设施</span>
                <select className="mower-select" id="new-task-room">
                  <option value="room_1_1">贸易站 1 (room_1_1)</option>
                  <option value="room_2_1">制造站 1 (room_2_1)</option>
                  <option value="central">控制中枢 (central)</option>
                  <option value="dorm_1">宿舍 1 (dorm_1)</option>
                </select>
              </label>

              <label className="form-group">
                <span className="form-label">指定进驻干员</span>
                <input
                  type="text"
                  defaultValue="菲亚梅塔, 极境"
                  className="mower-input"
                  id="new-task-ops"
                />
              </label>

              <button
                type="button"
                className="mower-submit-btn"
                onClick={() => {
                  const now = new Date()
                  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
                  const newTask: ScheduleItem = {
                    id: `task-${Date.now()}`,
                    time: timeStr,
                    room: '临时加班',
                    ops: ['菲亚梅塔', '极境'],
                    highlight: true,
                    tag: '手动添加',
                  }
                  setSchedule((prev) => [newTask, ...prev])
                  setLogs((prev) => [
                    ...prev,
                    {
                      id: `add-${Date.now()}`,
                      time: `${timeStr},120`,
                      level: 'INFO',
                      text: `[手动加急] 用户已在网页端模拟器插入一条临时任务: room_2_1 (菲亚梅塔, 极境)`,
                      color: '#facc15',
                    },
                  ])
                  setShowAddTask(false)
                }}
              >
                <Check size={14} weight="bold" />
                立即确认插入队列
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
