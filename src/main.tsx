import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { applyDesktopPlatformAttribute } from "./shared/platform/desktopPlatform";
import "./shared/i18n/i18n";
import "./styles/tokens.css";
import "./styles/foundations.css";
import "./styles/global.css";
import "./styles/shell.css";
import "./styles/updater.css";
import "./styles/workspaces/dashboard.css";
import "./styles/workspaces/earth.css";
import "./styles/workspaces/launches.css";
import "./styles/workspaces/missions.css";
import "./styles/workspaces/space-news.css";
import "./styles/workspaces/space-weather.css";

applyDesktopPlatformAttribute();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Orbital Vision root element is missing");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
