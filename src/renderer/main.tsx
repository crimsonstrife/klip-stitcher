import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Web Awesome — base styles + default theme (umbrella import)
import '@awesome.me/webawesome/dist/styles/webawesome.css';

// Font Awesome — register the icons used in the app for tree-shaking
import { library } from '@fortawesome/fontawesome-svg-core';
import {
  faCheck,
  faFilm,
  faFolder,
  faFolderOpen,
  faPlay,
  faSpinner,
  faStop,
  faTriangleExclamation,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

library.add(
  faCheck,
  faFilm,
  faFolder,
  faFolderOpen,
  faPlay,
  faSpinner,
  faStop,
  faTriangleExclamation,
  faXmark,
);

import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root not found in index.html');

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
