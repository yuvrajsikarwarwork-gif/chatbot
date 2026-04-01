import { createContext, useContext, type ReactNode } from "react";

type FlowValidationContextValue = {
  invalidNodeReasons: Record<string, string>;
  isLockedTopology?: boolean;
};

const FlowValidationContext = createContext<FlowValidationContextValue>({
  invalidNodeReasons: {},
  isLockedTopology: false,
});

export function FlowValidationProvider({
  value,
  children,
}: {
  value: FlowValidationContextValue;
  children: ReactNode;
}) {
  return (
    <FlowValidationContext.Provider value={value}>
      {children}
    </FlowValidationContext.Provider>
  );
}

export function useFlowValidationContext() {
  return useContext(FlowValidationContext);
}
