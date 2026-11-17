import { Button } from "@/components/ui/button";
import { LOCAL_QWEN_MODEL } from "@/config/local-workflow";
import { localModelLabel } from "@/config/local-model-label";
import { loraOptionLabel } from "./row-meta";
import type { LoraModelOption, ModelSelectorChangeMeta } from "./types";

export function localQwenChoices(adapters: LoraModelOption[]) {
  const seen = new Set([LOCAL_QWEN_MODEL]);
  return [
    { id: LOCAL_QWEN_MODEL, name: "Qwen 3.8 4B", description: "Base model · MLX 4-bit", meta: { source: "hub", isLora: false, isDownloaded: true } as ModelSelectorChangeMeta },
    ...adapters.filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    }).map((model) => ({
      id: model.id,
      name: localModelLabel(model.id, loraOptionLabel(model)),
      description: model.exportType === "merged" ? "Trained model" : model.exportType === "gguf" ? "GGUF export" : model.source === "local" ? "Local model" : "Trained adapter",
      meta: {
        source: model.source === "local" ? "local" : model.source === "exported" ? "exported" : "lora",
        isLora: model.source !== "local" && model.exportType !== "merged" && model.exportType !== "gguf",
        isDownloaded: true,
        isGguf: model.isDirectGguf === true || model.exportType === "gguf",
      } as ModelSelectorChangeMeta,
    })),
  ];
}

export function LocalQwenPicker({ adapters, value, loaded, busy, onSelect, onConfigure, onUnload, onBrowse }: {
  adapters: LoraModelOption[];
  value?: string;
  loaded?: boolean;
  busy?: boolean;
  onSelect: (id: string, meta: ModelSelectorChangeMeta) => void;
  onConfigure: (id: string, meta: ModelSelectorChangeMeta) => void;
  onUnload?: () => void;
  onBrowse?: () => void;
}) {
  return (
    <div className="pr-2 pb-3">
      <p className="px-2 pb-2 text-sm font-medium">Qwen and your trained models</p>
      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {localQwenChoices(adapters).map((model) => (
          <div key={model.id} className="flex items-center gap-2 rounded-lg hover:bg-muted">
            <button type="button" disabled={busy} onClick={() => onSelect(model.id, model.meta)}
              aria-label={`Load ${model.name}`} aria-current={value === model.id || undefined}
              className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              <span className="block truncate text-sm font-medium" title={model.name}>{model.name}</span>
              <span className="block text-xs text-muted-foreground">{value === model.id && loaded ? "Loaded in memory" : model.description}</span>
            </button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={`Load settings for ${model.name}`} onClick={() => onConfigure(model.id, model.meta)}>Settings</Button>
          </div>
        ))}
      </div>
      {busy && <p role="status" className="px-2 py-2 text-sm text-muted-foreground">Loading model…</p>}
      <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
        {loaded && onUnload && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onUnload}>Unload model</Button>}
        {onBrowse && <Button type="button" variant="ghost" size="sm" onClick={onBrowse}>Model files</Button>}
      </div>
    </div>
  );
}
