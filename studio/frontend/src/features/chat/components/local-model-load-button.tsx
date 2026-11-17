import { LOCAL_QWEN_MODEL } from "@/config/local-workflow";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SelectedModelInput } from "../hooks/use-chat-model-runtime";

export function LocalModelLoadButton({
  busy,
  onLoad,
}: {
  busy: boolean;
  onLoad: (selection: SelectedModelInput) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const loading = busy || pending;

  return (
    <Button
      type="button"
      size="sm"
      variant="primary"
      disabled={loading}
      aria-busy={loading}
      title="Load your downloaded model into memory. Quitting Jake's Model Trainer unloads it."
      onClick={async () => {
        if (loading) return;
        setPending(true);
        try {
          await onLoad({
            id: LOCAL_QWEN_MODEL,
            isDownloaded: true,
            forceReload: true,
          });
        } finally {
          setPending(false);
        }
      }}
    >
      {loading ? "Loading model…" : "Load Qwen 3.8 4B"}
    </Button>
  );
}
