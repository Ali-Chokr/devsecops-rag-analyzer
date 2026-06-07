import { describe, expect, it } from 'vitest';
import type { ChatStatus } from './dashboard';

function selectedSourceTypes(
  sourceTypes: Record<string, boolean>,
  sourceOptions: Array<{ key: string; label: string }>,
): string[] | undefined {
  const selected = Object.entries(sourceTypes)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
  if (selected.length === 0 || selected.length === sourceOptions.length) {
    return undefined;
  }
  return selected;
}

describe('Dashboard source filters', () => {
  const sourceOptions = [
    { key: 'k8s', label: 'Kubernetes' },
    { key: 'ansible', label: 'Ansible' },
    { key: 'terraform', label: 'Terraform' },
    { key: 'gitlab_ci', label: 'GitLab CI' },
    { key: 'log', label: 'Runtime logs' },
  ];

  it('returns undefined when all source types are selected', () => {
    expect(
      selectedSourceTypes(
        {
          k8s: true,
          ansible: true,
          terraform: true,
          gitlab_ci: true,
          log: true,
        },
        sourceOptions,
      ),
    ).toBeUndefined();
  });

  it('marks retrieving and writing as busy', () => {
    const isBusy = (status: ChatStatus) =>
      status === 'retrieving' || status === 'writing';

    expect(isBusy('retrieving')).toBe(true);
    expect(isBusy('writing')).toBe(true);
    expect(isBusy('complete')).toBe(false);
    expect(isBusy('idle')).toBe(false);
  });

  it('returns selected source types when filtered', () => {
    expect(
      selectedSourceTypes(
        {
          k8s: true,
          ansible: false,
          terraform: false,
          gitlab_ci: false,
          log: true,
        },
        sourceOptions,
      ),
    ).toEqual(['k8s', 'log']);
  });
});
