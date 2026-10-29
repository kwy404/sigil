import { useCallback, useMemo, useRef, useState } from 'react';

import type { ProfileRegistry } from '../app-profiles';
import {
  ActionPlanner,
  PlanExecutor,
  type AppChoice,
  type ConfirmationRequest,
  type ExecutionResult,
  type PlanOutcome,
  type SigilInterface,
  type StepEvent,
} from '../sigil-core';
import { foregroundApp, getSystemControl, installedApps, planPlatform } from '../system-control';

export interface PendingConfirmation {
  request: ConfirmationRequest;
  /** Index of the confirm step, to rebuild its question in the app language. */
  index: number;
  answer: (yes: boolean) => void;
}

export interface PlanRunner {
  request: string | null;
  outcome: PlanOutcome | null;
  events: StepEvent[];
  result: ExecutionResult | null;
  confirmation: PendingConfirmation | null;
  running: boolean;
  plan(text: string): Promise<void>;
  /** Plans again with the app picked from the options of a choose outcome. */
  choose(choice: AppChoice): void;
  run(): Promise<void>;
  stop(): void;
}

/**
 * Plans requests against the apps on the phone and runs the plans with the
 * device controller of this build. A confirm step waits for an explicit
 * answer from the screen; the voice and gesture answers come with the voice
 * session.
 */
export function usePlanRunner(registry: ProfileRegistry, ui: SigilInterface, locale: string): PlanRunner {
  const planner = useMemo(
    () => new ActionPlanner({ profiles: registry, installedApps, platform: planPlatform() }),
    [registry],
  );
  const [request, setRequest] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PlanOutcome | null>(null);
  const [events, setEvents] = useState<StepEvent[]>([]);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const plan = useCallback(
    async (text: string) => {
      setRequest(text);
      setEvents([]);
      setResult(null);
      setOutcome(await planner.plan({ text, locale, foregroundPackage: foregroundApp() }));
    },
    [planner, locale],
  );

  const choose = useCallback(
    (choice: AppChoice) => {
      setOutcome((current) => (current?.status === 'choose' ? planner.planChoice(current, choice) : current));
    },
    [planner],
  );

  const run = useCallback(async () => {
    if (outcome?.status !== 'planned' || abort.current) {
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setEvents([]);
    setResult(null);
    const executor = new PlanExecutor({
      device: getSystemControl().device,
      profiles: registry,
      ui,
      confirm: (asked) =>
        new Promise<boolean>((resolve) => {
          const index = asked.plan.steps.findIndex((step) => step.kind === 'confirm' && step.summary === asked.summary);
          setConfirmation({
            request: asked,
            index,
            answer: (yes) => {
              setConfirmation(null);
              resolve(yes);
            },
          });
          controller.signal.addEventListener('abort', () => {
            setConfirmation(null);
            resolve(false);
          });
        }),
      onStep: (event) => setEvents((list) => [...list.filter((entry) => entry.index !== event.index), event]),
    });
    try {
      setResult(await executor.run(outcome.plan, controller.signal));
    } finally {
      abort.current = null;
      setRunning(false);
    }
  }, [outcome, registry, ui]);

  const stop = useCallback(() => abort.current?.abort(), []);

  return { request, outcome, events, result, confirmation, running, plan, choose, run, stop };
}
