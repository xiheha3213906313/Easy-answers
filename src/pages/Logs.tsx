import React from 'react';
import { Link } from 'react-router-dom';
import { useLogStore } from '../store/logStore';
import { useSettingsStore } from '../store/settingsStore';
import { alertDialog } from '../store/confirmStore';

const Logs: React.FC = () => {
  const { logs, clearLogs } = useLogStore();
  const { showDebugButton, setShowDebugButton } = useSettingsStore();

  const handleCopy = async () => {
    const text = logs
      .map((log) => `[${log.time}] ${log.level.toUpperCase()} ${log.message}\n${log.stack || ''}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text || '无日志');
      void alertDialog('已复制日志', { title: '复制成功', confirmText: '知道了' });
    } catch {
      void alertDialog('复制失败，请手动选择', { title: '复制失败', confirmText: '我知道了' });
    }
  };

  return (
    <div className="page-container">
      <div className="w-full max-w-4xl mx-auto box-border px-1 sm:px-0">
        <div className="mb-3 sm:mb-4 flex items-center justify-between">
          <Link to="/settings" className="btn-back">
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            返回设置
          </Link>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={handleCopy}>复制</button>
            <button className="btn-secondary" onClick={clearLogs}>清空</button>
          </div>
        </div>

        <h1 className="title-primary mb-3">运行日志</h1>

        {logs.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-500">暂无日志</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="card">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`badge ${log.level === 'error' ? 'bg-red-100 text-red-800' : 'badge-info'}`}>
                    {log.level.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-500">{new Date(log.time).toLocaleString()}</span>
                </div>
                <div className="text-sm text-gray-800 mb-1 break-words">{log.message}</div>
                {log.source && <div className="text-xs text-gray-500">来源: {log.source}</div>}
                {log.stack && (
                  <pre className="bg-gray-50 p-2 rounded text-xs whitespace-pre-wrap mt-2">{log.stack}</pre>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="settings-section mt-3">
          <div className="settings-row">
            <div>
              <div className="settings-title">调试按钮</div>
              <div className="settings-sub">控制屏幕悬浮调试入口的显示</div>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={showDebugButton}
                onChange={(e) => setShowDebugButton(e.target.checked)}
              />
              <span className="slider" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Logs;
