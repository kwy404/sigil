import type { ProfileRegistry } from '../app-profiles/registry';
import type { ProfileAction } from '../app-profiles/schema';
import type { GestureKey } from '../gesture-engine/gestures';
import type { Notice } from '../sigil-core/notices';
import type { Plan } from '../sigil-core/planner';
import type { PlanStep, StepTarget } from '../sigil-core/steps';
import type { NumberFormatter } from './format';
import type { Messages } from './messages';

/** What the describers need: the messages, number formatting and translated app names. */
export interface DescribeContext {
  m: Messages;
  format: NumberFormatter;
  /** Display name of an app profile id, translated for generic names such as Settings. Unknown ids come back as given. */
  appName: (appId: string) => string;
}

export function appNameResolver(profiles: ProfileRegistry, m: Messages): (appId: string) => string {
  return (appId) => {
    const profile = profiles.get(appId);
    return profile ? (m.profiles.names[profile.id] ?? profile.name) : appId;
  };
}

export function describeGesture(key: GestureKey, m: Messages): string {
  return m.gestures[key];
}

export function describeAction(action: ProfileAction, ctx: DescribeContext): string {
  const { m } = ctx;
  switch (action.type) {
    case 'tap':
      return m.actions.tap;
    case 'double_tap':
      return m.actions.doubleTap;
    case 'long_press':
      return m.actions.longPress;
    case 'drag':
      return m.actions.drag;
    case 'scroll':
      return m.actions.scroll[action.direction];
    case 'swipe':
      return action.origin === 'cursor' ? m.actions.swipeFromCursor[action.direction] : m.actions.swipe[action.direction];
    case 'global':
      return m.actions.global[action.action];
    case 'media':
      return m.actions.media[action.action];
    case 'volume':
      return m.actions.volume[action.direction];
    case 'brightness':
      return m.actions.brightness[action.direction];
    case 'open_app':
      return m.actions.openApp(ctx.appName(action.app));
    case 'sphere':
      return m.actions.sphere[action.action];
    case 'voice':
      return m.actions.listen;
    case 'cursor':
      return m.actions.cursor[action.action];
    case 'pause':
      return m.actions.pauseGestures;
    case 'none':
      return m.actions.none;
  }
}

export function describeTarget(target: StepTarget, ctx: DescribeContext): string {
  const { m } = ctx;
  switch (target.by) {
    case 'selector':
      return m.targets.selectors[target.name] ?? target.name;
    case 'text':
      return m.quote(target.value);
    case 'description':
      return m.targets.control(target.value);
    case 'focused':
      return m.targets.focused;
  }
}

/** The app a plan works in: the one its first step opens, or the one its taps target. */
function planApp(plan: Plan, ctx: DescribeContext): string {
  for (const step of plan.steps) {
    if (step.kind === 'open_app') return ctx.appName(step.app);
    if ((step.kind === 'tap' || step.kind === 'find') && step.target.by === 'selector') return ctx.appName(step.target.app);
  }
  return '';
}

/** The question of a confirm step, rebuilt from the plan so it reads in the app language. */
export function describeConfirmation(plan: Plan, index: number, ctx: DescribeContext): string {
  const step = plan.steps[index];
  if (step?.kind !== 'confirm') {
    return '';
  }
  const { m } = ctx;
  const { intent } = plan;
  if (step.reason === 'send' && intent.tool === 'send_message') {
    return m.confirm.send(intent.args.text, intent.args.contact, planApp(plan, ctx));
  }
  if (step.reason === 'post' && intent.tool === 'create_post') {
    return m.confirm.post(planApp(plan, ctx), intent.args.caption);
  }
  const next = plan.steps[index + 1];
  return next?.kind === 'tap' ? m.confirm.tap(describeTarget(next.target, ctx)) : step.summary;
}

/** One line for a step. Confirm steps need the plan to be translated; without it they keep the core's text. */
export function describeStep(step: PlanStep, ctx: DescribeContext, plan?: Plan, index?: number): string {
  const { m, format } = ctx;
  switch (step.kind) {
    case 'open_app':
      return m.steps.open(ctx.appName(step.app));
    case 'wait':
      return 'app' in step.until ? m.steps.waitApp(ctx.appName(step.until.app)) : m.steps.waitFor(describeTarget(step.until.target, ctx));
    case 'find':
      return (step.scroll ? m.steps.findScrolling : m.steps.find)(describeTarget(step.target, ctx));
    case 'tap':
      return m.steps.tap(describeTarget(step.target, ctx));
    case 'type':
      return (step.submit ? m.steps.typeSubmit : m.steps.type)(step.text);
    case 'scroll':
      return m.actions.scroll[step.direction];
    case 'navigate':
      return m.actions.global[step.action];
    case 'media':
      return m.actions.media[step.action];
    case 'seek':
      return step.seconds >= 0 ? m.steps.seekForward(step.seconds) : m.steps.seekBack(-step.seconds);
    case 'speed':
      return m.steps.speed(format.number(step.rate));
    case 'volume':
      return step.action === 'set'
        ? m.steps.volume[step.stream].set(format.percent(step.level ?? 0))
        : m.steps.volume[step.stream][step.action];
    case 'brightness':
      return step.action === 'set' ? m.steps.brightness.set(format.percent(step.level ?? 0)) : m.steps.brightness[step.action];
    case 'panel':
      return m.steps.panel[step.panel];
    case 'sphere':
      return m.steps.sphere[step.action];
    case 'confirm':
      return m.steps.ask(plan && index !== undefined ? describeConfirmation(plan, index, ctx) : step.summary);
  }
}

/** One line for a whole plan, in the app language. */
export function describePlan(plan: Plan, ctx: DescribeContext): string {
  const { m } = ctx;
  const { intent } = plan;
  switch (intent.tool) {
    case 'open_app':
      return m.plan.open(planApp(plan, ctx) || intent.args.app);
    case 'send_message':
      return m.plan.send(intent.args.text, intent.args.contact, planApp(plan, ctx));
    case 'search':
      return m.plan.search(intent.args.query, planApp(plan, ctx));
    case 'create_post':
      return m.plan.post(planApp(plan, ctx), intent.args.caption);
    case 'tap':
      return m.plan.tap(intent.args.label);
    case 'type_text':
      return m.plan.type(intent.args.text);
    case 'like':
      return m.plan.like(planApp(plan, ctx));
    default:
      return plan.steps[0] ? describeStep(plan.steps[0], ctx, plan, 0) : plan.summary;
  }
}

export function describeNotice(notice: Notice, ctx: DescribeContext): string {
  const { m } = ctx;
  switch (notice.code) {
    case 'nothing_heard':
      return m.notices.nothing_heard();
    case 'not_understood':
      return m.notices.not_understood();
    case 'bulk':
      return m.notices.bulk();
    case 'several_people':
      return m.notices.several_people();
    case 'too_many_commits':
      return m.notices.too_many_commits(notice.count, notice.limit);
    case 'unknown_app':
      return m.notices.unknown_app(notice.app);
    case 'cannot_send':
      return m.notices.cannot_send(ctx.appName(notice.appId));
    case 'cannot_find_contacts':
      return m.notices.cannot_find_contacts(ctx.appName(notice.appId));
    case 'cannot_search':
      return m.notices.cannot_search(ctx.appName(notice.appId));
    case 'cannot_post':
      return m.notices.cannot_post(ctx.appName(notice.appId));
    case 'cannot_like':
      return m.notices.cannot_like(ctx.appName(notice.appId));
    case 'like_needs_app':
      return m.notices.like_needs_app();
    case 'question':
      return notice.question;
  }
}
