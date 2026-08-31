/**
 * Builds a safe ILIKE value for a PostgREST .or()/.filter() string. Strips
 * %/_ (LIKE wildcards a caller shouldn't control) and quotes the value so
 * commas/parens in user input can't be interpreted as extra filter
 * conditions by PostgREST's filter-string parser.
 */
export function ilikeFilterValue(raw: string): string {
  const stripped = raw.replace(/[%_]/g, "");
  const escaped = stripped.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}
