import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import { GESTURE_KEYS } from '../../gesture-engine/gestures';
import { APP_LANGUAGES, MESSAGES, SPEECH_LOCALES } from '../../i18n';
import { PRACTICE_STEPS, PRACTICE_TARGETS } from '../../onboarding/machine';
import { ActionPlanner } from '../../sigil-core';
import { BRAND_GLYPHS } from '../../ui/glyph-data';
import { albumForKey, ALBUM_IDS, GESTURE_ALBUMS, QUICK_ALBUMS } from '../gestures';
import { FINGERTIPS, HAND_BONES, handClip, type ClipId } from '../performances';

const planner = new ActionPlanner({ profiles: ProfileRegistry.withBuiltins() });

describe('gesture albums', () => {
  it('cover every gesture key exactly once', () => {
    const keys = GESTURE_ALBUMS.flatMap((album) => album.keys);
    expect([...keys].sort()).toEqual([...GESTURE_KEYS].sort());
    for (const key of GESTURE_KEYS) {
      expect(albumForKey(key)).toBeDefined();
    }
  });

  it('use icons of the brand set and have a unique id each', () => {
    expect(new Set(GESTURE_ALBUMS.map((album) => album.id)).size).toBe(ALBUM_IDS.length);
    for (const album of GESTURE_ALBUMS) {
      expect(Object.keys(BRAND_GLYPHS)).toContain(album.icon);
    }
  });

  it('put the practiced signs of the tutorial in an album', () => {
    for (const step of PRACTICE_STEPS) {
      for (const key of PRACTICE_TARGETS[step]) {
        expect(albumForKey(key)).toBeDefined();
      }
    }
    for (const id of QUICK_ALBUMS) {
      expect(ALBUM_IDS).toContain(id);
    }
  });

  it('have a name, an effect and a how to in every language', () => {
    for (const language of APP_LANGUAGES) {
      for (const id of ALBUM_IDS) {
        const text = MESSAGES[language].ui.gestures.albums[id];
        expect(text.title.length).toBeGreaterThan(0);
        expect(text.does.length).toBeGreaterThan(0);
        expect(text.how.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('hand clips', () => {
  const clips: ClipId[] = ['idle', ...ALBUM_IDS];

  it.each(clips.map((id) => [id] as const))('%s fits the unit square with a visible hand', (id) => {
    const clip = handClip(id);
    expect(clip.frameCount).toBeGreaterThan(10);
    expect(clip.points).toHaveLength(clip.frameCount * 42);
    const visible = clip.points.filter((value) => !Number.isNaN(value));
    expect(visible.length).toBeGreaterThan(0);
    for (const value of visible) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('shows a pinch in the pinch clips and none in the open palm', () => {
    expect(handClip('pinch').pinch).toContain(1);
    expect(handClip('volume-knob').pinch).toContain(1);
    expect(handClip('open-palm').pinch).not.toContain(1);
  });

  it('joins every landmark into the skeleton', () => {
    const joined = new Set(HAND_BONES.flat());
    for (let i = 0; i < 21; i++) expect(joined.has(i)).toBe(true);
    expect(FINGERTIPS).toEqual([4, 8, 12, 16, 20]);
  });
});

describe('voice examples', () => {
  it.each(APP_LANGUAGES.map((language) => [language] as const))('in %s all plan with the rule parser', async (language) => {
    const ui = MESSAGES[language].ui;
    const examples = [...Object.values(ui.voice.examples).flat(), ui.tour.voice.sample];
    const failed: string[] = [];
    for (const text of examples) {
      const outcome = await planner.plan({ text, locale: SPEECH_LOCALES[language] });
      if (outcome.status !== 'planned') failed.push(`${text} (${outcome.status})`);
    }
    expect(failed).toEqual([]);
  });

  it.each(APP_LANGUAGES.map((language) => [language] as const))('in %s keep the confirmation for messages', async (language) => {
    for (const text of MESSAGES[language].ui.voice.examples.messages) {
      const outcome = await planner.plan({ text, locale: SPEECH_LOCALES[language] });
      expect(outcome.status === 'planned' && outcome.plan.needsConfirmation).toBe(true);
    }
  });
});
