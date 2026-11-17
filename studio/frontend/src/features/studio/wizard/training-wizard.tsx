// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { PICKER_TRIGGER_CLASS } from "@/components/resource-picker/picker-focus";
import { SectionBox, SectionField } from "@/components/section-box";
import { SegmentedTabsList } from "@/components/segmented-tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HfTokenIndicator } from "@/features/hub";
import {
  DECISION_MODEL_LABELS,
  useSettingsDialogStore,
} from "@/features/settings";
import { TrainModelSelector } from "@/features/train-model-picker";
import {
  type DecisionCheckpoint,
  TRAINING_METHOD_META,
  TRAINING_METHOD_ORDER,
  useTrainingReadiness,
  useTrainingConfigStore,
} from "@/features/training";
import { useT } from "@/i18n";
import { ChipIcon, Settings01Icon } from "@/lib/hugeicons-derived";
import { cn } from "@/lib/utils";
import type { TrainingMethod } from "@/types/training";
import { Database02Icon, Edit03Icon } from "@hugeicons/core-free-icons";
import type { ReactNode } from "react";
import { DatasetPanel } from "../sections/dataset-section";
import { DatasetSourceToggleAction } from "../sections/dataset-source-toggle";
import { FieldHint } from "../sections/field-hint";
import { ParamsSection } from "../sections/params-section";
import { ConfigActions } from "./config-actions";
import type { ParamMode } from "./training-param-mode";

function ParamModeToggle({
  mode,
  onChange,
}: {
  mode: ParamMode;
  onChange: (next: ParamMode) => void;
}) {
  const t = useT();
  const options = [
    { value: "simple", label: t("studio.params.mode.simple") },
    { value: "advanced", label: t("studio.params.mode.advanced") },
  ] as const;

  return (
    <Tabs
      value={mode}
      onValueChange={(value) => onChange(value as ParamMode)}
      className="contents"
    >
      <SegmentedTabsList
        value={mode}
        options={options}
        ariaLabel={t("studio.params.mode.ariaLabel")}
        size="compact"
        className="@md/train-card:w-[calc(180px*var(--ui-space-scale,1))]"
      />
    </Tabs>
  );
}

function SetupField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <SectionField
      label={label}
      hint={hint ? <FieldHint text={hint} label={label} /> : null}
    >
      {children}
    </SectionField>
  );
}

