import { JEV_ROUTING_QUESTION_DEFINITION, TYPESAFE_MODEL } from './jev-routing-types.js';

export interface JevStatePayload {
  readonly callerInput: string;
  readonly language: 'pt-BR';
  readonly channel: 'phone';
}

export interface JevRequestPayload {
  readonly model: typeof TYPESAFE_MODEL;
  readonly state: JevStatePayload;
  readonly questions: {
    readonly [questionId: string]: {
      readonly type: 'choice';
      readonly instructions: string;
      readonly criteria: {
        readonly DETERMINISTIC_CANDIDATE: string;
        readonly GENERATIVE_REQUIRED: string;
        readonly SECURITY_ESCALATE: string;
      };
    };
  };
}

export function buildJevRoutingPayload(syntheticCallerInput: string): JevRequestPayload {
  return {
    model: TYPESAFE_MODEL,
    state: {
      callerInput: syntheticCallerInput,
      language: 'pt-BR',
      channel: 'phone',
    },
    questions: {
      [JEV_ROUTING_QUESTION_DEFINITION.questionId]: {
        type: JEV_ROUTING_QUESTION_DEFINITION.type,
        instructions: JEV_ROUTING_QUESTION_DEFINITION.instructions,
        criteria: JEV_ROUTING_QUESTION_DEFINITION.criteria,
      },
    },
  };
}
