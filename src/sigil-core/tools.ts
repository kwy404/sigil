import { z } from 'zod';

import { APP_PLACES, DirectionSchema, GLOBAL_ACTIONS, MEDIA_ACTIONS, SYSTEM_PANELS, VOLUME_STREAMS } from '../app-profiles/schema';

const PercentSchema = z.number().int().min(0).max(100);

/** level comes with set and only with set. */
function levelMatchesAction(args: { action: string; level?: number }): boolean {
  return (args.action === 'set') === (args.level !== undefined);
}

/**
 * The fixed set of intents a language model may call. Each one is expanded
 * into concrete steps by deterministic code (see flows.ts), so the model never
 * decides which control gets tapped.
 */
export const INTENT_TOOLS = {
  open_app: {
    description: 'Open any app installed on the phone, by the name or nickname the user said.',
    args: z.strictObject({
      app: z.string().min(1).describe('App name as the user said it, for example WhatsApp, zap or the calculator.'),
    }),
  },
  close_app: {
    description: 'Close an app: the one named, or the app on screen when no app is named.',
    args: z.strictObject({
      app: z.string().min(1).optional().describe('App to close. Leave empty for the app on screen.'),
    }),
  },
  close_all_apps: {
    description: 'Close every app in recent apps. Sigil asks the user first.',
    args: z.strictObject({}),
  },
  open_place: {
    description: 'Open a place inside an app, such as the Instagram reels, direct messages or the YouTube subscriptions.',
    args: z.strictObject({
      place: z.enum(APP_PLACES),
      app: z.string().min(1).optional().describe('Leave empty to use the usual app for the place.'),
    }),
  },
  open_chat: {
    description: 'Open the chat with one contact in a messaging app, without writing or sending anything.',
    args: z.strictObject({
      contact: z.string().min(1),
      app: z.string().min(1).optional(),
    }),
  },
  set_timer: {
    description: 'Start a countdown timer in the clock app.',
    args: z.strictObject({ seconds: z.number().int().min(1).max(86400) }),
  },
  set_alarm: {
    description: 'Set an alarm in the clock app, which shows it for review. hour is from 0 to 23.',
    args: z.strictObject({
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
    }),
  },
  flashlight: {
    description: 'Turn the flashlight on or off.',
    args: z.strictObject({ on: z.boolean() }),
  },
  open_website: {
    description: 'Open a website in the browser.',
    args: z.strictObject({ url: z.string().min(3).describe('Address as the user said it, for example g1.com.br.') }),
  },
  open_tutorial: {
    description: "Open Sigil's guided tutorial again.",
    args: z.strictObject({}),
  },
  send_message: {
    description:
      'Write a message to one contact in a messaging app. Sigil always asks the user to confirm before sending.',
    args: z.strictObject({
      app: z.string().min(1).optional().describe('Messaging app. Leave empty to use the default one.'),
      contact: z.string().min(1).describe('One contact name, exactly as the user said it.'),
      text: z.string().min(1).describe('The message text, in the language the user used.'),
    }),
  },
  search: {
    description: 'Search for something in an app, or on the web when no app is named.',
    args: z.strictObject({
      app: z.string().min(1).optional(),
      query: z.string().min(1),
    }),
  },
  scroll: {
    description: 'Scroll the current screen. down shows what is below.',
    args: z.strictObject({ direction: DirectionSchema }),
  },
  navigate: {
    description:
      'A system navigation action such as back, home, recent apps, the previous app, split screen, the notifications or the power menu.',
    args: z.strictObject({ action: z.enum(GLOBAL_ACTIONS) }),
  },
  tap: {
    description: 'Tap the control with this visible label in the current app.',
    args: z.strictObject({ label: z.string().min(1) }),
  },
  type_text: {
    description: 'Type text into the field that has focus.',
    args: z.strictObject({ text: z.string().min(1) }),
  },
  media: {
    description: 'Control the media that is playing in any app: play, pause, next or previous.',
    args: z.strictObject({ action: z.enum(MEDIA_ACTIONS) }),
  },
  seek: {
    description: 'Skip forward or back in the media that is playing.',
    args: z.strictObject({
      direction: z.enum(['forward', 'back']),
      seconds: z.number().int().min(1).max(3600),
    }),
  },
  playback_speed: {
    description: 'Set the playback speed of the media that is playing. 1 is the normal speed.',
    args: z.strictObject({ rate: z.number().min(0.25).max(4) }),
  },
  like: {
    description: 'Like the post or video on screen, once.',
    args: z.strictObject({
      app: z.string().min(1).optional().describe('App that shows the post or video. Leave empty for the app on screen.'),
    }),
  },
  volume: {
    description:
      'Change the volume. stream defaults to media; use ring or alarm only when the user names them. level is a percent and only goes with set.',
    args: z
      .strictObject({
        action: z.enum(['up', 'down', 'set', 'mute', 'unmute']),
        level: PercentSchema.optional(),
        stream: z.enum(VOLUME_STREAMS).optional(),
      })
      .refine(levelMatchesAction, { message: 'level goes with set, and set needs a level.', path: ['level'] }),
  },
  brightness: {
    description: 'Change the screen brightness. level is a percent and only goes with set.',
    args: z
      .strictObject({
        action: z.enum(['up', 'down', 'set']),
        level: PercentSchema.optional(),
      })
      .refine(levelMatchesAction, { message: 'level goes with set, and set needs a level.', path: ['level'] }),
  },
  settings_panel: {
    description:
      'Open the system panel for Wi-Fi, Bluetooth or Do Not Disturb. Android does not let apps switch them, so the user flips the switch there.',
    args: z.strictObject({ panel: z.enum(SYSTEM_PANELS) }),
  },
  control_sphere: {
    description: "Open or close the Control Sphere, Sigil's own hub.",
    args: z.strictObject({ action: z.enum(['open', 'close']) }),
  },
  create_post: {
    description:
      'Start a new post with a caption. The user picks the photo or video, and Sigil asks for confirmation before sharing.',
    args: z.strictObject({
      app: z.string().min(1),
      caption: z.string().min(1),
    }),
  },
  clarify: {
    description: 'Ask the user one short question when the request is ambiguous or incomplete.',
    args: z.strictObject({ question: z.string().min(1) }),
  },
} as const;

