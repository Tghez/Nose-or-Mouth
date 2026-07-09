interface TitleBarProps {
  onMinimize: () => void
}

export function TitleBar({ onMinimize }: TitleBarProps) {
  return (
    <div id="title-bar">
      <span id="title-bar-name">Mouth Breather</span>
      <div id="title-bar-controls">
        <button
          id="title-btn-min"
          onClick={onMinimize}
          title="Compact view"
        >
          <svg width="12" height="2" viewBox="0 0 12 2" fill="none">
            <line x1="0" y1="1" x2="12" y2="1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        <button
          id="title-btn-close"
          onClick={() => window.electronAPI.quitApp()}
          title="Quit"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
