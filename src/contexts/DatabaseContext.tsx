import { createContext, useContext, useState, type ReactNode } from "react";

interface DatabaseContextValue {
  isUnlocked: boolean;
  setUnlocked: (value: boolean) => void;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [isUnlocked, setUnlocked] = useState(false);

  return (
    <DatabaseContext.Provider value={{ isUnlocked, setUnlocked }}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error("useDatabase must be used within a DatabaseProvider");
  }
  return ctx;
}
