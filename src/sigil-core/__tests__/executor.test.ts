import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import {
  ActionPlanner,
  nodeMatches,
  PlanExecutor,
  type AppLaunch,
  type BrightnessCommand,
  type Clock,
  type ConfirmationRequest,
  type ControlResult,
  type DeviceController,
  type NodeQuery,
  type Plan,
  type PlanStep,
  type StepEvent,
  type UiNode,
  type VolumeCommand,
} from '..';

const profiles = ProfileRegistry.withBuiltins();
const planner = new ActionPlanner({ profiles });

class FakeClock implements Clock {
  t = 0;
  now(): number {
    return this.t;
  }
  async sleep(ms: number): Promise<void> {
    this.t += ms;
  }
}

function node(id: string, extra: Partial<UiNode>): UiNode {
  return {
    id,
    bounds: { left: 0, top: 0, right: 100, bottom: 40 },
    clickable: true,
    editable: false,
    focused: false,
    ...extra,
  };
}

/** A tiny model of WhatsApp: chat list, search, one contact and a chat screen. */
class FakeWhatsApp implements DeviceController {
  readonly systemWide = true;
  foreground: string | null = 'com.android.launcher';
  screen: 'none' | 'chats' | 'search' | 'chat' = 'none';
  focused: string | null = null;
  searchText = '';
  draft = '';
  sent: string[] = [];
  log: string[] = [];

  async openApp(launch: AppLaunch): Promise<boolean> {
    this.log.push(`open ${launch.packageName}`);
    this.foreground = launch.packageName ?? null;
    this.screen = 'chats';
    return true;
  }

  async foregroundPackage(): Promise<string | null> {
    return this.foreground;
  }

  nodes(): UiNode[] {
    switch (this.screen) {
      case 'chats':
        return [node('search', { resourceId: 'com.whatsapp:id/menuitem_search', description: 'Search' })];
      case 'search':
        return [
          node('searchInput', {
            resourceId: 'com.whatsapp:id/search_input',
            className: 'android.widget.EditText',
            editable: true,
            focused: this.focused === 'searchInput',
          }),
          ...(this.searchText.toLowerCase() === 'ana' ? [node('contact', { text: 'Ana Souza' })] : []),
        ];
      case 'chat':
        return [
          node('entry', {
            resourceId: 'com.whatsapp:id/entry',
            className: 'android.widget.EditText',
            editable: true,
            focused: this.focused === 'entry',
          }),
          node('send', { resourceId: 'com.whatsapp:id/send', description: 'Send' }),
        ];
      default:
        return [];
    }
  }

  async findNode(query: NodeQuery): Promise<UiNode | null> {
    return this.nodes().find((n) => nodeMatches(n, query)) ?? null;
  }

  async tapNode(target: UiNode): Promise<boolean> {
    this.log.push(`tap ${target.id}`);
    if (target.id === 'search') {
      this.screen = 'search';
      this.focused = 'searchInput';
    } else if (target.id === 'contact') {
      this.screen = 'chat';
    } else if (target.id === 'entry') {
      this.focused = 'entry';
    } else if (target.id === 'send') {
      this.sent.push(this.draft);
      this.draft = '';
    }
    return true;
  }

  async typeText(text: string, target: UiNode): Promise<boolean> {
    this.log.push(`type ${text}`);
    if (target.id === 'searchInput') this.searchText = text;
    if (target.id === 'entry') this.draft = text;
    return true;
  }

  async scroll(): Promise<boolean> {
    this.log.push('scroll');
    return true;
  }

  async navigate(): Promise<boolean> {
    return true;
  }

  async media(): Promise<boolean> {
    return true;
  }

  canWriteSettings = true;

  async seek(seconds: number): Promise<ControlResult> {
    this.log.push(`seek ${seconds}`);
    return { ok: true };
  }

  async setSpeed(rate: number): Promise<ControlResult> {
    this.log.push(`speed ${rate}`);
    return { ok: true };
  }

  async volume(command: VolumeCommand): Promise<ControlResult> {
    this.log.push(`volume ${command.stream} ${command.action}${command.level !== undefined ? ` ${command.level}` : ''}`);
    return { ok: true };
  }

