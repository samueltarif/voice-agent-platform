import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionRejected,
  ToolExecutionResult,
  ToolInvocation,
  ToolPort,
  ToolRegistryPort,
} from '@voice-agent/contracts';
import { createNullLogger, type Logger } from '@voice-agent/logger';
import { buildSafeLogContext } from './build-safe-log-context.js';

export interface ToolExecutionEngineDependencies {
  readonly registry: ToolRegistryPort;
  readonly logger?: Logger | undefined;
  readonly isToolAllowed?:
    ((toolName: string, context: ToolExecutionContext) => boolean | undefined) | undefined;
}

interface HandlerExecutionInput {
  readonly tool: ToolDefinition<unknown, unknown>;
  readonly data: unknown;
  readonly invocation: ToolInvocation;
  readonly context: ToolExecutionContext;
}

export class ToolExecutionEngine implements ToolPort {
  private readonly registry: ToolRegistryPort;
  private readonly logger: Logger;
  private readonly isToolAllowed:
    ((toolName: string, context: ToolExecutionContext) => boolean | undefined) | undefined;

  constructor(deps: ToolExecutionEngineDependencies) {
    this.registry = deps.registry;
    this.logger = deps.logger ?? createNullLogger();
    this.isToolAllowed = deps.isToolAllowed;
  }

  private resolveRegisteredTool(
    invocation: ToolInvocation,
    context: ToolExecutionContext,
  ): { tool: ToolDefinition<unknown, unknown>; toolName: string } | ToolExecutionRejected {
    if (
      !invocation ||
      typeof invocation.toolName !== 'string' ||
      invocation.toolName.trim().length === 0
    ) {
      return {
        status: 'REJECTED',
        toolName: invocation?.toolName ?? 'unknown',
        invocationId: invocation?.invocationId,
        reason: 'UNKNOWN_TOOL',
        message: 'Invalid invocation: tool name is missing or empty',
      };
    }
    const toolName = invocation.toolName.trim();
    const tool = this.registry.getTool(toolName);
    if (!tool) {
      this.logger.warn('tool.execution.unknown_tool', buildSafeLogContext(toolName, context));
      return {
        status: 'REJECTED',
        toolName,
        invocationId: invocation.invocationId,
        reason: 'UNKNOWN_TOOL',
        message: `Tool '${toolName}' is not registered`,
      };
    }
    return { tool, toolName };
  }

  private checkToolAuthorization(
    toolName: string,
    invocation: ToolInvocation,
    context: ToolExecutionContext,
  ): ToolExecutionRejected | null {
    if (this.isToolAllowed !== undefined && this.isToolAllowed(toolName, context) === false) {
      this.logger.warn('tool.execution.unauthorized_tool', buildSafeLogContext(toolName, context));
      return {
        status: 'REJECTED',
        toolName,
        invocationId: invocation.invocationId,
        reason: 'UNAUTHORIZED_TOOL',
        message: `Tool '${toolName}' is not authorized for this context`,
      };
    }
    return null;
  }

  private validateArguments(
    tool: ToolDefinition<unknown, unknown>,
    invocation: ToolInvocation,
    context: ToolExecutionContext,
  ): { data: unknown } | ToolExecutionRejected {
    const validation = tool.validateInput(invocation.rawArguments);
    if (!validation.success) {
      this.logger.warn('tool.execution.invalid_arguments', buildSafeLogContext(tool.name, context));
      return {
        status: 'REJECTED',
        toolName: tool.name,
        invocationId: invocation.invocationId,
        reason: 'INVALID_ARGUMENTS',
        message: validation.error,
      };
    }
    return { data: validation.data };
  }

  private async executeHandler(params: HandlerExecutionInput): Promise<ToolExecutionResult> {
    const { tool, data, invocation, context } = params;
    try {
      this.logger.info('tool.execution.invoking', buildSafeLogContext(tool.name, context));
      const output = await tool.execute(data, context);
      return {
        status: 'SUCCESS',
        toolName: tool.name,
        invocationId: invocation.invocationId,
        output,
      };
    } catch (err) {
      this.logger.error(
        'tool.execution.failed',
        buildSafeLogContext(tool.name, context, {
          errorType: err instanceof Error ? err.name : typeof err,
        }),
      );
      return {
        status: 'FAILED',
        toolName: tool.name,
        invocationId: invocation.invocationId,
        reason: 'EXECUTION_FAILED',
        message: 'Tool execution failed',
      };
    }
  }

  async executeTool(
    invocation: ToolInvocation,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const resolved = this.resolveRegisteredTool(invocation, context);
    if ('status' in resolved) return resolved;

    const authRejection = this.checkToolAuthorization(resolved.toolName, invocation, context);
    if (authRejection) return authRejection;

    const validatedArgs = this.validateArguments(resolved.tool, invocation, context);
    if ('status' in validatedArgs) return validatedArgs;

    return this.executeHandler({
      tool: resolved.tool,
      data: validatedArgs.data,
      invocation,
      context,
    });
  }
}
