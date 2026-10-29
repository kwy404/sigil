import { z } from 'zod';

import { GESTURE_KEYS } from '../gesture-engine/gestures';

export const PROFILE_SCHEMA_VERSION = 1;

const ANDROID_PACKAGE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export const DirectionSchema = z.enum(['up', 'down', 'left', 'right']);

export const GLOBAL_ACTIONS = [
  'back',
  'home',
  'recents',
  'notifications',
  'quick_settings',
  'lock_screen',
  'screenshot',
] as const;

export const MEDIA_ACTIONS = ['play_pause', 'next', 'previous'] as const;

export const GestureKeySchema = z.enum(GESTURE_KEYS);

/**
 * What a gesture does inside an app. The set is closed on purpose: a gesture
 * can move, tap, scroll and navigate, but nothing here sends, posts or pays on
 * its own. A tap only lands where the user put the cursor.
 */
export const ProfileActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('tap') }).describe('Tap at the cursor.'),
  z.strictObject({ type: z.literal('double_tap') }).describe('Double tap at the cursor.'),
  z
    .strictObject({
      type: z.literal('long_press'),
      durationMs: z.number().int().min(300).max(3000).optional(),
    })
    .describe('Long press at the cursor.'),
  z
    .strictObject({ type: z.literal('drag') })
    .describe('Press at the cursor and follow it until the pinch opens. Only meaningful on pinch_hold.'),
  z
    .strictObject({ type: z.literal('scroll'), direction: DirectionSchema })
    .describe('Scroll the content. down shows what is below.'),
  z
    .strictObject({
      type: z.literal('swipe'),
      direction: DirectionSchema,
      origin: z.enum(['center', 'cursor']).optional(),
    })
    .describe('A finger swipe across the screen, from its center or from the cursor.'),
  z.strictObject({ type: z.literal('global'), action: z.enum(GLOBAL_ACTIONS) }).describe('A system navigation action.'),
  z.strictObject({ type: z.literal('media'), action: z.enum(MEDIA_ACTIONS) }).describe('A media key.'),
  z.strictObject({ type: z.literal('volume'), direction: z.enum(['up', 'down']) }).describe('Media volume.'),
  z.strictObject({ type: z.literal('open_app'), app: z.string().min(1) }).describe('Open another app by profile id or package.'),
  z.strictObject({ type: z.literal('sphere'), action: z.enum(['toggle', 'open', 'close']) }).describe('The Control Sphere hub.'),
  z.strictObject({ type: z.literal('voice'), action: z.literal('listen') }).describe('Start listening for a voice request.'),
  z.strictObject({ type: z.literal('cursor'), action: z.enum(['toggle', 'recenter']) }).describe('Show, hide or recenter the cursor.'),
  z.strictObject({ type: z.literal('pause') }).describe('Pause or resume gesture control.'),
  z.strictObject({ type: z.literal('none') }).describe('Explicitly do nothing, also hides the inherited binding.'),
]);

/**
 * Finds a control in the active window through the accessibility tree. Every
 * list holds alternatives, so one selector can cover several app versions and
 * languages.
 */
export const SelectorSchema = z
  .strictObject({
    resourceId: z.array(z.string().min(1)).optional(),
    text: z.array(z.string().min(1)).optional(),
    contentDescription: z.array(z.string().min(1)).optional(),
    className: z.string().optional(),
    /** Marks a control that sends, posts, calls, pays or deletes. Plans must confirm before tapping it. */
    commit: z.boolean().optional(),
  })
  .refine((s) => Boolean(s.resourceId?.length || s.text?.length || s.contentDescription?.length), {
    message: 'A selector needs at least one of resourceId, text or contentDescription.',
  });

/** URL templates. {query} and {text} are replaced with URL encoded values. */
export const LinksSchema = z.strictObject({
  launch: z.string().min(3).optional(),
  search: z.string().includes('{query}').optional(),
  compose: z.string().includes('{text}').optional(),
});

export const AppProfileSchema = z.strictObject({
  $schema: z.string().optional(),
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Use lowercase letters, digits and hyphens.'),
  name: z.string().min(1),
  description: z.string().optional(),
  /** Android package names. Empty only for the general profile. */
  packages: z.array(z.string().regex(ANDROID_PACKAGE, 'Not a valid Android package name.')),
  /** Other names people use for the app, matched by voice requests. */
  aliases: z.array(z.string().min(1)).optional(),
  /** Profile whose bindings this one inherits. Defaults to general. */
  extends: z.string().optional(),
  bindings: z.partialRecord(GestureKeySchema, ProfileActionSchema),
  selectors: z.record(z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'Use camelCase names.'), SelectorSchema).optional(),
  links: LinksSchema.optional(),
});

export type AppProfile = z.infer<typeof AppProfileSchema>;
export type ProfileAction = z.infer<typeof ProfileActionSchema>;
export type ProfileActionType = ProfileAction['type'];
export type Selector = z.infer<typeof SelectorSchema>;
export type ProfileLinks = z.infer<typeof LinksSchema>;
export type GlobalAction = (typeof GLOBAL_ACTIONS)[number];
export type MediaAction = (typeof MEDIA_ACTIONS)[number];
