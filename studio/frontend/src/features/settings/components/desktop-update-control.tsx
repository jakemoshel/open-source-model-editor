// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { Button } from "@/components/ui/button";
import { useTauriUpdateController } from "@/hooks/tauri-update-context";
import { useT } from "@/i18n";
import type { ReactElement } from "react";
import { useState } from "react";
import { SettingsRow } from "./settings-row";

type RepoUpdateStatus = {
  currentCommit: string;
  mainCommit: string;
  commitsBehind: number;
};

type RepoAction =
  | "idle"
  | "checking"
  | "updating"
  | "available"
  | "current"
  | "updated"
  | "error";

function repoUpdateDescription(
  action: RepoAction,
  status: RepoUpdateStatus | null,
  error: string | null,
): string {
  if (error) return error;
  switch (action) {
    case "checking":
      return "Checking the public main branch…";
    case "updating":
      return "Updating and preparing the installer… The app will quit, update in the background, and reopen automatically. See ~/Library/Logs/Jake's Model Trainer/update.log for progress or errors.";
    case "current":
      return `Source is current at ${status?.currentCommit.slice(0, 8)}. Updates are checked only when you ask.`;
    case "available":
      return `${status?.commitsBehind} commit${status?.commitsBehind === 1 ? "" : "s"} available from the public main branch. Updating fast-forwards only and requires a clean checkout.`;
    case "updated":
      return `Source updated to ${status?.currentCommit.slice(0, 8)}. The app will quit and reopen after installation. Progress and errors are saved to ~/Library/Logs/Jake's Model Trainer/update.log. If you canceled quitting, click Install and restart to retry.`;
    default:
      return "Check the public main branch manually. No background or upstream updates are enabled.";
  }
}

function repoUpdateButtonLabel(action: RepoAction): string {
  if (action === "checking") return "Checking…";
  if (action === "updating") return "Updating…";
  if (action === "updated") return "Check again";
  return "Check for updates";
}

function formatDesktopVersion(version: string): string {
  return version.startsWith("v") ? version : `v${version}`;
}

function LocalRepoUpdateControl(): ReactElement {
  const [repoAction, setRepoAction] = useState<RepoAction>("idle");
  const [repoStatus, setRepoStatus] = useState<RepoUpdateStatus | null>(null);
  const [repoError, setRepoError] = useState<string | null>(null);
  const runRepoAction = async (pull: boolean) => {
    setRepoAction(pull ? "updating" : "checking");
    setRepoError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<RepoUpdateStatus>(
        pull ? "update_local_repo" : "check_local_repo_update",
      );
      setRepoStatus(result);
      setRepoAction(
        pull ? "updated" : result.commitsBehind > 0 ? "available" : "current",
      );
    } catch (error) {
      setRepoError(error instanceof Error ? error.message : String(error));
      setRepoAction("error");
    }
  };
  const description = repoUpdateDescription(repoAction, repoStatus, repoError);
  return (
    <SettingsRow
      label="Source updates"
      description={<span aria-live="polite">{description}</span>}
    >
      {repoAction === "available" || repoAction === "updated" || repoAction === "current" ? (
        <Button
          size="sm"
          variant="dark"
          onClick={() => {
            runRepoAction(true);
          }}
        >
          Install and restart
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={repoAction === "checking" || repoAction === "updating"}
          aria-busy={repoAction === "checking" || repoAction === "updating"}
          onClick={() => {
            runRepoAction(false);
          }}
        >
          {repoUpdateButtonLabel(repoAction)}
        </Button>
      )}
    </SettingsRow>
  );
}

export function DesktopUpdateControl(): ReactElement | null {
  const t = useT();
  const update = useTauriUpdateController();
  if (!update) {
    return null;
  }
  if (update.updatePolicyMode === "disabled") {
    return <LocalRepoUpdateControl />;
  }

  const checking = update.status === "checking";
  const inFlight =
    update.status === "updating-backend" ||
    update.status === "downloading" ||
    update.status === "installing";
  const busy = checking || inFlight;
  const available = update.info !== null && !checking;
  const checkFailed = update.checkError !== null && !available;

  let label: string;
  let description: string;
  if (checking) {
    label = t("settings.about.update.desktopChecking");
    description = t("settings.about.update.desktopCheckingDescription");
  } else if (available && update.info) {
    label = t("settings.about.update.desktopAvailable", {
      version: formatDesktopVersion(update.info.version),
    });
    description = update.isExternalServer
      ? t("settings.about.update.desktopExternalServer", {
          port: update.externalServerPort ?? "",
        })
      : update.updatePolicyMode === "manual_linux_package"
        ? t("settings.about.update.desktopManualInstall")
        : t("settings.about.update.desktopAvailableDescription");
  } else if (checkFailed) {
    label = t("settings.about.update.desktopCheckFailed");
    // Keep the raw reason: failures come from the network, HTTP, manifest or updater.
    description = update.checkError ?? label;
  } else if (update.hasChecked) {
    label = t("settings.about.update.desktopCurrent");
    description = t("settings.about.update.desktopCurrentDescription");
  } else {
    label = t("settings.about.update.desktopReady");
    description = t("settings.about.update.desktopReadyDescription");
  }

  const action = available
    ? update.updatePolicyMode === "manual_linux_package"
      ? t("settings.about.update.openReleasePage")
      : t("settings.about.update.updateNow")
    : checkFailed
      ? t("settings.about.update.retryCheck")
      : update.hasChecked
        ? t("settings.about.update.checkAgain")
        : t("settings.about.update.checkForUpdates");

  return (
    <SettingsRow
      label={label}
      description={<span aria-live="polite">{description}</span>}
    >
      {available && update.isExternalServer ? null : (
        <Button
          size="sm"
          variant={available ? "dark" : "outline"}
          disabled={busy}
          aria-busy={busy}
          onClick={() => {
            if (available) {
              void update.installUpdate();
            } else {
              void update.checkForUpdate();
            }
          }}
        >
          {checking ? t("settings.about.update.checking") : action}
        </Button>
      )}
    </SettingsRow>
  );
}
