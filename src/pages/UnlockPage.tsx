import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { unlockDatabase, isDatabaseInitialized } from "../lib/tauri";
import { useDatabase } from "../contexts/DatabaseContext";
import { parseError } from "../lib/utils";
import { inputClass, btnPrimaryClass } from "../lib/styles";

export default function UnlockPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { setUnlocked } = useDatabase();

  useEffect(() => {
    isDatabaseInitialized()
      .then((initialized) => setIsFirstLaunch(!initialized))
      .catch(() => setIsFirstLaunch(true));
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!password) return;

    setError(null);
    setLoading(true);
    try {
      await unlockDatabase(password);
      setUnlocked(true);
      navigate("/transactions", { replace: true });
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  const heading =
    isFirstLaunch === null
      ? "Financial Tracker"
      : isFirstLaunch
        ? "Create Password"
        : "Enter Password";

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-sm p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <h1 data-testid="unlock-heading" className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1 text-center">
          Financial Tracker
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">
          {heading}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            data-testid="unlock-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isFirstLaunch ? "Choose a password" : "Enter password"}
            className={inputClass}
            autoFocus
          />
          {error && (
            <p data-testid="unlock-error" className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            data-testid="unlock-submit"
            type="submit"
            disabled={loading || !password}
            className={`w-full ${btnPrimaryClass}`}
          >
            {loading ? "Unlocking..." : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
