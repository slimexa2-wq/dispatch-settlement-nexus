import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import { SessionProvider } from './app/session';
import './styles/global.css';
import './styles/app.css';
import './styles/personal.css';
import './styles/internal.css';
import './styles/supplier.css';
import './styles/ai-assistant.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false }, mutations: { retry: false } }
});

// 开发演示必须始终读取当前业务数据；清理历史版本遗留的 Service Worker/API 缓存。
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) =>
    Promise.all(registrations.map((registration) => registration.unregister()))
  );
  if ('caches' in window) {
    void caches.keys().then((keys) => Promise.all(keys.filter((key) => key.includes('xiangneng')).map((key) => caches.delete(key))));
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.VITE_ROUTER_BASENAME || undefined}>
        <SessionProvider><App /></SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
