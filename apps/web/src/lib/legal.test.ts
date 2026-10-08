import { describe, expect, it } from 'vitest';
import { legalInfo } from './legal';

describe('legalInfo', () => {
  it('keeps only the values that are set', () => {
    expect(
      legalInfo({
        VITE_LEGAL_PUBLISHER: ' alice ',
        VITE_LEGAL_CONTACT: '',
        VITE_LEGAL_HOST: 'Host, 1 street',
        VITE_LEGAL_HOST_PRIVACY: undefined,
        VITE_SOURCE_URL: '   ',
      }),
    ).toEqual({ publisher: 'alice', host: 'Host, 1 street' });
  });

  it('is empty when nothing is configured', () => {
    expect(legalInfo({})).toEqual({});
  });
});
