import type { ToolDefinition } from './tool-definition-contracts.js';
import type {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolInvocation,
} from './tool-invocation-contracts.js';

export interface ToolPort {
  executeTool(
    invocation: ToolInvocation,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult>;
}

export interface ToolRegistryPort {
  registerTool<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void;
  getTool(name: string): ToolDefinition<unknown, unknown> | undefined;
  hasTool(name: string): boolean;
  listToolNames(): ReadonlyArray<string>;
}
