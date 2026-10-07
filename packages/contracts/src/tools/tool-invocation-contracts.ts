import type { AgentConfigurationSnapshotV1 } from '../agents/agent-configuration-v1.js';

export interface ToolInvocation {
  readonly toolName: string;
  readonly invocationId?: string | undefined;
  readonly rawArguments?: unknown;
}

export interface ToolExecutionContext {
  readonly organizationId: string;
  readonly agentId?: string | undefined;
  readonly agentVersionId?: string | undefined;
  readonly callId?: string | undefined;
  readonly turnId?: string | undefined;
  readonly correlationId?: string | undefined;
  readonly snapshot?: AgentConfigurationSnapshotV1 | undefined;
}

export type ToolExecutionStatus = 'SUCCESS' | 'REJECTED' | 'FAILED';

export type ToolRejectionReason = 'UNKNOWN_TOOL' | 'INVALID_ARGUMENTS' | 'UNAUTHORIZED_TOOL';

export type ToolFailureReason = 'EXECUTION_FAILED' | 'TIMEOUT';

export interface ToolExecutionSuccess<TOutput = unknown> {
  readonly status: 'SUCCESS';
  readonly toolName: string;
  readonly invocationId?: string | undefined;
  readonly output: TOutput;
}

export interface ToolExecutionRejected {
  readonly status: 'REJECTED';
  readonly toolName: string;
  readonly invocationId?: string | undefined;
  readonly reason: ToolRejectionReason;
  readonly message: string;
}

export interface ToolExecutionFailed {
  readonly status: 'FAILED';
  readonly toolName: string;
  readonly invocationId?: string | undefined;
  readonly reason: ToolFailureReason;
  readonly message: string;
}

export type ToolExecutionResult<TOutput = unknown> =
  ToolExecutionSuccess<TOutput> | ToolExecutionRejected | ToolExecutionFailed;
