import type { Logger } from '@voice-agent/logger';
import type {
  AgentRepository,
  AgentVersionRepository,
  AgentLifecycleService,
  AgentDraftService,
  AgentDraftDiscardService,
  AgentPublicationService,
  MembershipRepository,
  OrganizationRepository,
} from '@voice-agent/database';
import type { ServiceAssertionVerifier } from '../auth/service-assertion-verifier.js';

export interface ApiDependencies {
  readonly logger: Logger;
  readonly verifier: ServiceAssertionVerifier;
  readonly agentRepo: AgentRepository;
  readonly versionRepo: AgentVersionRepository;
  readonly lifecycleService: AgentLifecycleService;
  readonly draftService: AgentDraftService;
  readonly discardService: AgentDraftDiscardService;
  readonly publicationService: AgentPublicationService;
  readonly membershipRepo: MembershipRepository;
  readonly organizationRepo: OrganizationRepository;
}
