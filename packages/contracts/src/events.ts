export interface DomainEvent<TPayload = unknown> {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly timestamp: string;
  readonly organizationId?: string;
  readonly correlationId: string;
  readonly payload: TPayload;
}
