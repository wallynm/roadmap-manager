import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/tauri";
import type { ItemFilters } from "@/types";

export function useItemEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const events = [
      "item:created",
      "item:external_edit",
      "item:deleted",
    ];
    const unlisteners = events.map((event) =>
      listen(event, () => {
        queryClient.invalidateQueries({ queryKey: ["items"] });
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      })
    );
    return () => {
      unlisteners.forEach((p) => p.then((unlisten) => unlisten()));
    };
  }, [queryClient]);
}

export function useItems(repoId: string | null, filters?: ItemFilters) {
  return useQuery({
    queryKey: ["items", repoId, filters],
    queryFn: () => api.listItems(repoId!, filters),
    enabled: !!repoId,
  });
}

export function useItem(id: string | null) {
  return useQuery({
    queryKey: ["item", id],
    queryFn: () => api.getItem(id!),
    enabled: !!id,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useStartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.startItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useCompleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => api.completeItem(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useCancelItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.cancelItem(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useMarkDuplicate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, originalId }: { id: string; originalId: string }) =>
      api.markDuplicate(id, originalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function usePlanItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.planItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useAddDependency() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, blockerId }: { id: string; blockerId: string }) =>
      api.addDependency(id, blockerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: string }) =>
      api.addComment(itemId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["comments"] });
    },
  });
}
