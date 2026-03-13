typeset -g __forge_osc133_command_started=0

__forge_osc133_emit() {
  printf '\033]133;%s\007' "$1"
}

__forge_osc133_preexec() {
  __forge_osc133_command_started=1
  __forge_osc133_emit "B"
  __forge_osc133_emit "C"
}

__forge_osc133_precmd() {
  local exit_code=$?

  if (( __forge_osc133_command_started )); then
    __forge_osc133_emit "D;${exit_code}"
    __forge_osc133_command_started=0
  fi

  __forge_osc133_emit "A"
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec __forge_osc133_preexec
add-zsh-hook precmd __forge_osc133_precmd
