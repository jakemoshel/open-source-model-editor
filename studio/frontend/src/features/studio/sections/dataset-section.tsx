// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026-present the Unsloth AI Inc. team. All rights reserved. See /studio/LICENSE.AGPL-3.0

import { DatasetSelector } from "@/features/dataset-picker";
import { useTrainingConfigStore } from "@/features/training";
import { useT } from "@/i18n";
import { toast } from "@/lib/toast";
import { type ReactNode, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { DatasetAdvancedSettingsSection } from "./dataset-advanced-settings-section";
import { DatasetSelectionSection } from "./dataset-selection";
import { DatasetUploadField } from "./dataset-upload";
import { FieldHint } from "./field-hint";
import { S3ConfigForm } from "./s3-config-form";
import { useDatasetUploads } from "./use-dataset-uploads";
import { useLocalDatasetInventory } from "./use-local-dataset-inventory";

function FieldLabel({
  children,
  hint,
  hintLabel,
}: {
  children: ReactNode;
  hint?: string;
  hintLabel?: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      {children}
      {hint ? <FieldHint text={hint} label={hintLabel ?? hint} /> : null}
    </span>
  );
}

export function DatasetPanel() {
  const t = useT();
  const {
    datasetSource,
    restoreBrowseDatasetSource,
    isVisionModel,
    modelType,
  } = useTrainingConfigStore(
    useShallow((state) => ({
      datasetSource: state.datasetSource,
      restoreBrowseDatasetSource: state.restoreBrowseDatasetSource,
      isVisionModel: state.isVisionModel,
      modelType: state.modelType,
    })),
  );
  const localDatasetInventory = useLocalDatasetInventory(datasetSource);
  const uploads = useDatasetUploads();
  const isVisionTraining = (modelType ?? "text") === "vision" || isVisionModel;

  useEffect(() => {
    if (datasetSource === "s3" && isVisionTraining) {
      restoreBrowseDatasetSource();
      toast.info(t("studio.training.validation.s3MultimodalUnsupported"), {
        id: "training-s3-multimodal-source-reset",
      });
    }
  }, [datasetSource, isVisionTraining, restoreBrowseDatasetSource, t]);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {datasetSource === "s3" && <S3ConfigForm />}

      {datasetSource !== "s3" && (
        <>
          <div className="max-w-3xl space-y-1 text-sm leading-relaxed text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">
                A dataset is a collection of examples.
              </span>{" "}
              Each example shows an input and the answer you want the model to
              give.
            </p>
            <p>
              Choose a prepared Hugging Face dataset or upload your own JSONL,
              CSV, or Parquet file. For a personality or style change, use
              examples of varied prompts with answers written in that style. A
              dataset name alone does not tell you what it contains, so inspect
              the preview before training.
            </p>
          </div>
          <details className="rounded-xl border border-border/70 px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium text-foreground">
              Show a chat dataset example
            </summary>
            <div className="mt-3 space-y-3 text-muted-foreground">
              <p>
                JSONL means one JSON object on each line. For a chat dataset,
                each object has a <code>messages</code> list: a user message is
                the input, and the assistant message is the answer to learn.
                Repeat this with clear, varied examples of the behavior you
                want.
              </p>
              <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs text-foreground">
                <code>
                  {
                    '{"messages":[{"role":"user","content":"What should I cook tonight?"},{"role":"assistant","content":"Tonight, we conquer the kitchen with tomato pasta. Gather your ingredients and prepare for a delicious victory."}]}\n{"messages":[{"role":"user","content":"I am nervous about my presentation."},{"role":"assistant","content":"Face the room, state your point clearly, and take one question at a time. You are more prepared than your nerves suggest."}]}'
                  }
                </code>
              </pre>
              <p>
                After choosing a dataset, inspect its preview and column mapping
                before training. You can start with a small set of
                representative examples and add more after testing the result.
              </p>
            </div>
          </details>
          <div className="grid grid-cols-1 items-start gap-4 @lg/train-section:grid-cols-2 @lg/train-section:gap-5">
            <div className="flex flex-col gap-2">
              <FieldLabel
                hint={t("studio.wizard.datasetTooltip")}
                hintLabel={t("studio.wizard.datasetLabel")}
              >
                {t("studio.wizard.datasetLabel")}
              </FieldLabel>
              <DatasetSelector />
            </div>
            <DatasetUploadField uploads={uploads} />
          </div>
        </>
      )}

      <DatasetSelectionSection
        localDatasets={localDatasetInventory.rows}
        localInventorySettled={localDatasetInventory.settled}
        uploads={uploads}
      />
      <DatasetAdvancedSettingsSection />
    </div>
  );
}
