// Presentation only: keep the original model IDs and paths for loading and training.
export function localModelLabel(id: string, name = id): string {
  const generated = name.match(/(?:^|\/)SiddhJagani_Qwen3\.8-4B-mlx-4Bit_(\d{10})(?:\/|$)/);
  if (generated) {
    const date = new Date(Number(generated[1]) * 1000);
    return `Qwen run · ${date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })}`;
  }
  if (id === "SiddhJagani/Qwen3.8-4B-mlx-4Bit" || name === "Qwen3.8-4B-mlx-4Bit") return "Qwen 3.8 4B";
  return name;
}

export function localModelRole(id: string): string {
  return id.includes("/outputs/") ? "Training output" : id.includes("/exports/") ? "Exported model" : (id === "SiddhJagani/Qwen3.8-4B-mlx-4Bit" || id.includes("models--SiddhJagani--Qwen3.8-4B-mlx-4Bit/")) ? "Base model · MLX 4-bit" : "Local model";
}