  async brightness(command: BrightnessCommand): Promise<ControlResult> {
    if (!this.canWriteSettings) {
      return { ok: false, reason: 'needs_permission', permission: 'write_settings' };
    }
    this.log.push(`brightness ${command.action}${command.level !== undefined ? ` ${command.level}` : ''}`);
    return { ok: true };
  }

  async openPanel(panel: string): Promise<boolean> {
    this.log.push(`panel ${panel}`);
    return true;
  }
}

async function messagePlan(): Promise<Plan> {
  const outcome = await planner.plan({ text: 'send a message to Ana on WhatsApp saying on my way' });
  if (outcome.status !== 'planned') throw new Error(outcome.status);
  return outcome.plan;
}

function executor(device: DeviceController, answer: (r: ConfirmationRequest) => Promise<boolean>, clock = new FakeClock()) {
  const events: StepEvent[] = [];
  const run = new PlanExecutor({ device, profiles, confirm: answer, clock, onStep: (e) => events.push(e) });
  return { run, events };
}

describe('PlanExecutor', () => {
  it('sends the message only after the user confirms', async () => {
    const device = new FakeWhatsApp();
    const asked: string[] = [];
    const { run, events } = executor(device, async (request) => {
      asked.push(request.summary);
      expect(device.sent).toEqual([]);
      return true;
    });
    const result = await run.run(await messagePlan());
    expect(result).toEqual({ status: 'completed', completedSteps: 10 });
    expect(asked).toEqual(['Send "on my way" to Ana on WhatsApp?']);
    expect(device.sent).toEqual(['on my way']);
    expect(device.log).toEqual([
      'open com.whatsapp',
      'tap search',
      'type Ana',
      'tap contact',
      'tap entry',
      'type on my way',
      'tap send',
    ]);
    expect(events.filter((e) => e.status === 'done')).toHaveLength(10);
  });

  it('sends nothing when the user says no', async () => {
    const device = new FakeWhatsApp();
    const { run } = executor(device, async () => false);
    const result = await run.run(await messagePlan());
    expect(result.status).toBe('cancelled');
    expect(result.completedSteps).toBe(8);
    expect(device.sent).toEqual([]);
    expect(device.draft).toBe('on my way');
  });

  it('ignores a yes that comes after the confirmation time limit', async () => {
    const device = new FakeWhatsApp();
    const clock = new FakeClock();
    const late = new PlanExecutor({
      device,
      profiles,
      clock,
      confirmationTtlMs: 30000,
      confirm: async () => {
        clock.t += 45000;
        return true;
      },
    });
    const result = await late.run(await messagePlan());
    expect(result).toMatchObject({ status: 'refused', completedSteps: 8 });
    expect(device.sent).toEqual([]);
  });

  it('refuses a hand built plan that sends without asking', async () => {
    const device = new FakeWhatsApp();
    const plan = await messagePlan();
    const unguarded: Plan = { ...plan, steps: plan.steps.filter((s) => s.kind !== 'confirm') };
    const { run } = executor(device, async () => true);
    const result = await run.run(unguarded);
    expect(result.status).toBe('refused');
    expect(device.log).toEqual([]);
  });

  it('stops when the user cancels', async () => {
    const device = new FakeWhatsApp();
    const controller = new AbortController();
    const plan = await messagePlan();
    const running = new PlanExecutor({
      device,
      profiles,
      clock: new FakeClock(),
      confirm: async () => true,
      onStep: (event) => {
        if (event.index === 2 && event.status === 'done') controller.abort();
      },
    });
    const result = await running.run(plan, controller.signal);
    expect(result).toMatchObject({ status: 'cancelled', completedSteps: 3 });
    expect(device.sent).toEqual([]);
  });

  it('fails cleanly when the app never opens', async () => {
    const device = new FakeWhatsApp();
    device.openApp = async () => true;
    const { run, events } = executor(device, async () => true);
    const result = await run.run(await messagePlan());
    expect(result).toMatchObject({ status: 'failed', completedSteps: 1, message: 'whatsapp did not open.' });
    expect(events[events.length - 1]).toMatchObject({ status: 'failed', index: 1 });
  });

  it('scrolls while looking for a control', async () => {
    const device = new FakeWhatsApp();
    device.screen = 'chats';
    let scrolls = 0;
    device.scroll = async () => {
      scrolls++;
      return true;
    };
    const base = device.findNode.bind(device);
    device.findNode = async (query) => (scrolls >= 2 ? node('follow', { text: 'Follow' }) : base(query));
    const outcome = await planner.plan({ text: 'tap Follow' });
    if (outcome.status !== 'planned') throw new Error(outcome.status);
    const { run } = executor(device, async () => true);
    expect((await run.run(outcome.plan)).status).toBe('completed');
    expect(scrolls).toBe(2);
  });
});

