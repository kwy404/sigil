import type { ProfileRegistry } from '../app-profiles/registry';
import { foldText } from '../app-profiles/text';
import { describeTarget, type PlanStep } from './steps';

/** Words that mark a control as one that sends, posts, calls, pays, deletes or changes something. */
const SENSITIVE_WORDS = new Set(
  [
    'send',
    'enviar',
    'envia',
    'post',
    'postar',
    'publish',
    'publicar',
    'share',
    'compartilhar',
    'call',
    'ligar',
    'delete',
    'excluir',
    'apagar',
    'remove',
    'remover',
    'pay',
    'pagar',
    'buy',
    'comprar',
    'purchase',
    'order',
    'checkout',
    'subscribe',
    'assinar',
    'transfer',
    'transferir',
    'confirm',
    'confirmar',
    'uninstall',
    'desinstalar',
  ].map(foldText),
);

/** Requests that ask for repeated or mass actions. Sigil acts once, for one person, per request. */
const BULK_PATTERNS: RegExp[] = [
  /\b(?:all|every|each)\s+(?:of\s+)?(?:my\s+|the\s+)?(?:contacts|friends|followers|following|groups|chats|people|users|posts|photos|videos|comments|messages)\b/i,
  /\b(?:everyone|everybody)\b/i,
  /(?:^|\s)(?:todos|todas)\s+(?:os\s+|as\s+)?(?:meus\s+|minhas\s+)?(?:contatos|amigos|seguidores|grupos|conversas|pessoas|posts|fotos|v[ií]deos|coment[aá]rios|mensagens)(?:\s|$)/iu,
  /(?:^|\s)todo mundo(?:\s|$)/iu,
  /\b\d+\s*(?:times|x)\b/i,
  /(?:^|\s)\d+\s*vezes(?:\s|$)/iu,
  /\b(?:every|each)\s+(?:\d+\s+)?(?:second|minute|hour|day|morning|night)s?\b/i,
  /(?:^|\s)(?:a cada|todo|toda)\s+(?:\d+\s+)?(?:segundo|minuto|hora|dia|manh[aã]|noite)s?(?:\s|$)/iu,
  /\b(?:spam|bulk|mass\s+\w+|auto\s*like|auto\s*follow)\b/i,
  /(?:^|\s)em massa(?:\s|$)/iu,
];

export function isSensitiveLabel(label: string): boolean {
  return foldText(label)
    .split(/[^a-z0-9]+/)
    .some((word) => SENSITIVE_WORDS.has(word));
}

/** True when a contact string names more than one person. */
export function namesSeveralPeople(contact: string): boolean {
  return /,|\s(?:and|e|&)\s/iu.test(contact);
}

export type PolicyResult = { ok: true; steps: PlanStep[]; commits: number } | { ok: false; reason: string };

export interface PolicyOptions {
  /** Most commit steps (send, post, share) a single plan may contain. */
  maxCommitsPerPlan?: number;
}

/**
 * Decides which steps need the user's explicit confirmation and refuses plans
 * that would automate in bulk. The planner applies it to every plan, and the
 * executor checks it again before running, so a plan built by hand cannot skip
 * it either.
 */
export class ConfirmationPolicy {
  readonly maxCommitsPerPlan: number;

  constructor(
    private readonly profiles: ProfileRegistry,
    options: PolicyOptions = {},
  ) {
    this.maxCommitsPerPlan = options.maxCommitsPerPlan ?? 1;
  }

  /** Returns why a request is refused, or null when it may be planned. */
  screenRequest(text: string): string | null {
    if (BULK_PATTERNS.some((pattern) => pattern.test(text))) {
      return 'Sigil acts once per request, for one person, while you watch. It does not repeat actions, message many people or follow and like in bulk.';
    }
    return null;
  }

  /** True when tapping this step's target sends, posts, pays or changes something. */
  isCommit(step: PlanStep): boolean {
    if (step.kind !== 'tap') {
      return false;
    }
    if (step.commit) {
      return true;
    }
    const target = step.target;
    switch (target.by) {
      case 'selector':
        return this.profiles.selector(target.app, target.name)?.commit === true || isSensitiveLabel(target.name);
      case 'text':
      case 'description':
        return isSensitiveLabel(target.value);
      case 'focused':
        return false;
    }
  }

  /** Marks commit steps, inserts a confirmation before each one and enforces the per plan limit. */
  apply(steps: readonly PlanStep[]): PolicyResult {
    const out: PlanStep[] = [];
    let commits = 0;
    for (const step of steps) {
      if (step.kind === 'tap' && this.isCommit(step)) {
        commits++;
        const previous = out[out.length - 1];
        if (!previous || previous.kind !== 'confirm') {
          out.push({ kind: 'confirm', summary: `Tap ${describeTarget(step.target)}?`, reason: 'commit' });
        }
        out.push({ ...step, commit: true });
      } else {
        out.push(step);
      }
    }
    if (commits > this.maxCommitsPerPlan) {
      return {
        ok: false,
        reason: `This plan would send or post ${commits} times. Sigil does at most ${this.maxCommitsPerPlan} per request.`,
      };
    }
    return { ok: true, steps: out, commits };
  }

  /** Returns a problem with a plan about to run, or null when every commit is guarded. */
  check(steps: readonly PlanStep[]): string | null {
    let commits = 0;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step.kind === 'tap' && this.isCommit(step)) {
        commits++;
        if (i === 0 || steps[i - 1].kind !== 'confirm') {
          return `Step ${i + 1} sends or posts without a confirmation right before it.`;
        }
      }
    }
    if (commits > this.maxCommitsPerPlan) {
      return `The plan contains ${commits} sends or posts. The limit is ${this.maxCommitsPerPlan}.`;
    }
    return null;
  }
}
