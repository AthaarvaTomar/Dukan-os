"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface BusinessInfo {
  businessName: string;
  upiId: string;
  userName: string;
  userEmail: string;
  updateBusinessInfo: (patch: { businessName?: string; upiId?: string }) => void;
}

const BusinessContext = createContext<BusinessInfo>({
  businessName: "Your shop",
  upiId: "",
  userName: "",
  userEmail: "",
  updateBusinessInfo: () => {},
});

export function BusinessProvider({
  value,
  children,
}: {
  value: {
    businessName: string;
    upiId?: string;
    userName: string;
    userEmail: string;
  };
  children: ReactNode;
}) {
  const [overrides, setOverrides] = useState<{
    sourceName: string;
    sourceUpiId: string;
    businessName?: string;
    upiId?: string;
  } | null>(null);

  const sourceUpiId = value.upiId ?? "";
  const activeOverrides =
    overrides &&
    overrides.sourceName === value.businessName &&
    overrides.sourceUpiId === sourceUpiId
      ? overrides
      : null;

  const updateBusinessInfo = useCallback(
    (patch: { businessName?: string; upiId?: string }) => {
      setOverrides((current) => {
        const base =
          current &&
          current.sourceName === value.businessName &&
          current.sourceUpiId === sourceUpiId
            ? current
            : { sourceName: value.businessName, sourceUpiId };
        return {
          ...base,
          ...(patch.businessName !== undefined ? { businessName: patch.businessName } : {}),
          ...(patch.upiId !== undefined ? { upiId: patch.upiId } : {}),
        };
      });
    },
    [sourceUpiId, value.businessName],
  );

  const contextValue = useMemo(
    () => ({
      businessName: activeOverrides?.businessName ?? value.businessName,
      upiId: activeOverrides?.upiId ?? sourceUpiId,
      userName: value.userName,
      userEmail: value.userEmail,
      updateBusinessInfo,
    }),
    [
      activeOverrides?.businessName,
      activeOverrides?.upiId,
      sourceUpiId,
      updateBusinessInfo,
      value.businessName,
      value.userEmail,
      value.userName,
    ],
  );

  return <BusinessContext.Provider value={contextValue}>{children}</BusinessContext.Provider>;
}

/** Shop identity loaded from Supabase by the dashboard layout. */
export function useBusinessInfo(): BusinessInfo {
  return useContext(BusinessContext);
}
