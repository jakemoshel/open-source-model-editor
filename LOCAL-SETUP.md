# Local workflow

Build and install using [README.md](README.md). The installed app is named **Jake's Model Trainer**. Its backend lives under `~/.unsloth/studio/unsloth_studio`, while downloaded models use the Hugging Face cache.

## Chat and training

Model Hub opens to installed models. In Chat, explicitly load a model before sending a message. Select a saved adapter or steering recipe from the model picker when available. Unloading or quitting releases the model process; downloaded weights remain on disk.

Use Train to choose local weights, prepare a dataset, configure supported MLX training settings, and save adapters or checkpoints. Available methods depend on the backend and model. A lower training loss alone does not establish better answers on new prompts.

## Neuron steering

Neuron steering modifies decoder activations during generation, rather than stored weights. Controls are model-specific, and unsupported backends or invalid coordinates return errors. Saved recipes can be selected alongside models. Results depend on the model and settings; a coordinate is not automatically a meaningful semantic feature.

## Shutdown and updates

During training, normal quit offers to save before exiting. Checkpoint failure, forced OS termination, or power loss can lose progress since the last checkpoint. App-owned workers are stopped during normal shutdown. Weights and saved data stay on disk.

Source updates are manual and restricted to this public repository's clean `main` branch. The app can fast-forward the source and start a rebuild after quitting. Update logs use `~/Library/Logs/Jake's Model Trainer/update.log`. See [MAC-MINI.md](MAC-MINI.md) for terminal commands.

## Verification

```bash
python3 tests/studio/test_local_quit_selfcheck.py
python3 tests/studio/test_neuron_steering_selfcheck.py
python3 -m pytest -q tests/studio/test_tauri_branding_contract.py
cd studio/frontend
node --experimental-strip-types --test tests/private-main-update-control.test.ts
```

Steering checks require MLX and its dependencies on Apple Silicon. The setup script also runs focused backend and native Rust checks. These automated checks do not establish real-model quality or cover every native interaction.
