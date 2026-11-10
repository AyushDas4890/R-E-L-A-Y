import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './styles.css';
import './minimal.css';
import './notion.css';
import './pages.css';
import './db.css';
import './collab.css';
import './help.css';
import './notion-site.css';
import './apple-public.css';
import './apple-app.css';
import './site.css';
import './preview-dark.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