export type ToolName = keyof typeof INTENT_TOOLS;

export const TOOL_NAMES = Object.keys(INTENT_TOOLS) as ToolName[];

export type IntentArgs<K extends ToolName> = z.infer<(typeof INTENT_TOOLS)[K]['args']>;

/** A validated call to one of the intent tools. */
export type Intent = { [K in ToolName]: { tool: K; args: IntentArgs<K> } }[ToolName];

/** Tool definition in the JSON schema function shape most chat templates expect. */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: ToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

let cachedDefinitions: ToolDefinition[] | null = null;

export function toolDefinitions(): ToolDefinition[] {
  cachedDefinitions ??= TOOL_NAMES.map((name) => {
    const { $schema: _ignored, ...parameters } = z.toJSONSchema(INTENT_TOOLS[name].args) as Record<string, unknown>;
    return {
      type: 'function' as const,
      function: { name, description: INTENT_TOOLS[name].description, parameters },
    };
  });
  return cachedDefinitions;
}

/** A tool call as a model returns it. arguments may be an object or a JSON string. */
export interface RawToolCall {
  name: string;
  arguments: unknown;
}

export type ToolCallResult = { ok: true; intent: Intent } | { ok: false; error: string };

export function isToolName(name: string): name is ToolName {
  return Object.prototype.hasOwnProperty.call(INTENT_TOOLS, name);
}

/** Validates a raw tool call against the fixed tool set. */
export function parseToolCall(call: RawToolCall): ToolCallResult {
  if (!isToolName(call.name)) {
    return { ok: false, error: `Unknown tool "${call.name}".` };
  }
  let args = call.arguments;
  if (typeof args === 'string') {
    try {
      args = JSON.parse(args);
    } catch {
      return { ok: false, error: `Arguments of ${call.name} are not valid JSON.` };
    }
  }
  const parsed = INTENT_TOOLS[call.name].args.safeParse(args ?? {});
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`).join('; ');
    return { ok: false, error: `Invalid arguments for ${call.name}: ${detail}` };
  }
  return { ok: true, intent: { tool: call.name, args: parsed.data } as Intent };
}
