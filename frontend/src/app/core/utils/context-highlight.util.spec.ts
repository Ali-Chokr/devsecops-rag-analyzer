import { buildContextLines, chunkSourceLabel, extractHighlightTerms } from './context-highlight.util';

describe('context-highlight.util', () => {
  it('extracts error codes and IPs from the query', () => {
    const terms = extractHighlightTerms('X-402 on 192.168.1.50 payment-service');
    expect(terms).toContain('X-402');
    expect(terms).toContain('192.168.1.50');
    expect(terms).toContain('payment-service');
  });

  it('highlights matching context lines', () => {
    const lines = buildContextLines(
      'INFO ok\nERROR X-402 payment gateway timeout\nINFO done',
      'X-402 payment gateway',
    );
    expect(lines[1].highlighted).toBe(true);
    expect(lines[0].highlighted).toBe(false);
  });

  it('prefers metadata file labels for chunk headers', () => {
    expect(
      chunkSourceLabel({ file: 'payment-service-configmap.yaml' }, 'k8s'),
    ).toBe('payment-service-configmap.yaml');
  });
});