function planOf(steps: PlanStep[]): Plan {
  return {
    request: 'test',
    intent: { tool: 'scroll', args: { direction: 'down' } },
    source: 'rules',
    summary: 'test',
    steps,
    needsConfirmation: false,
  };
}

describe('PlanExecutor with system controls', () => {
  it('runs volume, brightness, seek, speed and panel steps without asking', async () => {
    const device = new FakeWhatsApp();
    let asked = 0;
    const { run } = executor(device, async () => {
      asked++;
      return true;
    });
    const result = await run.run(
      planOf([
        { kind: 'volume', stream: 'media', action: 'set', level: 30 },
        { kind: 'volume', stream: 'alarm', action: 'down' },
        { kind: 'brightness', action: 'up' },
        { kind: 'seek', seconds: -10 },
        { kind: 'speed', rate: 1.5 },
        { kind: 'panel', panel: 'wifi' },
      ]),
    );
    expect(result).toEqual({ status: 'completed', completedSteps: 6 });
    expect(asked).toBe(0);
    expect(device.log).toEqual([
      'volume media set 30',
      'volume alarm down',
      'brightness up',
      'seek -10',
      'speed 1.5',
      'panel wifi',
    ]);
  });

  it('names the special access a step was missing', async () => {
    const device = new FakeWhatsApp();
    device.canWriteSettings = false;
    const { run, events } = executor(device, async () => true);
    const result = await run.run(planOf([{ kind: 'brightness', action: 'set', level: 70 }]));
    expect(result).toMatchObject({ status: 'failed', completedSteps: 0, permission: 'write_settings' });
    expect(events[events.length - 1]).toMatchObject({ status: 'failed', permission: 'write_settings' });
  });

  it('opens the Control Sphere through Sigil interface and fails without one', async () => {
    const opened: string[] = [];
    const withUi = new PlanExecutor({
      device: new FakeWhatsApp(),
      profiles,
      confirm: async () => true,
      clock: new FakeClock(),
      ui: { sphere: (action) => opened.push(action) },
    });
    expect((await withUi.run(planOf([{ kind: 'sphere', action: 'open' }]))).status).toBe('completed');
    expect(opened).toEqual(['open']);
    const { run } = executor(new FakeWhatsApp(), async () => true);
    expect((await run.run(planOf([{ kind: 'sphere', action: 'open' }]))).status).toBe('failed');
  });
});

describe('nodeMatches', () => {
  const field = node('n', { text: 'Ana Souza', resourceId: 'app:id/name', className: 'android.widget.TextView' });

  it('matches by id, text prefix or description, ignoring case and accents', () => {
    expect(nodeMatches(field, { resourceIds: ['app:id/name'] })).toBe(true);
    expect(nodeMatches(field, { texts: ['ana'] })).toBe(true);
    expect(nodeMatches(node('m', { text: 'Mariana' }), { texts: ['ana'] })).toBe(false);
    expect(nodeMatches(node('c', { description: 'Configurações' }), { descriptions: ['configuracoes'] })).toBe(true);
  });

  it('applies class and focus filters', () => {
    expect(nodeMatches(field, { texts: ['Ana'], className: 'android.widget.EditText' })).toBe(false);
    expect(nodeMatches(node('f', { focused: true }), { focused: true })).toBe(true);
    expect(nodeMatches(field, {})).toBe(false);
  });
});
