// Cascade layer order first, before any module (App, AstryxRoot) pulls in Astryx CSS that would declare its own order.
import './layers.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { AstryxRoot } from './astryxRoot.tsx';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import './styles.css';
import './apple-shell.css';
import './pages.css';
import './db.css';
import './collab.css';
import './help.css';
import './apple-public.css';
import './apple-app.css';
import './site.css';
import './preview-dark.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AstryxRoot>
        <App />
      </AstryxRoot>
    </ErrorBoundary>
  </StrictMode>,
);