function TrainingMethodSelect() {
  const t = useT();
  const trainingMethod = useTrainingConfigStore((s) => s.trainingMethod);
  const setTrainingMethod = useTrainingConfigStore((s) => s.setTrainingMethod);
  const isDecision = useTrainingConfigStore((s) => s.modelType === "decision");
  // Clef and LLM decision models have an LLM backbone, so they take QLoRA; Laya does not.
  const decisionTakesQlora = useTrainingConfigStore(
    (s) =>
      s.modelType === "decision" &&
      (s.decisionLayout === "clef" || s.decisionLayout === "llm"),
  );
  const activeMeta = TRAINING_METHOD_META[trainingMethod];
  const activeLabel = activeMeta ? t(activeMeta.labelKey) : trainingMethod;
  return (
    <Select
      value={trainingMethod}
      onValueChange={(v) => setTrainingMethod(v as TrainingMethod)}
    >
      <SelectTrigger
        aria-label={`${t("studio.wizard.methodLabel")}: ${activeLabel}`}
        className={cn(
          PICKER_TRIGGER_CLASS,
          "w-full min-w-[calc(148px*var(--ui-space-scale,1))] justify-between",
        )}
        data-tour="studio-method"
      >
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 shrink-0 rounded-full",
              activeMeta?.dotClass ?? "bg-muted-foreground",
            )}
          />
          <span className="truncate font-medium text-foreground">
            {activeLabel}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent
        position="popper"
        side="bottom"
        align="start"
        sideOffset={8}
        className="rounded-xl ring-0"
      >
        {TRAINING_METHOD_ORDER.filter(
          (method) =>
            !isDecision ||
            method === "lora" ||
            method === "full" ||
            (decisionTakesQlora && method === "qlora"),
        ).map((method) => {
          const meta = TRAINING_METHOD_META[method];
          return (
            <Tooltip key={method} delayDuration={300}>
              <TooltipTrigger asChild={true} disableClickToggle={true}>
                <SelectItem value={method}>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        meta.dotClass,
                      )}
                    />
                    {t(meta.labelKey)}
                  </span>
                </SelectItem>
              </TooltipTrigger>
              <TooltipContent
                side="right"
                sideOffset={10}
                className="max-w-[calc(220px*var(--ui-space-scale,1))] text-ui-11p5 leading-snug"
              >
                {t(meta.hintKey)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function TrainAsSelect() {
  const t = useT();
  const trainAsDecision = useTrainingConfigStore((s) => s.trainAsDecision);
  const setTrainAsDecision = useTrainingConfigStore(
    (s) => s.setTrainAsDecision,
  );
  const value = trainAsDecision ? "decision" : "language";
  const label = (option: string) =>
    option === "decision"
      ? t("studio.wizard.trainAsDecision")
      : t("studio.wizard.trainAsLanguage");
  return (
    <Select
      value={value}
      onValueChange={(next) => setTrainAsDecision(next === "decision")}
    >
      <SelectTrigger
        aria-label={`${t("studio.wizard.trainAsLabel")}: ${label(value)}`}
        className={cn(PICKER_TRIGGER_CLASS, "w-full justify-between")}
      >
        <span className="truncate font-medium text-foreground">
          {label(value)}
        </span>
      </SelectTrigger>
      <SelectContent
        position="popper"
        side="bottom"
        align="start"
        sideOffset={8}
        className="rounded-xl ring-0"
      >
        {["language", "decision"].map((option) => (
          <SelectItem key={option} value={option}>
            {label(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CheckpointSelect({
  checkpoints,
}: {
  checkpoints: DecisionCheckpoint[];
}) {
  const t = useT();
  const modelSubfolder = useTrainingConfigStore((s) => s.modelSubfolder);
  const setModelSubfolder = useTrainingConfigStore((s) => s.setModelSubfolder);
  const active =
    checkpoints.find((checkpoint) => checkpoint.subfolder === modelSubfolder) ??
    checkpoints[0];
  const checkpointLabel = (checkpoint: DecisionCheckpoint) =>
    DECISION_MODEL_LABELS[checkpoint.name]
      ? t(DECISION_MODEL_LABELS[checkpoint.name])
      : checkpoint.name;
  return (
    <Select
      value={active.name}
      onValueChange={(name) => {
        const next = checkpoints.find((checkpoint) => checkpoint.name === name);
        if (next) {
          setModelSubfolder(next.subfolder);
        }
      }}
    >
      <SelectTrigger
        aria-label={`${t("studio.wizard.checkpointLabel")}: ${checkpointLabel(active)}`}
        className={cn(PICKER_TRIGGER_CLASS, "w-full justify-between")}
      >
        <span className="truncate font-medium text-foreground">
          {checkpointLabel(active)}
        </span>
      </SelectTrigger>
      <SelectContent
        position="popper"
        side="bottom"
        align="start"
        sideOffset={8}
        className="rounded-xl ring-0"
      >
        {checkpoints.map((checkpoint) => (
          <SelectItem key={checkpoint.name} value={checkpoint.name}>
            {checkpointLabel(checkpoint)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ModelPanel() {
  const t = useT();
  const openSettings = useSettingsDialogStore((s) => s.openDialog);
  const decisionCheckpoints = useTrainingConfigStore((s) =>
    s.modelType === "decision" ? s.decisionCheckpoints : null,
  );
  // Text and vision LLMs can also train as decision models; Laya, Clef, audio and embeddings cannot.
  const canTrainAsDecision = useTrainingConfigStore(
    (s) =>
      s.selectedModel !== null &&
      (s.decisionLayout === "llm" ||
        s.modelType === "text" ||
        s.modelType === "vision"),
  );
  return (
    <div className="grid grid-cols-1 gap-4 @md/train-section:grid-cols-2 @2xl/train-section:grid-cols-[minmax(0,1fr)_180px_200px]">
      <div className="@md/train-section:col-span-2 @2xl/train-section:col-span-1">
        <SetupField
          label={t("studio.wizard.modelLabel")}
          hint={t("studio.wizard.modelTooltip")}
        >
          <TrainModelSelector />
        </SetupField>
      </div>
      <SetupField
        label={t("studio.wizard.methodLabel")}
        hint={t("studio.wizard.methodTooltip")}
      >
        <TrainingMethodSelect />
      </SetupField>
      <SetupField
        label={t("picker.hfToken.label")}
        hint={t("studio.wizard.hfTokenDescription")}
      >
        <HfTokenIndicator
          showLabel={true}
          onOpenSettings={() => openSettings("general")}
        />
      </SetupField>
      {canTrainAsDecision ? (
        <SetupField
          label={t("studio.wizard.trainAsLabel")}
          hint={t("studio.wizard.trainAsTooltip")}
        >
          <TrainAsSelect />
        </SetupField>
      ) : null}
      {decisionCheckpoints && decisionCheckpoints.length > 0 ? (
        <SetupField
          label={t("studio.wizard.checkpointLabel")}
          hint={t("studio.wizard.checkpointTooltip")}
        >
          <CheckpointSelect checkpoints={decisionCheckpoints} />
        </SetupField>
      ) : null}
    </div>
  );
}

export function TrainingWizard({
  paramMode,
  onParamModeChange,
  startCta,
}: {
  paramMode: ParamMode;
  onParamModeChange: (next: ParamMode) => void;
  startCta: ReactNode;
}) {
  const t = useT();
  const { hasModel, hasDataset, isReady } = useTrainingReadiness();
  const steps = [
    {
      title: "Choose the model you want to teach",
      detail:
        "This is the starting model. LoRA makes a separate adapter and leaves the original model unchanged.",
      done: hasModel,
      target: "studio-model-section",
      action: hasModel ? "Change model" : "Choose model",
    },
    {
      title: "Choose examples for it to learn from",
      detail:
        "Use a Hugging Face dataset or upload your own file. Read the examples in the preview; the title alone does not tell you what is inside.",
      done: hasDataset,
      target: "studio-dataset-section",
      action: hasDataset ? "Change dataset" : "Choose dataset",
    },
    {
      title: "Keep the suggested settings and start",
      detail:
        "For a first run, leave Simple settings as they are. When the model and dataset are selected, press Start training below.",
      done: isReady,
      target: "studio-params-section",
      action: "Review settings",
    },
  ] as const;
  const currentStep = steps.findIndex((step) => !step.done);

  function jumpTo(target: string) {
    const section = document.getElementById(target);
    if (!section) {
      return;
    }
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    section
      .querySelector<HTMLElement>(
        "button, input, [tabindex]:not([tabindex='-1'])",
      )
      ?.focus({ preventScroll: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="training-guide-title"
        className="@container/train-guide rounded-2xl border border-border/70 bg-card p-5"
      >
        <div className="mb-4">
          <h2 id="training-guide-title" className="text-base font-semibold">
            Your first training run
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Training teaches a model from examples. The X post you shared is a
            different technique called activation steering; this screen does not
            apply those neuron values.
          </p>
        </div>
        <ol className="divide-y divide-border/60">
          {steps.map((step, index) => {
            const active = currentStep === index;
            return (
              <li key={step.target}>
                <button
                  type="button"
                  onClick={() => jumpTo(step.target)}
                  aria-current={active ? "step" : undefined}
                  className={`w-full py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active ? "text-foreground" : "text-muted-foreground"}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span
                      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs tabular-nums ${active ? "border-action text-action" : ""}`}
                      aria-hidden="true"
                    >
                      {step.done ? "✓" : index + 1}
                    </span>
                    {step.title}
                  </span>
                  <span className="mt-2 block text-xs leading-relaxed text-muted-foreground">
                    {step.detail}
                  </span>
                  <span className="mt-3 inline-block text-xs font-medium text-foreground underline underline-offset-4">
                    {step.action}
                    {active ? (
                      <span className="ml-2 text-action no-underline">
                        Next
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 max-w-sm" data-training-guide-action>
          {startCta}
        </div>
      </section>
      <SectionBox
        title={t("studio.wizard.modelTitle")}
        description={t("studio.wizard.modelDescription")}
        icon={ChipIcon}
        chipTint="var(--chart-1)"
      >
        <div id="studio-model-section" className="scroll-mt-6">
          <ModelPanel />
        </div>
      </SectionBox>

      <SectionBox
        title={t("studio.wizard.datasetTitle")}
        description={t("studio.wizard.datasetDescription")}
        icon={Database02Icon}
        chipTint="var(--chart-1)"
        dataTour="studio-dataset"
        titleAction={<DatasetSourceToggleAction />}
      >
        <div id="studio-dataset-section" className="scroll-mt-6">
          <DatasetPanel />
        </div>
      </SectionBox>

      <SectionBox
        title={t("studio.wizard.paramsTitle")}
        description={t("studio.wizard.paramsDescription")}
        icon={Settings01Icon}
        chipTint="var(--chart-1)"
        dataTour="studio-params"
        titleAction={
          <ParamModeToggle mode={paramMode} onChange={onParamModeChange} />
        }
      >
        <div id="studio-params-section" className="scroll-mt-6">
          <ParamsSection mode={paramMode} />
        </div>
      </SectionBox>

      <SectionBox
        title={t("studio.wizard.configTitle")}
        description={t("studio.wizard.configDescription")}
        icon={Edit03Icon}
        chipTint="var(--chart-1)"
      >
        <ConfigActions />
      </SectionBox>
    </div>
  );
}
