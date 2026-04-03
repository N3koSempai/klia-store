import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface SourceVerification {
  url: string;
  commit: string;
  verified: boolean;
  remote_commit?: string;
  error?: string;
  platform?: string;
}

export interface BatchVerificationResult {
  appId: string;
  appName?: string;
  verified: boolean;
  isHashMismatch: boolean;
  isUnsupportedPlatform: boolean;
  isSourceUnavailable: boolean;
  error?: string;
  sources: SourceVerification[];
}

export interface BatchVerificationSummary {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  unsupported: number;
}

export type BatchVerificationState = "idle" | "verifying" | "completed";

interface UseBatchVerificationReturn {
  state: BatchVerificationState;
  results: BatchVerificationResult[];
  summary: BatchVerificationSummary;
  currentlyVerifying: string | null;
  verifyAll: (
    apps: Array<{ appId: string; appName?: string }>,
  ) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

export function useBatchVerification(): UseBatchVerificationReturn {
  const [state, setState] = useState<BatchVerificationState>("idle");
  const [results, setResults] = useState<BatchVerificationResult[]>([]);
  const [currentlyVerifying, setCurrentlyVerifying] = useState<string | null>(
    null,
  );
  const cancelledRef = useRef(false);

  const verifyAll = useCallback(
    async (apps: Array<{ appId: string; appName?: string }>) => {
      if (apps.length === 0) return;

      setState("verifying");
      setResults([]);
      setCurrentlyVerifying(apps[0].appId);
      cancelledRef.current = false;

      const allResults: BatchVerificationResult[] = [];

      for (let i = 0; i < apps.length; i++) {
        if (cancelledRef.current) {
          break;
        }

        const app = apps[i];
        setCurrentlyVerifying(app.appId);

        try {
          const raw = await invoke<{
            verified: boolean;
            app_id: string;
            sources: Array<{
              url: string;
              commit: string;
              verified: boolean;
              remote_commit?: string;
              error?: string;
              platform?: string;
            }>;
            error?: string;
          }>("verify_app_hash", { appId: app.appId });

          const errorMsg = raw.sources[0]?.error || raw.error || "";
          const platform = raw.sources[0]?.platform || "unknown";

          const isUnsupportedPlatform = platform === "unsupported";
          const isHashMismatch =
            errorMsg.toLowerCase().includes("hash mismatch") ||
            errorMsg.toLowerCase().includes("mismatch");
          const isSourceUnavailable =
            !isHashMismatch &&
            (errorMsg.toLowerCase().includes("tag") ||
              errorMsg.toLowerCase().includes("could not verify") ||
              errorMsg.toLowerCase().includes("not found") ||
              errorMsg.toLowerCase().includes("failed to fetch"));

          const result: BatchVerificationResult = {
            appId: raw.app_id,
            appName: app.appName,
            verified: raw.verified,
            isHashMismatch,
            isUnsupportedPlatform,
            isSourceUnavailable,
            error: raw.error,
            sources: raw.sources,
          };

          allResults.push(result);
          setResults([...allResults]);
        } catch (error) {
          const errorResult: BatchVerificationResult = {
            appId: app.appId,
            appName: app.appName,
            verified: false,
            isHashMismatch: false,
            isUnsupportedPlatform: false,
            isSourceUnavailable: false,
            error: String(error),
            sources: [],
          };

          allResults.push(errorResult);
          setResults([...allResults]);
        }
      }

      if (!cancelledRef.current) {
        setCurrentlyVerifying(null);
        setState("completed");
      }
    },
    [],
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setCurrentlyVerifying(null);
    setState("completed");
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = true;
    setState("idle");
    setResults([]);
    setCurrentlyVerifying(null);
  }, []);

  // Compute summary from results
  const summary: BatchVerificationSummary = {
    total: results.length,
    completed: results.length,
    passed: results.filter((r) => r.verified).length,
    failed: results.filter((r) => !r.verified && !r.isUnsupportedPlatform)
      .length,
    unsupported: results.filter((r) => r.isUnsupportedPlatform).length,
  };

  return {
    state,
    results,
    summary,
    currentlyVerifying,
    verifyAll,
    cancel,
    reset,
  };
}
