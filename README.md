# Open Source Model Editor

A local-first desktop workspace for chatting with, fine-tuning, and steering Qwen models on Apple Silicon Macs. This is an independent modified distribution of [Unsloth](https://github.com/unslothai/unsloth), with its implementation and attribution retained.

- Explicit model loading and unloading through MLX.
- Local model and adapter selection, dataset preparation, LoRA training, checkpoints, and export.
- Neuron steering and saved steering recipes for supported local models.
- Shutdown handling that attempts to save training progress and stop app-owned workers.
- Manual source updates from this repository; automatic upstream updates are disabled.

## Build on an Apple Silicon Mac

Install Xcode command-line tools (`xcode-select --install`), Git, Node.js/npm (Node 22.12+), and [uv](https://docs.astral.sh/uv/getting-started/installation/). The setup script installs Rust if needed.

```bash
git clone https://github.com/jakemoshel/open-source-model-editor.git
cd open-source-model-editor
bash scripts/setup-local-macos.sh
```

Setup downloads dependencies and the default `SiddhJagani/Qwen3.8-4B-mlx-4Bit` model, builds an ad-hoc signed macOS app, and installs it in Applications. This is a source release, with no notarized installer provided. Disk and memory requirements depend on the selected model and training settings.

The app currently retains the display name **Jake's Model Trainer** and the existing Unsloth bundle identifier and data directory. Installation can replace an existing Jake's Model Trainer or Unsloth app after backing it up under `local-build/`; quit the existing app first. These builds share local application data, so back up important data before switching builds.

Open Chat and load a local model before sending a message. The default community conversion supports text inference and training; it has no vision-tower weights. Model weights have their own terms and are downloaded separately.

See [Mac setup](MAC-MINI.md), [local workflow](LOCAL-SETUP.md), and [contributing](CONTRIBUTING.md).

## Local data and network access

Models, datasets, chats, credentials, adapters, and checkpoints are runtime data and are not included in this source release. The default backend home is `~/.unsloth/studio`; model downloads use the Hugging Face cache. Initial setup, model downloads, and explicit update checks need network access. The simplified interface focuses on local work; upstream backend integrations remain in the source tree.

This repository starts with a fresh source snapshot. Private development history and machine-specific verification notes are not included. Upstream workflows are retained as source references; GitHub Actions is disabled for this repository, so inherited release and publishing jobs do not run.

## Licenses and attribution

The existing [COPYING](COPYING) notice assigns `unsloth/`, `tests/`, and `scripts/` to Apache-2.0 and `studio/` and `unsloth_cli/` to AGPLv3. See [LICENSE](LICENSE) and [studio/LICENSE.AGPL-3.0](studio/LICENSE.AGPL-3.0), along with individual file headers and bundled third-party notices. Those notices are retained; this release does not replace them with a new blanket license.

Local modifications include the simplified Qwen workflow, model loading controls, neuron steering and recipes, shutdown handling, and manual update behavior. This project is not an official Unsloth release. Third-party dependencies and model weights retain their respective licenses.
