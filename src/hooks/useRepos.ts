import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";

export function useRepos() {
	return useQuery({
		queryKey: ["repos"],
		queryFn: api.listRepos,
	});
}

export function useAddRepo() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			name,
			path,
			config,
		}: {
			name: string;
			path: string;
			config?: string;
		}) => api.addRepo(name, path, config),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["repos"] });
		},
	});
}

export function useRemoveRepo() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => api.removeRepo(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["repos"] });
		},
	});
}

export function useUpdateRepo() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			name,
			config,
		}: {
			id: string;
			name: string;
			config: string;
		}) => api.updateRepo(id, name, config),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["repos"] });
		},
	});
}

export function useRescanRepo() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (repoId: string) => api.rescanRepo(repoId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["repos"] });
			queryClient.invalidateQueries({ queryKey: ["items"] });
		},
	});
}
