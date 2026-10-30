import { describe, expect, it } from '@jest/globals';

import { judgeSelfTest, SelfTestProbe } from '../self-test';

function probe(): SelfTestProbe {
  const p = new SelfTestProbe();
  for (let i = 0; i < 20; i++) p.record('pointing_up.jpg', 'point', true, { x: 100 + i * 30, y: 500 }, []);
  return p;
}

const photo = { name: 'pointing_up.jpg', results: 20, hands: 20, landmarks: 21, handedness: 'left', score: 0.99 };

describe('the self test verdict', () => {
  it('passes a smooth, fast cursor and records its timings', () => {
    const verdict = judgeSelfTest({ passed: true, photos: [photo], cursorFps: 58, endToEndMs: 120, inferenceMs: 40, deliveryMs: 1.2, delegate: 'cpu' }, probe().result, 1080);
    expect(verdict.passed).toBe(true);
    expect(verdict.timings).toMatchObject({ cursorFps: 58, endToEndMs: 120, delegate: 'cpu' });
  });

  it('fails a cursor that redraws too rarely or lags', () => {
    expect(judgeSelfTest({ passed: true, photos: [photo], cursorFps: 12, endToEndMs: 120 }, probe().result, 1080).passed).toBe(false);
    expect(judgeSelfTest({ passed: true, photos: [photo], cursorFps: 60, endToEndMs: 900 }, probe().result, 1080).passed).toBe(false);
  });
});
