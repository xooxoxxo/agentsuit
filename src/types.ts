export interface SkillMeta {
  name: string;
  description: string;
  /** Absolute path to the skill's entry inside the library (may itself be a symlink). */
  path: string;
  /** Fully resolved directory the skill actually lives in, or null if the link is broken. */
  realPath: string | null;
  bytes: number;
  estTokens: number;
  disableModelInvocation: boolean;
  /** True when the library entry is a symlink to a skill owned elsewhere (plugin dir, dotfiles repo...). */
  external: boolean;
  /** True when the library entry is a symlink whose target no longer exists. */
  broken: boolean;
}

/** setName -> ordered list of skill names */
export type SetsFile = Record<string, string[]>;
