export declare class SiteBuildError extends Error {
  readonly detail: string;
  constructor(detail: string);
}

/** Writes `files` as an Astro project, builds it and replaces `out` with the build. */
export declare function buildSite(files: ReadonlyMap<string, string>, out: string): Promise<void>;

/** The directory where generated projects are built, inside the node_modules that holds Astro. */
export declare function siteWorkRoot(): string;

/** The first lines of Astro's error output, without its stack trace. */
export declare function astroFailureDetail(output: string): string;
