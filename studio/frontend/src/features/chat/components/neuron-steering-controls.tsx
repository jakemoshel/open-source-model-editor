import { Button } from "@/components/ui/button";
import { NumericValueInput } from "@/features/model-picker/components/numeric-value-input";
import { Link } from "@tanstack/react-router";
import { type ChangeEvent, useState } from "react";
import {
  type SearchedNeuron,
  learnSteeringVector,
  searchSteeringNeurons,
} from "../lib/activation-steering-api";
import { parseSavedSteeringVector } from "../lib/activation-steering-vector";
import { useChatRuntimeStore } from "../stores/chat-runtime-store";
import { useNeuronSteeringAuditStore } from "../stores/neuron-steering-audit-store";

type Steering = NonNullable<
  ReturnType<typeof useChatRuntimeStore.getState>["params"]["neuronSteering"]
>;

const QWEN35_PRESETS = [
  {
    label: "strongest screened candidate",
    coordinates: [{ layer: 16, neuron: 8927, dose: 1 }],
  },
  {
    label: "alternate, layer 14",
    coordinates: [{ layer: 14, neuron: 8906, dose: 1 }],
  },
  {
    label: "alternate, layer 14, reverse sign",
    coordinates: [{ layer: 14, neuron: 8201, dose: -1 }],
  },
  {
    label: "alternate, layer 16, reverse sign",
    coordinates: [{ layer: 16, neuron: 6916, dose: -1 }],
  },
] as const;

function exampleLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isQwen35FourB(value: string) {
  return /qwen354b(?!\d)/i.test(value.replace(/[^a-z0-9]/gi, ""));
}

