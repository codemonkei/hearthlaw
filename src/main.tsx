import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GameApp } from "@/game/ui/GameApp";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GameApp />
  </StrictMode>,
);
