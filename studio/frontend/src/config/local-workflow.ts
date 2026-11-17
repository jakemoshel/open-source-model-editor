// This fork is Jake's local Qwen training and chat workspace.
export const LOCAL_QWEN_WORKFLOW = true;
export const LOCAL_QWEN_MODEL = "SiddhJagani/Qwen3.8-4B-mlx-4Bit";

export function localNavigationVisible(id: string): boolean {
  return ["hub", "train", "steering", "export"].includes(id);
}

export function localWorkspaceVisible(id: string): boolean {
  return ["switchToChat", "switchToHub", "switchToTrain", "switchToExport"].includes(id);
}

export function localSettingsVisible(id: string): boolean {
  return ["general", "profile", "resources", "chat", "data", "keyboard-shortcuts", "debugging", "about"].includes(id);
}

export function localRouteAllowed(pathname: string): boolean {
  return !["/images", "/video", "/audio", "/library", "/tasks", "/api-monitor", "/projects", "/data-recipes"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
