import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/tauri";
import type { Item, ItemFilters, ItemStatus, Priority } from "@/types";
import { toast } from "sonner";

type Snapshot = {
  itemId: string;
  prevItem: Item | undefined;
  prevLists: [QueryKey, Item[] | undefined][];
};

const safeJsonArray = (json: string): string[] => {
  try { return JSON.parse(json); } catch { return []; }
};

const today = () => new Date().toISOString().slice(0, 10);

async function applyOptimistic(
  qc: QueryClient,
  itemId: string,
  transform: (item: Item) => Item,
): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: ["item", itemId] });
  await qc.cancelQueries({ queryKey: ["items"] });

  const prevItem = qc.getQueryData<Item>(["item", itemId]);
  const prevLists = qc.getQueriesData<Item[]>({ queryKey: ["items"] });

  if (prevItem) {
    qc.setQueryData(["item", itemId], transform(prevItem));
  }
  qc.setQueriesData<Item[]>(
    { queryKey: ["items"] },
    (old) => old?.map((i) => (i.id === itemId ? transform(i) : i)),
  );

  return { itemId, prevItem, prevLists };
}

function revertOptimistic(qc: QueryClient, snap?: Snapshot) {
  if (!snap) return;
  if (snap.prevItem) {
    qc.setQueryData(["item", snap.itemId], snap.prevItem);
  }
  snap.prevLists.forEach(([key, data]) => {
    qc.setQueryData(key, data);
  });
  toast.error("Operação falhou — alterações revertidas");
}

function syncAfterMutation(qc: QueryClient, itemId: string) {
  qc.invalidateQueries({ queryKey: ["items"] });
  qc.invalidateQueries({ queryKey: ["item", itemId] });
  qc.invalidateQueries({ queryKey: ["roadmap"] });
  qc.invalidateQueries({ queryKey: ["impact-ranking"] });
}

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
        queryClient.invalidateQueries({ queryKey: ["roadmap"] });
        queryClient.invalidateQueries({ queryKey: ["impact-ranking"] });
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createItem,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateItem,
    onMutate: async (params) =>
      applyOptimistic(qc, params.id, (item) => ({
        ...item,
        ...(params.status !== undefined && { status: params.status as ItemStatus }),
        ...(params.priority !== undefined && { priority: params.priority as Priority }),
        ...(params.labels !== undefined && { labels: JSON.stringify(params.labels) }),
        ...(params.title !== undefined && { title: params.title }),
        ...(params.body !== undefined && { body: params.body }),
      })),
    onError: (_err, _vars, ctx) => revertOptimistic(qc, ctx),
    onSettled: (_d, _e, params) => syncAfterMutation(qc, params.id),
  });
}

export function useStartItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.startItem(id),
    onMutate: async (id) =>
      applyOptimistic(qc, id, (item) => ({
        ...item,
        status: "in_progress" as ItemStatus,
        started_date: item.started_date ?? today(),
      })),
    onError: (_err, _vars, ctx) => revertOptimistic(qc, ctx),
    onSettled: (_d, _e, id) => syncAfterMutation(qc, id),
  });
}

export function useCompleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => api.completeItem(id, note),
    onMutate: async ({ id }) =>
      applyOptimistic(qc, id, (item) => ({
        ...item,
        status: "done" as ItemStatus,
        completed_date: today(),
      })),
    onError: (_err, _vars, ctx) => revertOptimistic(qc, ctx),
    onSettled: (_d, _e, { id }) => syncAfterMutation(qc, id),
  });
}

export function useCancelItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.cancelItem(id, reason),
    onMutate: async ({ id }) =>
      applyOptimistic(qc, id, (item) => ({
        ...item,
        status: "canceled" as ItemStatus,
        completed_date: today(),
      })),
    onError: (_err, _vars, ctx) => revertOptimistic(qc, ctx),
    onSettled: (_d, _e, { id }) => syncAfterMutation(qc, id),
  });
}

export function useMarkDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, originalId }: { id: string; originalId: string }) =>
      api.markDuplicate(id, originalId),
    onMutate: async ({ id, originalId }) =>
      applyOptimistic(qc, id, (item) => ({
        ...item,
        status: "duplicate" as ItemStatus,
        duplicate_of: originalId,
        completed_date: today(),
      })),
    onError: (_err, _vars, ctx) => revertOptimistic(qc, ctx),
    onSettled: (_d, _e, { id }) => syncAfterMutation(qc, id),
  });
}

export function usePlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.planItem(id),
    onMutate: async (id) =>
      applyOptimistic(qc, id, (item) => ({
        ...item,
        status: "todo" as ItemStatus,
      })),
    onError: (_err, _vars, ctx) => revertOptimistic(qc, ctx),
    onSettled: (_d, _e, id) => syncAfterMutation(qc, id),
  });
}

export function useAddDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, blockerId }: { id: string; blockerId: string }) =>
      api.addDependency(id, blockerId),
    onMutate: async ({ id, blockerId }) =>
      applyOptimistic(qc, id, (item) => {
        const deps = safeJsonArray(item.depends_on);
        if (!deps.includes(blockerId)) deps.push(blockerId);
        return { ...item, depends_on: JSON.stringify(deps) };
      }),
    onError: (_err, _vars, ctx) => revertOptimistic(qc, ctx),
    onSettled: (_d, _e, { id }) => syncAfterMutation(qc, id),
  });
}

export function useRemoveDependency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, blockerId }: { id: string; blockerId: string }) =>
      api.removeDependency(id, blockerId),
    onMutate: async ({ id, blockerId }) =>
      applyOptimistic(qc, id, (item) => {
        const deps = safeJsonArray(item.depends_on).filter((d) => d !== blockerId);
        return { ...item, depends_on: JSON.stringify(deps) };
      }),
    onError: (_err, _vars, ctx) => revertOptimistic(qc, ctx),
    onSettled: (_d, _e, { id }) => syncAfterMutation(qc, id),
  });
}

export function useAddRelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, relatedId }: { id: string; relatedId: string }) =>
      api.addRelation(id, relatedId),
    onMutate: async ({ id, relatedId }) =>
      applyOptimistic(qc, id, (item) => {
        const rels = safeJsonArray(item.relates_to);
        if (!rels.includes(relatedId)) rels.push(relatedId);
        return { ...item, relates_to: JSON.stringify(rels) };
      }),
    onError: (_err, _vars, ctx) => revertOptimistic(qc, ctx),
    onSettled: (_d, _e, { id }) => syncAfterMutation(qc, id),
  });
}

export function useRemoveRelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, relatedId }: { id: string; relatedId: string }) =>
      api.removeRelation(id, relatedId),
    onMutate: async ({ id, relatedId }) =>
      applyOptimistic(qc, id, (item) => {
        const rels = safeJsonArray(item.relates_to).filter((r) => r !== relatedId);
        return { ...item, relates_to: JSON.stringify(rels) };
      }),
    onError: (_err, _vars, ctx) => revertOptimistic(qc, ctx),
    onSettled: (_d, _e, { id }) => syncAfterMutation(qc, id),
  });
}

export function useItemComments(itemId: string | null) {
  return useQuery({
    queryKey: ["comments", itemId],
    queryFn: () => api.getItemComments(itemId!),
    enabled: !!itemId,
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: string }) =>
      api.addComment(itemId, body),
    onSuccess: (_d, { itemId }) => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["item", itemId] });
      qc.invalidateQueries({ queryKey: ["comments"] });
    },
  });
}
