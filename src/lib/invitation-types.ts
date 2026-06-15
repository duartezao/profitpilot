export type PendingInvitationView = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  storeAccessLabel: string;
  invitedByName: string;
  expiresAt: string;
  createdAt: string;
};

export type SentInvitationView = {
  id: string;
  email: string;
  role: string;
  storeAccessLabel: string;
  expiresAt: string;
  createdAt: string;
};
