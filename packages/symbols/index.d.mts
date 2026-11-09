export interface LineSpan {
  /** 1-based first line. */
  line: number;
  /** 1-based last line, inclusive. */
  endLine: number;
}

export interface SymbolDefinition extends LineSpan {
  name: string;
}

export interface SourceSymbols {
  /** The definitions the language's tags query names, by first line. */
  definitions: SymbolDefinition[];
  /** The calls holding `text` as a whole string literal, such as a test with that name. */
  calls(text: string): LineSpan[];
}

/** Whether `file`'s language has a grammar in this package. */
export declare function supports(file: string): boolean;

/** The symbols of `source`, or undefined when the language of `file` is not supported. */
export declare function readSymbols(
  file: string,
  source: string,
): Promise<SourceSymbols | undefined>;
