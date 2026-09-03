import "./styles/app.css";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { applyDesktopPlatformAttribute } from "./shared/platform/desktopPlatform";
import "./shared/i18n/i18n";

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
