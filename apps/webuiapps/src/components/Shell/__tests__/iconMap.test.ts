import { describe, expect, it } from 'vitest';

import { ICON_MAP } from '../index';

describe('Shell ICON_MAP', () => {
  it('includes Youtube icon mapping', () => {
    expect(ICON_MAP.Youtube).toBeDefined();
  });
});

