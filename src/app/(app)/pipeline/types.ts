export type Stage = { id: string; name: string; order: number; color: string; isWon: boolean; isLost: boolean; isDefault: boolean };
export type LeadCard = {
  id: string; name: string; company: string | null; phone: string | null; email: string | null; segment: string | null; value: string; notes: string | null;
  nextActivityAt: Date | null; lastContactAt: Date | null; enteredAt: Date; wonAt: Date | null; lostAt: Date | null; isDemo: boolean; position: number;
  stageId: string; sourceId: string | null; lossReasonId: string | null; ownerId: string | null;
  owner: { id: string; name: string; avatarUrl: string | null } | null; source: { name: string } | null; lossReason: { name: string } | null;
  client: { id: string } | null;
};
export type Option = { id: string; name: string };
export type UserOption = { id: string; name: string; avatarUrl: string | null };
export type ApptType = { id: string; name: string; color: string; isCommercial: boolean };
