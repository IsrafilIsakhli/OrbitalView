import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/shared/data/queryKeys";

import {
  fetchNasaCredentialStatus,
  removeNasaCredential,
  saveNasaCredential,
  verifyNasaCredential,
} from "./nasaCredential";

const credentialQueryKey = ["settings", "nasa-credential"] as const;

export function useNasaCredentialStatus() {
  return useQuery({ queryFn: fetchNasaCredentialStatus, queryKey: credentialQueryKey, staleTime: 30_000 });
}

function useCredentialMutation<T>(mutationFn: (value: T) => ReturnType<typeof saveNasaCredential>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async (status) => {
      queryClient.setQueryData(credentialQueryKey, status);
      await queryClient.invalidateQueries({ queryKey: queryKeys.nasa });
      await queryClient.invalidateQueries({ queryKey: queryKeys.controlCenter });
    },
  });
}

export function useSaveNasaCredential() {
  return useCredentialMutation(saveNasaCredential);
}

export function useRemoveNasaCredential() {
  return useCredentialMutation(() => removeNasaCredential());
}

export function useVerifyNasaCredential() {
  return useCredentialMutation(() => verifyNasaCredential());
}
