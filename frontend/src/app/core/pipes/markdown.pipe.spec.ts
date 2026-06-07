import { describe, expect, it } from 'vitest';
import { MarkdownPipe } from './markdown.pipe';

describe('MarkdownPipe', () => {
  const pipe = new MarkdownPipe();

  it('renders inline code', () => {
    const html = pipe.transform('Use `kubectl get pods`');
    expect(html).toContain('<code>');
    expect(html).toContain('kubectl get pods');
  });

  it('renders fenced code blocks', () => {
    const html = pipe.transform('```\nerror X-402\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('error X-402');
  });
});
