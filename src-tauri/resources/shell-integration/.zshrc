if [[ -n "${FORGE_SHELL_INTEGRATION_PATH-}" && -r "${FORGE_SHELL_INTEGRATION_PATH}" ]]; then
  source "${FORGE_SHELL_INTEGRATION_PATH}"
fi

if [[ -r "${HOME}/.zshrc" ]]; then
  source "${HOME}/.zshrc"
fi
