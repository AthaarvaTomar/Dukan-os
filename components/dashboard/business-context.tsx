"use client";

import { createContext, useContext, type ReactNode } from "react";

interface BusinessInfo {
  businessName: string;
  userName: string;
  userEmail: string;
}

const BusinessContext = createContext<BusinessInfo>({
  businessName: "Your shop",
  userName: "",
  userEmail: "",
});

export function BusinessProvider({
  value,
  children,
}: {
  value: BusinessInfo;
  children: ReactNode;
}) {
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

/** Shop identity loaded from Supabase by the dashboard layout. */
export function useBusinessInfo(): BusinessInfo {
  return useContext(BusinessContext);
}
