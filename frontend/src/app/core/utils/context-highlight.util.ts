export interface ContextLine {
  number: number;
  text: string;
  highlighted: boolean;
}

const ERROR_CODE_RE = /\b[A-Z]-?\d{2,5}\b/g;
const IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;

export function extractHighlightTerms(query: string): string[] {
  const terms = new Set<string>();

  for (const match of query.matchAll(ERROR_CODE_RE)) {
    terms.add(match[0]);
  }
  for (const match of query.matchAll(IP_RE)) {
    terms.add(match[0]);
  }

  for (const word of query.split(/\s+/)) {
    const cleaned = word.replace(/[^\w.-]/g, '');
    if (cleaned.length >= 4) {
      terms.add(cleaned);
    }
  }

  return [...terms];
}

export function buildContextLines(content: string, query: string): ContextLine[] {
  const terms = extractHighlightTerms(query);
  return content.split('\n').map((text, index) => ({
    number: index + 1,
    text,
    highlighted:
      terms.length > 0 &&
      terms.some((term) => text.toLowerCase().includes(term.toLowerCase())),
  }));
}

export function chunkSourceLabel(metadata: Record<string, unknown>, sourceType: string): string {
  const candidates = ['file', 'seed_file', 'playbook', 'resource', 'failed_job'];
  for (const key of candidates) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return sourceType;
}
