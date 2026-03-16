#!/usr/bin/env bash

__forge_osc133_emit() {
  printf '\033]133;%s\007' "$1"
}

__forge_osc133_run_original_precmd() {
  if [[ -z "${__forge_osc133_original_prompt_command-}" ]]; then
    return
  fi

  eval "${__forge_osc133_original_prompt_command}"
}

__forge_osc133_preexec() {
  local command="${BASH_COMMAND-}"

  if [[ -n "${COMP_LINE-}" ]]; then
    return
  fi

  if [[ -z "${__forge_osc133_prompt_ready-}" ]]; then
    return
  fi

  if [[ -z "${command//[[:space:]]/}" ]]; then
    return
  fi

  case "${command}" in
    __forge_osc133_*|history*|builtin\ history*|PROMPT_COMMAND=*|PS1=*|"${PROMPT_COMMAND-}")
      return
      ;;
  esac

  if [[ -z "${__forge_osc133_command_started-}" ]]; then
    unset __forge_osc133_prompt_ready
    __forge_osc133_command_started=1
    __forge_osc133_emit "B;${command}"
    __forge_osc133_emit "C"
  fi
}

__forge_osc133_precmd() {
  local exit_code=$?

  unset __forge_osc133_prompt_ready

  if [[ -n "${__forge_osc133_command_started-}" ]]; then
    __forge_osc133_emit "D;${exit_code}"
    unset __forge_osc133_command_started
  fi

  __forge_osc133_run_original_precmd

  __forge_osc133_emit "A"

  PS1="\W \[\033[1;35m\]❯\[\033[0m\] "
  __forge_osc133_prompt_ready=1
}

trap '__forge_osc133_preexec' DEBUG

if [[ -n "${PROMPT_COMMAND-}" ]]; then
  __forge_osc133_original_prompt_command="${PROMPT_COMMAND}"
  PROMPT_COMMAND="__forge_osc133_precmd"
else
  PROMPT_COMMAND="__forge_osc133_precmd"
fi
