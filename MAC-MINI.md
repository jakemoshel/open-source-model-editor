# Mac setup and updates

Follow the prerequisites and clone/build commands in [README.md](README.md). The supported setup script requires native Apple Silicon macOS. Quit the current app before installing.

The script builds and installs **Jake's Model Trainer**, downloads the default model if needed, and preserves previous app bundles under `local-build/`. Source builds share the existing Unsloth application identity and runtime data.

## Update deliberately

In the source checkout:

```bash
git pull --ff-only origin main
bash scripts/setup-local-macos.sh
```

Commit or stash changes before pulling. The app's manual update control accepts this repository's clean `main` checkout, fast-forwards it, and starts the rebuild/install process after the app quits. Automatic updates remain disabled.

## Move to another Mac

Clone and build the source on the new Mac. Model weights, datasets, chat history, credentials, adapters, and checkpoints are separate from Git. Back up and transfer any required runtime data separately; do not commit it to this public repository.
