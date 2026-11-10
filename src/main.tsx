import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// fonts ship with the app: no third-party requests, and they work offline
import '@fontsource-variable/bodoni-moda/opsz.css';
import '@fontsource-variable/bodoni-moda/opsz-italic.css';
import '@fontsource-variable/schibsted-grotesk/index.css';
import '@fontsource-variable/martian-mono/standard.css';
import './index.css';
import { bootCloud } from './account';
import { bootInstall } from './install';

bootInstall();
bootCloud();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
