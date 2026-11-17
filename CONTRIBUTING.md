# Contributing

Open an issue or pull request in this repository. Keep changes focused and preserve the existing file licenses and third-party attribution. This is an independent modified distribution; report problems specific to it here.

Follow [README.md](README.md) to build. Run checks relevant to the change; focused commands are listed in [LOCAL-SETUP.md](LOCAL-SETUP.md). Frontend changes should also pass `npm --prefix studio/frontend run typecheck` and `npm --prefix studio/frontend run build` after installing the locked dependencies with `npm ci`.

Do not submit credentials, private datasets, chats, model weights, checkpoints, logs, or generated builds. Contributions should use the existing license applicable to the files being changed.
