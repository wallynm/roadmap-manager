import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import type { ValidationReport, FixReport, ArchiveDryRun, ArchiveReport, DepAnalysis, RankedItem } from "@/types";

export function useValidateRepo(repoId: string) {
  const queryClient = useQueryClient();
  return useMutation<ValidationReport, Error, void>({
    mutationFn: () => api.validateRepo(repoId),
    onSuccess: (data) => {
      queryClient.setQueryData(["validation", repoId], data);
    },
  });
}

export function useFixRepo(repoId: string) {
  const queryClient = useQueryClient();
  return useMutation<FixReport, Error, void>({
    mutationFn: () => api.fixRepo(repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["validation", repoId] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useArchiveDryRun(repoId: string) {
  const queryClient = useQueryClient();
  return useMutation<ArchiveDryRun, Error, void>({
    mutationFn: () => api.archiveDryRun(repoId),
    onSuccess: (data) => {
      queryClient.setQueryData(["archive-dry-run", repoId], data);
    },
  });
}

export function useArchiveExecute(repoId: string) {
  const queryClient = useQueryClient();
  return useMutation<ArchiveReport, Error, void>({
    mutationFn: () => api.archiveExecute(repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["archive-dry-run", repoId] });
    },
  });
}

export function useDepsCheck(repoId: string) {
  const queryClient = useQueryClient();
  return useMutation<DepAnalysis, Error, void>({
    mutationFn: () => api.depsCheck(repoId),
    onSuccess: (data) => {
      queryClient.setQueryData(["deps-analysis", repoId], data);
    },
  });
}

export function useImpactRankingCache(repoId: string) {
  return useQuery<RankedItem[] | null>({
    queryKey: ["impact-ranking-cache", repoId],
    queryFn: () => api.getCachedImpactRanking(repoId),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useImpactRanking(repoId: string) {
  return useQuery<RankedItem[]>({
    queryKey: ["impact-ranking", repoId],
    queryFn: () => api.impactRanking(repoId),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
}

export function useCheckboxCount(repoId: string | null) {
  return useQuery({
    queryKey: ["checkboxes", repoId],
    queryFn: () => api.getCheckboxCount(repoId!),
    enabled: !!repoId,
  });
}

export function useSubRoadmaps(repoId: string | null) {
  return useQuery({
    queryKey: ["sub-roadmaps", repoId],
    queryFn: () => api.getSubRoadmaps(repoId!),
    enabled: !!repoId,
  });
}
