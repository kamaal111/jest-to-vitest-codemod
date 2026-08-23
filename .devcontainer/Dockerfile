FROM mcr.microsoft.com/devcontainers/javascript-node:26-bookworm

RUN apt-get update \
  && export DEBIAN_FRONTEND=noninteractive \
  && apt-get install -y --no-install-recommends gh httpie jq vim zsh \
  && chsh -s /usr/bin/zsh node \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/home/node/.local/share/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
COPY package.json /tmp/package.json
RUN su node -c "curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=\"$(jq -r '.devEngines.packageManager.version' /tmp/package.json)\" SHELL=\"$(which bash)\" bash -" \
  && npm install -g @github/copilot @openai/codex

RUN su node -c 'mkdir -p ~/.oh-my-zsh/custom/plugins' \
  && su node -c '[ -d ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions ] || git clone --depth 1 https://github.com/zsh-users/zsh-autosuggestions ~/.oh-my-zsh/custom/plugins/zsh-autosuggestions' \
  && su node -c '[ -d ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting ] || git clone --depth 1 https://github.com/zsh-users/zsh-syntax-highlighting.git ~/.oh-my-zsh/custom/plugins/zsh-syntax-highlighting' \
  && su node -c '[ -d ~/.oh-my-zsh/custom/plugins/zsh-completions ] || git clone --depth 1 https://github.com/zsh-users/zsh-completions ~/.oh-my-zsh/custom/plugins/zsh-completions'

COPY --chown=node:node .devcontainer/.zshrc /home/node/.zshrc
