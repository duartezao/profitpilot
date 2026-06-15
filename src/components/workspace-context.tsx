"use client";

import { createContext, useContext } from "react";

type WorkspaceContextValue = {
  workspaceId: string;
  workspaceName: string;
};

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaceId: "",
  workspaceName: "",
});

export function WorkspaceProvider({
  workspaceId,
  workspaceName,
  children,
}: WorkspaceContextValue & { children: React.ReactNode }) {
  return (
    <WorkspaceContext.Provider value={{ workspaceId, workspaceName }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
