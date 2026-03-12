import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { useLogStore } from './store/logStore';

const initVConsole = async () => {
  const VConsole = await import('vconsole');
  new VConsole.default({
    defaultPlugins: ['system', 'network', 'element', 'storage'],
    target: '#root',
  });
  
  setTimeout(() => {
    const tabList = document.querySelectorAll('.vc-tabbar-item');
    const tabNames: Record<string, string> = {
      'Log': '日志',
      'System': '系统',
      'Network': '网络',
      'Element': '元素',
      'Storage': '存储',
    };
    
    tabList.forEach((tab) => {
      const text = tab.textContent || '';
      if (tabNames[text]) {
        tab.textContent = tabNames[text];
      }
    });
    
    const switchBtn = document.querySelector('.vc-switch');
    if (switchBtn) {
      switchBtn.textContent = '调试';
    }
    
    console.log('vConsole 已初始化');
  }, 100);
};

initVConsole();

const logStore = useLogStore.getState();
window.addEventListener('error', (event) => {
  const error = event.error as Error | undefined;
  logStore.addLog({
    level: 'error',
    message: event.message || 'Unknown error',
    stack: error?.stack,
    source: event.filename
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as Error | string;
  logStore.addLog({
    level: 'error',
    message: typeof reason === 'string' ? reason : reason?.message || 'Unhandled rejection',
    stack: typeof reason === 'string' ? undefined : reason?.stack,
    source: 'unhandledrejection'
  });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
