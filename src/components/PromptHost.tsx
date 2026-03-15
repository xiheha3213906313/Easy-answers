import React, { useEffect, useMemo, useState } from 'react';
import { usePromptStore } from '../store/promptStore';

const PromptHost: React.FC = () => {
  const current = usePromptStore((state) => state.current);
  const confirm = usePromptStore((state) => state.confirm);
  const cancel = usePromptStore((state) => state.cancel);
  const [value, setValue] = useState('');

  const resetKey = useMemo(() => current?.id ?? '', [current?.id]);

  useEffect(() => {
    setValue('');
  }, [resetKey]);

  if (!current) return null;

  const {
    title = '请输入',
    message,
    confirmText = '确定',
    cancelText = '取消',
    placeholder = '',
    inputType = 'text'
  } = current.options;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true">
      <div className="confirm-card">
        <div className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>
        <input
          key={resetKey}
          type={inputType}
          className="input-styled mt-3"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <div className="confirm-actions">
          <button className="btn-secondary" onClick={cancel}>
            {cancelText}
          </button>
          <button className="btn-primary" onClick={() => confirm(value)}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PromptHost;
