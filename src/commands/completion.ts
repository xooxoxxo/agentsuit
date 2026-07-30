import { loadSets } from "../sets.js";
import { listLibrarySkills } from "../library.js";

/**
 * Generate and print shell completion scripts for bash or zsh.
 * Supports --list-sets and --list-skills hidden modes for dynamic completion at runtime.
 */
export function runCompletion(shell: string, mode?: string): void {
  if (mode === "--list-sets") {
    // Plain newline-separated set names for completion script to consume
    const sets = loadSets();
    for (const setName of Object.keys(sets).sort()) {
      console.log(setName);
    }
    return;
  }

  if (mode === "--list-skills") {
    // Plain newline-separated skill names for completion script to consume
    const skills = listLibrarySkills();
    for (const skill of skills) {
      console.log(skill.name);
    }
    return;
  }

  // Generate completion script for the requested shell
  if (shell === "bash") {
    console.log(bashCompletion());
  } else if (shell === "zsh") {
    console.log(zshCompletion());
  } else {
    console.error(`Unknown shell: ${shell}. Supported: bash, zsh`);
    process.exit(1);
  }
}

function bashCompletion(): string {
  return `# bash completion for skillset
# Installation: Add this to ~/.bashrc or ~/.bash_profile:
#   eval "$(skillset completion bash)"

_skillset_completion() {
  local cur prev words cword
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  words=("\${COMP_WORDS[@]}")
  cword=\${COMP_CWORD}

  local commands="init list sets new use enable disable add remove import completion"

  # Complete command name if we're at position 1
  if [ \$cword -eq 1 ]; then
    COMPREPLY=($(compgen -W "\$commands" -- "\$cur"))
    return
  fi

  # Complete arguments based on command
  case "\$prev" in
    new|use)
      # Complete set names
      local sets=\$(skillset completion --list-sets 2>/dev/null)
      COMPREPLY=($(compgen -W "\$sets" -- "\$cur"))
      ;;
    enable|disable)
      # Complete skill names
      local skills=\$(skillset completion --list-skills 2>/dev/null)
      COMPREPLY=($(compgen -W "\$skills" -- "\$cur"))
      ;;
    add|remove)
      # Check position: after add/remove comes set, then skill
      if [ \$cword -eq 3 ]; then
        # Third argument is skill name
        local skills=\$(skillset completion --list-skills 2>/dev/null)
        COMPREPLY=($(compgen -W "\$skills" -- "\$cur"))
      else
        # Second argument is set name
        local sets=\$(skillset completion --list-sets 2>/dev/null)
        COMPREPLY=($(compgen -W "\$sets" -- "\$cur"))
      fi
      ;;
    import)
      # File/directory completion (default behavior)
      ;;
    as)
      # The --as flag takes a custom name (just let user type)
      ;;
  esac

  return
}

complete -o bashdefault -o default -o nospace -F _skillset_completion skillset
`;
}

function zshCompletion(): string {
  return `# zsh completion for skillset
# Installation: Add this to ~/.zshrc:
#   eval "$(skillset completion zsh)"

_skillset_completion() {
  local -a commands
  commands=(
    'init:Migrate real skill dirs in the active folder into a managed library'
    'list:Show every skill in the library and whether it'"'"'s active'
    'sets:Show defined sets and which one (if any) is active'
    'new:Interactively pick skills for a new (or existing) set'
    'use:Activate exactly the skills in a set, deactivating everything else'
    'enable:Activate a single skill without changing set membership'
    'disable:Deactivate a single skill without changing set membership'
    'add:Add a skill to a set'"'"'s definition'
    'remove:Remove a skill from a set'"'"'s definition'
    'import:Copy an external skill folder into the library'
    'completion:Show shell completion script'
  )

  local context line state

  _arguments -C \
    '(-h --help)'{-h,--help}'[show help]' \
    '(--project)--project[operate on ./.claude/skills instead of ~/.claude/skills]' \
    '1: :->command' \
    '*:: :->args'

  case \$state in
    command)
      _describe 'commands' commands
      ;;
    args)
      case \${words[2]} in
        use|new)
          # Complete with set names
          local sets=\$(skillset completion --list-sets 2>/dev/null)
          _values 'sets' \$(echo "\$sets" | tr '\n' ' ')
          ;;
        enable|disable)
          # Complete with skill names
          local skills=\$(skillset completion --list-skills 2>/dev/null)
          _values 'skills' \$(echo "\$skills" | tr '\n' ' ')
          ;;
        add|remove)
          # Check position: second arg is set, third is skill
          if [ \${#words[@]} -eq 4 ]; then
            # Third argument is skill
            local skills=\$(skillset completion --list-skills 2>/dev/null)
            _values 'skills' \$(echo "\$skills" | tr '\n' ' ')
          else
            # Second argument is set
            local sets=\$(skillset completion --list-sets 2>/dev/null)
            _values 'sets' \$(echo "\$sets" | tr '\n' ' ')
          fi
          ;;
        import)
          # File/directory completion
          _files -/
          ;;
      esac
      ;;
  esac
}

_skillset_completion
`;
}
