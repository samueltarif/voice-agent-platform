import type { ToolDefinition, ToolRegistryPort } from '@voice-agent/contracts';

export class DuplicateToolRegistrationError extends Error {
  constructor(toolName: string) {
    super(`Tool '${toolName}' is already registered in this tool registry`);
    this.name = 'DuplicateToolRegistrationError';
  }
}

export class InMemoryToolRegistry implements ToolRegistryPort {
  private readonly tools = new Map<string, ToolDefinition<unknown, unknown>>();

  registerTool<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    if (!tool || typeof tool.name !== 'string' || tool.name.trim().length === 0) {
      throw new Error('Tool must have a non-empty canonical name');
    }
    const normalizedName = tool.name.trim();
    if (this.tools.has(normalizedName)) {
      throw new DuplicateToolRegistrationError(normalizedName);
    }
    this.tools.set(normalizedName, tool as unknown as ToolDefinition<unknown, unknown>);
  }

  getTool(name: string): ToolDefinition<unknown, unknown> | undefined {
    if (typeof name !== 'string') {
      return undefined;
    }
    return this.tools.get(name.trim());
  }

  hasTool(name: string): boolean {
    if (typeof name !== 'string') {
      return false;
    }
    return this.tools.has(name.trim());
  }

  listToolNames(): ReadonlyArray<string> {
    return Array.from(this.tools.keys());
  }
}
