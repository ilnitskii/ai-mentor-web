import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./app/App";
import { registerServiceWorker } from "./app/registerServiceWorker";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

registerServiceWorker();
