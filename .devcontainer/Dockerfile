FROM mcr.microsoft.com/devcontainers/javascript-node:24-bookworm

ARG PNPM_VERSION="10.13.1"

RUN apt-get update \
  && export DEBIAN_FRONTEND=noninteractive \
  && apt-get install -y --no-install-recommends gh httpie jq vim zsh \
  && chsh -s /usr/bin/zsh node \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
  && npm install -g @github/copilot @openai/codex

RUN su node -c 'mkdir -p ~/.oh-my-zsh/custom/plugins' \
  && su node -c '[ -d ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions ] || git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions' \
  && su node -c '[ -d ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting ] || git clone --depth 1 https://github.com/zsh-users/zsh-syntax-highlighting.git ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting' \
  && su node -c '[ -d ~/.oh-my-zsh/custom/plugins/zsh-completions ] || git clone --depth 1 https://github.com/zsh-users/zsh-completions ~/.oh-my-zsh/custom/plugins/zsh-completions'

COPY --chown=node:node .devcontainer/.zshrc /home/node/.zshrc
