/**
 * Approximate token count: characters / 4, rounded up. It is the usual rule of thumb for
 * English; French and text with typographic characters (« », ’, …) or LaTeX tokenize slightly
 * worse (≈ 3.5 characters per token), so read it as a lower bound and keep a 15 % margin when
 * comparing to an assistant's limit. Precise counts depend on each tokenizer, which we do not
 * embed (the prompts must work with any assistant).
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
