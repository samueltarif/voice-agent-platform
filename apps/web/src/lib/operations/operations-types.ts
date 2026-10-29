import type {
  CampaignProgress,
  ContactImportRowRejection,
  ContactSuppressionReason,
  OutboundCampaignResponse,
} from '@voice-agent/contracts';

/** Formas JSON devolvidas pelo BFF de operações (somente tipos; sem runtime). */
export interface ContactListSummary {
  readonly id: string;
  readonly name: string;
  readonly createdAt?: string | undefined;
}

export interface ContactListMember {
  readonly contactId: string;
  readonly phoneE164: string;
  readonly displayName: string | null;
  readonly suppressed: boolean;
}

export interface ContactSuppressionView {
  readonly phoneE164: string;
  readonly reason: ContactSuppressionReason;
  readonly evidenceReference: string | null;
  readonly createdAt: string;
}

export interface ContactImportReport {
  readonly created: number;
  readonly existing: number;
  readonly addedToList: number;
  readonly suppressed: number;
  readonly rejected: readonly {
    readonly rowNumber: number;
    readonly reason: ContactImportRowRejection;
  }[];
  readonly rejectedRowsCsv: string;
}

export interface CampaignAudienceView {
  readonly contactListId: string;
  readonly scheduledStartAt: string | null;
}

export interface CampaignDetailView {
  readonly campaign: OutboundCampaignResponse;
  readonly progress: CampaignProgress;
  readonly audience: CampaignAudienceView | null;
}