export function NeuronSteeringControls({
  disabled = false,
}: { disabled?: boolean }) {
  const params = useChatRuntimeStore((s) => s.params);
  const activeModelName = useChatRuntimeStore(
    (s) =>
      s.models.find((model) => model.id === s.params.checkpoint)?.name ?? "",
  );
  const [positive, setPositive] = useState("");
  const [negative, setNegative] = useState("");
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchedNeuron[]>([]);
  const [resultExamples, setResultExamples] = useState<{
    positive: string[];
    negative: string[];
  }>({ positive: [], negative: [] });
  const [resultsModel, setResultsModel] = useState("");
  const [resultsLayer, setResultsLayer] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [recipeName, setRecipeName] = useState("My steering recipe");
  const steering: Steering =
    params.neuronSteering?.modelId === params.checkpoint
      ? params.neuronSteering
      : { modelId: params.checkpoint, layer: 0, neuron: 0, offset: 0 };
  const qwen35FourB =
    isQwen35FourB(params.checkpoint) || isQwen35FourB(activeModelName);
  const update = (change: Partial<Steering>) => {
    // Session-only experiment: never write steering into saved sampling or model defaults.
    const live = useChatRuntimeStore.getState().params;
    useChatRuntimeStore.setState({
      params: { ...live, neuronSteering: { ...steering, ...change } },
    });
  };
  const learn = async () => {
    const positiveExamples = exampleLines(positive);
    const negativeExamples = exampleLines(negative);
    if (!positiveExamples.length || !negativeExamples.length) {
      setMessage("Add at least one example in each box.");
      return;
    }
    setBusy(true);
    setMessage("Comparing example activations…");
    try {
      const result = await learnSteeringVector({
        layer: steering.layer,
        positiveExamples,
        negativeExamples,
      });
      update({
        modelId: params.checkpoint,
        vector: result.vector,
        coordinates: undefined,
        scale: 1,
        offset: 0,
        neuron: 0,
      });
      setMessage(
        `Learned a ${result.vector.length}-value direction for this model. It is on for the next reply.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not learn a steering vector.",
      );
    } finally {
      setBusy(false);
    }
  };
  const search = async () => {
    const positiveExamples = exampleLines(positive);
    const negativeExamples = exampleLines(negative);
    if (!positiveExamples.length || !negativeExamples.length) {
      setMessage("Add desired and contrast examples before searching.");
      return;
    }
    setSearching(true);
    setMessage("Measuring neuron activations on this model…");
    try {
      const found = await searchSteeringNeurons({
        layer: steering.layer,
        positiveExamples,
        negativeExamples,
      });
      setResults(found);
      setResultsModel(params.checkpoint);
      setResultExamples({
        positive: positiveExamples,
        negative: negativeExamples,
      });
      setResultsLayer(steering.layer);
      setMessage(
        "Ranked by absolute activation difference. Select neurons to add them to your steering recipe.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not search neurons.",
      );
    } finally {
      setSearching(false);
    }
  };
  const addCoordinate = (
    neuron: number,
    dose = 1,
    targetLayer = steering.layer,
  ) => {
    const current = steering.coordinates ?? [];
    const found = current.findIndex(
      (item) => item.layer === targetLayer && item.neuron === neuron,
    );
    const next = current.slice();
    const coordinate = { layer: targetLayer, neuron, dose };
    if (found >= 0) next[found] = coordinate;
    else next.push(coordinate);
    update({ vector: undefined, coordinates: next, offset: 0 });
  };
  const importVector = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    try {
      if (file.size > 2_000_000)
        throw new Error("Vector files must be smaller than 2 MB.");
      const saved = parseSavedSteeringVector(
        await file.text(),
        params.checkpoint,
      );
      update({
        modelId: params.checkpoint,
        layer: saved.layer,
        vector: saved.vector,
        coordinates: undefined,
        scale: 1,
        offset: 0,
        neuron: 0,
      });
      setMessage("Saved steering vector loaded. It is on for the next reply.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not read that vector file.",
      );
    }
  };
  const saveVector = () => {
    if (!steering.vector) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 1,
            // biome-ignore lint/style/useNamingConvention: persisted JSON uses the backend wire field.
            model_id: params.checkpoint,
            layer: steering.layer,
            method: "contrastive_activation_addition",
            vector: steering.vector,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "activation-steering-vector.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const saveRecipe = () => {
    try {
      useNeuronSteeringAuditStore.getState().saveRecipe(recipeName, steering);
      setMessage(`Saved “${recipeName.trim()}” to the audit log.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not save recipe.",
      );
    }
  };
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        Choose one coordinate to edit, or add MLP neurons to a recipe. Layer = a
        processing block. Neuron = a signal inside that block. L14 N8949 means
        neuron 8949 inside layer 14, both numbered from zero. Changes affect
        replies while enabled. They do not train or modify model weights.
        Results are experimental and may make replies worse.
      </p>
      <section
        aria-labelledby="steering-coordinate-title"
        className="flex flex-col gap-3"
      >
        <div>
          <h3
            id="steering-coordinate-title"
            className="font-medium text-foreground"
          >
            Choose a layer
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            MLP neurons enter down_proj. Residual coordinates leave the whole
            layer. Their numbers refer to different vectors.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <span title="Chooses the model layer where the activation change is applied. Layers start at 0; not every model has the same number of layers.">
            Layer (numbered from 0)
          </span>
          <NumericValueInput
            ariaLabel="Layer index (0-based)"
            className="panel-field h-11 w-full max-sm:text-base"
            fixedWidth={true}
            value={steering.layer}
            min={0}
            step={1}
            disabled={disabled}
            onChange={(layer) => {
              if (Number.isSafeInteger(layer) && layer >= 0) update({ layer });
            }}
          />
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={disabled || !qwen35FourB}
          title="Loads the two coordinates from the linked Qwen 3.5 4B experiment. This is only a starting point; it may not transfer to other models."
          onClick={() =>
            update({
              vector: undefined,
              offset: 0,
              coordinates: [
                { layer: 14, neuron: 8949, dose: 1 },
                { layer: 13, neuron: 7956, dose: -1 },
              ],
            })
          }
        >
          Load Qwen3.5-4B: L14 N8949 +1, L13 N7956 −1
        </Button>
        {!qwen35FourB && (
          <p className="text-xs text-muted-foreground">
            The published indices are for Qwen3.5-4B. Select that model to load
            its presets; neuron indices do not transfer reliably between models.
          </p>
        )}
        {qwen35FourB && (
          <details className="border-y border-border/70 py-3">
            <summary className="cursor-pointer font-medium">
              Other screened Qwen3.5-4B neurons
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              These were short-screened on three prompts, not independently
              validated. Test them at your own risk.{" "}
              <a
                className="underline underline-offset-2"
                href="https://github.com/occcat/qwen35-evil-neuron"
                target="_blank"
                rel="noreferrer"
              >
                Read the sweep and its limits
              </a>
              .
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {QWEN35_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  className="min-h-11 justify-start"
                  disabled={disabled}
                  onClick={() =>
                    update({
                      vector: undefined,
                      offset: 0,
                      coordinates: preset.coordinates.map((item) => ({
                        ...item,
                      })),
                    })
                  }
                >
                  L{preset.coordinates[0].layer} · N
                  {preset.coordinates[0].neuron} ·{" "}
                  {preset.coordinates[0].dose > 0 ? "+" : ""}
                  {preset.coordinates[0].dose} · {preset.label}
                </Button>
              ))}
            </div>
          </details>
        )}
      </section>
      <section className="flex flex-col gap-2" aria-label="Add an MLP neuron">
        <p className="text-xs text-muted-foreground">
          To add one, choose a layer above, enter its neuron number, then press
          Add neuron. In the recipe below, − subtracts and + adds; Remove
          deletes that neuron.
        </p>
        <label className="flex flex-col gap-1">
          MLP neuron index (0-based)
          <NumericValueInput
            ariaLabel="MLP neuron index (0-based)"
            className="panel-field h-11 w-full"
            fixedWidth={true}
            value={steering.neuron}
            min={0}
            step={1}
            disabled={disabled}
            onChange={(neuron) => {
              if (Number.isSafeInteger(neuron) && neuron >= 0)
                update({ neuron });
            }}
          />
        </label>
        <Button
          variant="outline"
          disabled={disabled || (steering.coordinates?.length ?? 0) >= 32}
          title={`Add neuron ${steering.neuron} at layer ${steering.layer} to the recipe.`}
          onClick={() => addCoordinate(steering.neuron)}
        >
          Add neuron · L{steering.layer}, N{steering.neuron}
        </Button>
        {(steering.coordinates?.length ?? 0) >= 32 && (
          <p>Recipe limit: 32 neurons. Remove one to add another.</p>
        )}
      </section>
      <details
        data-tour="neuron-steering-vector"
        className="border-y border-border/70 py-3"
      >
        <summary className="cursor-pointer font-medium">
          Inspect neurons with example prompts
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-muted-foreground">
            Put one short prompt per line. Positive examples should show the
            behavior you want more of; negative examples should show the
            contrast. The app compares average activations for these prompts at
            the selected layer. Start with a few clear contrasts.
          </p>
          <label
            className="flex flex-col gap-1"
            title="Prompts showing the style or behavior you want the model to lean toward. Use one short prompt per line."
          >
            Desired behavior
            <textarea
              className="panel-field min-h-20 w-full max-sm:text-base"
              value={positive}
              onChange={(e) => setPositive(e.target.value)}
              placeholder="one example prompt per line"
            />
          </label>
          <label
            className="flex flex-col gap-1"
            title="Contrasting prompts show what you want less of. Use one short prompt per line, paired in spirit with the desired examples."
          >
            Contrast behavior
            <textarea
              className="panel-field min-h-20 w-full max-sm:text-base"
              value={negative}
              onChange={(e) => setNegative(e.target.value)}
              placeholder="one contrasting prompt per line"
            />
          </label>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={disabled || busy || !params.checkpoint}
            title="Compares average activations for both example sets and creates a model-specific direction for the next reply. This does not fine-tune the model."
            onClick={learn}
          >
            {busy ? "Learning…" : "Learn steering vector"}
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={disabled || searching || !params.checkpoint}
            onClick={search}
          >
            {searching ? "Searching…" : "Search neurons"}
          </Button>
          <p className="text-muted-foreground">
            Neurons contain weights, not readable text or a stored personality.
            Search shows their mean signal for each prompt, excluding the first
            token. This measures what activates them, not a proven meaning.
          </p>
          {results.length > 0 && resultsModel === params.checkpoint && (
            <div
              className="flex flex-col gap-1"
              aria-label="Neuron search results"
            >
              {results.map(
                ({
                  neuron,
                  score,
                  positiveActivations,
                  negativeActivations,
                }) => {
                  const added = steering.coordinates?.some(
                    (item) =>
                      item.layer === resultsLayer && item.neuron === neuron,
                  );
                  return (
                    <details key={neuron} className="border-b py-2">
                      <summary className="cursor-pointer">
                        Layer {resultsLayer} · neuron {neuron} · contrast{" "}
                        {score.toPrecision(3)}
                      </summary>
                      <div className="mt-2 space-y-1">
                        {[
                          ...positiveActivations.map((value, i) => ({
                            value,
                            prompt: resultExamples.positive[i],
                            group: "Desired",
                          })),
                          ...negativeActivations.map((value, i) => ({
                            value,
                            prompt: resultExamples.negative[i],
                            group: "Contrast",
                          })),
                        ].map((sample, i) => (
                          <p key={i} className="break-words">
                            {sample.group}: {sample.prompt} · mean activation{" "}
                            {sample.value.toPrecision(4)}
                          </p>
                        ))}
                        <button
                          type="button"
                          disabled={
                            disabled ||
                            (!added &&
                              (steering.coordinates?.length ?? 0) >= 32)
                          }
                          className="flex min-h-10 justify-between rounded border px-3 text-left hover:bg-muted/60"
                          onClick={() =>
                            addCoordinate(
                              neuron,
                              score < 0 ? -1 : 1,
                              resultsLayer ?? steering.layer,
                            )
                          }
                        >
                          <span>
                            L{resultsLayer} · neuron {neuron}
                            {added ? " · added" : ""}
                          </span>
                          <span>
                            contrast {score >= 0 ? "+" : ""}
                            {score.toPrecision(3)}
                          </span>
                        </button>
                      </div>
                    </details>
                  );
                },
              )}
            </div>
          )}
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <label
          title="Load a previously saved activation direction. It must match the currently selected model."
          className="flex min-h-11 cursor-pointer items-center rounded-md border px-3 font-medium hover:bg-muted/60 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
        >
          Load saved vector
          <input
            className="sr-only"
            type="file"
            accept="application/json,.json"
            disabled={disabled}
            onChange={importVector}
          />
        </label>
        {steering.vector && (
          <Button
            title="Download this learned direction as a JSON file for later use with the same model."
            variant="outline"
            className="min-h-11"
            disabled={disabled}
            onClick={saveVector}
          >
            Save vector
          </Button>
        )}
        {steering.vector && (
          <Button
            variant="outline"
            className="min-h-11"
            disabled={disabled}
            title="Remove the loaded direction and return to editing one coordinate with a neuron index and offset."
            onClick={() => update({ vector: undefined, scale: 1 })}
          >
            Use coordinate instead
          </Button>
        )}
      </div>
      {steering.vector ? (
        <>
          <p className="text-muted-foreground">
            A {steering.vector.length}-value vector is loaded for layer{" "}
            {steering.layer}. Saved vectors are model-specific.
          </p>
          <label
            htmlFor="neuron-steering-scale"
            className="flex flex-col gap-1"
          >
            <span title="Scales the learned multi-coordinate direction. Positive and negative values move in opposite directions; 0 disables it.">
              Vector strength (−10 to +10)
            </span>
            <NumericValueInput
              ariaLabel="Vector strength (−10 to +10)"
              className="panel-field h-11 w-full max-sm:text-base"
              fixedWidth={true}
              value={steering.scale ?? 1}
              min={-10}
              max={10}
              step={0.1}
              disabled={disabled}
              onChange={(scale) => update({ scale })}
            />
          </label>
        </>
      ) : steering.coordinates?.length ? (
        <section
          aria-label="Down projection steering recipe"
          className="flex flex-col gap-2 rounded-md border p-3"
        >
          <p className="font-medium">
            down_proj recipe · {steering.coordinates.length} neuron(s)
          </p>
          <p className="text-xs text-muted-foreground">
            Each dose is scaled by the selected down_proj weight-column norm and
            residual norm sampled at the layer input. This approximates the
            linked post's scale; it is experimental and may not transfer to
            other models.
          </p>
          {steering.coordinates.map((item, index) => (
            <div
              key={index}
              className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span>Layer</span>
                <NumericValueInput
                  ariaLabel={`Layer for neuron ${item.neuron}`}
                  className="panel-field h-10 w-full"
                  fixedWidth={true}
                  value={item.layer}
                  min={0}
                  step={1}
                  disabled={disabled}
                  onChange={(layer) => {
                    if (Number.isSafeInteger(layer) && layer >= 0)
                      update({
                        coordinates: steering.coordinates?.map((coord) =>
                          coord === item ? { ...coord, layer } : coord,
                        ),
                      });
                  }}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span>Neuron</span>
                <NumericValueInput
                  ariaLabel={`Neuron at layer ${item.layer}`}
                  className="panel-field h-10 w-full"
                  fixedWidth={true}
                  value={item.neuron}
                  min={0}
                  step={1}
                  disabled={disabled}
                  onChange={(neuron) => {
                    if (Number.isSafeInteger(neuron) && neuron >= 0)
                      update({
                        coordinates: steering.coordinates?.map((coord) =>
                          coord === item ? { ...coord, neuron } : coord,
                        ),
                      });
                  }}
                />
              </div>
              <label className="flex min-w-0 flex-col gap-1">
                <span title="Positive adds this neuron's signal; negative subtracts it. Zero turns this neuron off.">
                  Dose (+ adds, − subtracts)
                </span>
                <div className="flex min-w-0 gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10 min-w-10 px-2"
                    aria-label={`Decrease dose for layer ${item.layer} neuron ${item.neuron}`}
                    title="Decrease dose. Negative values subtract this neuron's signal."
                    disabled={disabled || item.dose <= -10}
                    onClick={() =>
                      update({
                        coordinates: steering.coordinates?.map((coord) =>
                          coord === item
                            ? {
                                ...coord,
                                dose: Math.max(
                                  -10,
                                  Number((coord.dose - 0.1).toFixed(1)),
                                ),
                              }
                            : coord,
                        ),
                      })
                    }
                  >
                    −
                  </Button>
                  <NumericValueInput
                    ariaLabel={`Dose for layer ${item.layer} neuron ${item.neuron}`}
                    className="panel-field h-10 min-w-0 w-full"
                    fixedWidth={true}
                    value={item.dose}
                    min={-10}
                    max={10}
                    step={0.1}
                    disabled={disabled}
                    onChange={(dose) =>
                      update({
                        coordinates: steering.coordinates?.map((coord) =>
                          coord === item ? { ...coord, dose } : coord,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-10 min-w-10 px-2"
                    aria-label={`Increase dose for layer ${item.layer} neuron ${item.neuron}`}
                    title="Increase dose. Positive values add this neuron's signal."
                    disabled={disabled || item.dose >= 10}
                    onClick={() =>
                      update({
                        coordinates: steering.coordinates?.map((coord) =>
                          coord === item
                            ? {
                                ...coord,
                                dose: Math.min(
                                  10,
                                  Number((coord.dose + 0.1).toFixed(1)),
                                ),
                              }
                            : coord,
                        ),
                      })
                    }
                  >
                    +
                  </Button>
                </div>
              </label>
              <Button
                variant="outline"
                className="min-h-10 px-2"
                aria-label={`Remove layer ${item.layer} neuron ${item.neuron}`}
                title="Remove this neuron from the recipe."
                disabled={disabled}
                onClick={() =>
                  update({
                    offset: 0,
                    coordinates: steering.coordinates?.filter(
                      (coord) => coord !== item,
                    ),
                  })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => update({ coordinates: [], offset: 0 })}
          >
            Clear recipe
          </Button>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span title="Selects one coordinate in the chosen layer. Coordinates are not usually individually labeled with a human-readable meaning.">
                Residual coordinate (0-based)
              </span>
              <NumericValueInput
                ariaLabel="Residual coordinate (0-based)"
                className="panel-field h-11 w-full max-sm:text-base"
                fixedWidth={true}
                value={steering.neuron}
                min={0}
                step={1}
                disabled={disabled}
                onChange={(neuron) => {
                  if (Number.isSafeInteger(neuron) && neuron >= 0)
                    update({ neuron });
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span title="The amount added to this activation coordinate. Positive adds, negative subtracts, and 0 leaves it unchanged; these values are experimental, not percentages.">
                Activation offset (−100 to +100)
              </span>
              <NumericValueInput
                ariaLabel="Activation offset (−100 to +100)"
                className="panel-field h-11 w-full max-sm:text-base"
                fixedWidth={true}
                value={steering.offset}
                min={-100}
                max={100}
                step={1}
                disabled={disabled}
                onChange={(offset) => update({ offset })}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <Button
              title="Subtract 1 from the selected coordinate's offset."
              variant="outline"
              className="min-h-11 flex-1"
              disabled={disabled}
              onClick={() =>
                update({ offset: Math.max(-100, steering.offset - 1) })
              }
            >
              −1
            </Button>
            <Button
              title="Add 1 to the selected coordinate's offset."
              variant="outline"
              className="min-h-11 flex-1"
              disabled={disabled}
              onClick={() =>
                update({ offset: Math.min(100, steering.offset + 1) })
              }
            >
              +1
            </Button>
            <Button
              title="Set the coordinate offset to 0, turning this edit off."
              variant="outline"
              className="min-h-11 flex-1"
              disabled={disabled}
              onClick={() => update({ offset: 0 })}
            >
              Reset
            </Button>
          </div>
        </>
      )}
      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div>
          <h3 className="font-medium text-foreground">Save your changes</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Finish editing above, then save a named version. Saving makes the
            steering easy to restore in chat; it does not fine-tune model
            weights.
          </p>
        </div>
        <label className="flex flex-col gap-1">
          Recipe name
          <input
            className="panel-field h-11 w-full rounded-md border px-3"
            value={recipeName}
            maxLength={80}
            disabled={disabled}
            onChange={(event) => setRecipeName(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" disabled={disabled} onClick={saveRecipe}>
            Save recipe
          </Button>
          <Button asChild={true} variant="outline" className="min-h-11">
            <Link to="/neuron-steering-audit">Open audit log</Link>
          </Button>
          <Button asChild={true} variant="outline" className="min-h-11">
            <Link to="/studio">Train a model</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          For lasting learned behavior, train with example conversations.
          Training creates a separate adapter; the original model stays intact.
          Load the trained adapter from Chat when training finishes.
        </p>
      </section>
      <output aria-live="polite" className="text-muted-foreground">
        {message ||
          (steering.vector
            ? `Next reply: layer ${steering.layer}, vector strength ${steering.scale ?? 1}.`
            : steering.coordinates?.length
              ? `Next reply: ${steering.coordinates.filter((item) => item.dose !== 0).length} down_proj neuron(s) steered.`
              : steering.offset === 0
                ? "Off. Replies use the original activations."
                : `Next reply: layer ${steering.layer}, coordinate ${steering.neuron}, offset ${steering.offset > 0 ? "+" : ""}${steering.offset}.`)}
      </output>
    </div>
  );
}
