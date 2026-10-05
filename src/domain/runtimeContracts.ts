import type { Condition, ID, PresentationConditionResult, RuntimeState, ScenarioException, TargetScope, Tick, Transition, TypedValue, Validity } from './types';

/** A scoped exception is an authored rule, never a free-text effect override. */
export interface ScopedTransition extends Transition { exceptionDetails?: ScenarioException | null }
export interface RuntimeExclusion {
  variableId: ID;
  value: TypedValue;
  otherValue: TypedValue;
  reason: string;
  exceptions?: ScenarioException[] | null;
}
export interface RuntimeRuleContext {
  projectId: ID;
  contentVersionId: ID;
  graphId?: ID;
  chapterId?: ID;
  worldTick?: Tick;
}

/** This is a committed presentation, with conditions observed before its effects. */
export interface PresentationOccurrence {
  entityId: ID;
  occurrenceId: string;
  before: RuntimeState;
  after: RuntimeState;
  conditionResults: PresentationConditionResult[];
  externalValues?: Record<ID, TypedValue>;
  worldTick?: Tick;
}
export interface ReadingPath {
  chapterIds: ID[];
  /** Repeated scenes are distinct occurrences and must not be deduplicated. */
  sceneIds: ID[];
  occurrences: PresentationOccurrence[];
}
export interface ActualExternalInput {
  values: Record<ID, TypedValue>;
  mode: 'actual';
  receiptHash: string;
}
export interface RuntimeVariableExtensions { exclusions?: RuntimeExclusion[] | null }
export interface RuntimeForeshadowExtensions { alternativeInfo?: Record<ID, ID[]> | null }
export interface RuntimeDialogueExtensions {
  claimAssertionIds?: ID[] | null;
  assertionIntent?: 'statement' | 'lie' | 'misunderstanding' | 'quotation' | null;
  assertionReason?: string | null;
}
export interface RuntimeReuseExtensions { idMap?: Record<ID, ID> | null }
export interface RuntimeTraceExtensions { mode?: 'flow' | 'chapters' | null; readingPath?: ReadingPath | null }
export interface RuntimeCollectionExtensions { purpose?: 'regression' | null }
export interface ScopedRuleInput { targetScope: TargetScope; validity: Validity; reason: string; evidenceIds: ID[] }
export interface StateRuleEvaluation {
  value: 'true' | 'false' | 'unknown';
  reasons: string[];
}
export type EvaluateStateRule = (condition: Condition, state: RuntimeState) => StateRuleEvaluation;
