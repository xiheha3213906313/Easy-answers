import React from 'react';
import { useConfirmStore } from '../store/confirmStore';

const ConfirmHost: React.FC = () => {
  const current = useConfirmStore((state) => state.current);
  const confirm = useConfirmStore((state) => state.confirm);
  const cancel = useConfirmStore((state) => state.cancel);

  if (!current) return null;

  const {
    title = '请确认',
    message,
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true
  } = current.options;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-card">
        <div className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          {showCancel && (
            <button className="btn-secondary" onClick={cancel}>
              {cancelText}
            </button>
          )}
          <button className="btn-primary" onClick={confirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmHost;
