import { ChevronRight, FilePlus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { BlockNoteEditor } from "@/components/editor/BlockNoteEditor";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { Section, PropRow } from "@/components/ui/SidebarSection";
import { useCreateItem } from "@/hooks/useItems";
import { useRepos } from "@/hooks/useRepos";
import type { RepoConfig } from "@/types";

const FALLBACK_TYPES = ["improvement", "bug", "refactoring", "feature"];

const PRIORITIES = ["Urgente", "Alta", "Média", "Baixa", "Nenhuma"] as const;
type ItemPriority = (typeof PRIORITIES)[number];

function parseConfig(configJson: string): RepoConfig | null {
	try {
		return JSON.parse(configJson) as RepoConfig;
	} catch {
		return null;
	}
}

function applyTemplate(bodyTemplate: string, title: string): string {
	return bodyTemplate.replace("{ID}", "").replace("{TITLE}", title).trim();
}

export function NewItemView() {
	const { repoId } = useParams<{ repoId: string }>();
	const navigate = useNavigate();
	const { data: repos } = useRepos();
	const createItem = useCreateItem();
	const repo = repos?.find((r) => r.id === repoId);

	const config = useMemo(
		() => (repo ? parseConfig(repo.config) : null),
		[repo],
	);

	const availableTypes = useMemo(() => {
		const keys = config ? Object.keys(config.templates) : [];
		return keys.length > 0 ? keys : FALLBACK_TYPES;
	}, [config]);

	const [title, setTitle] = useState("");
	const [itemType, setItemType] = useState(() => availableTypes[0] ?? "improvement");
	const [priority, setPriority] = useState<ItemPriority>("Média");
	const [labelInput, setLabelInput] = useState("");
	const [labels, setLabels] = useState<string[]>([]);
	const bodyRef = useRef("");

	const bodyTemplate = config?.templates[itemType]?.bodyTemplate ?? "";

	const addLabel = () => {
		const trimmed = labelInput.trim();
		if (trimmed && !labels.includes(trimmed)) {
			setLabels((prev) => [...prev, trimmed]);
			setLabelInput("");
		}
	};

	const removeLabel = (l: string) => setLabels((prev) => prev.filter((x) => x !== l));

	const handleCreate = () => {
		if (!title.trim() || !repoId) {
			return;
		}
		createItem.mutate(
			{
				repoId,
				itemType,
				title: title.trim(),
				body: bodyRef.current || `# ${title.trim()}\n\n`,
				priority,
				labels,
			},
			{
				onSuccess: (item) => {
					toast.success(`${item.external_id} created`);
					navigate(`/repos/${repoId}/items/${item.id}`);
				},
				onError: (err) => {
					toast.error(`Failed: ${err}`);
				},
			},
		);
	};

	return (
		<div className="h-full flex flex-col">
			{/* Breadcrumb */}
			<nav className="flex items-center gap-1.5 text-sm mb-4 shrink-0">
				<Link
					to={`/repos/${repoId}`}
					className="text-muted-foreground hover:text-foreground transition-colors"
				>
					{repo?.name ?? "Repo"}
				</Link>
				<ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
				<span className="text-foreground">New item</span>
			</nav>

			{/* Main layout */}
			<div className="flex gap-8 flex-1 min-h-0">
				{/* Left — content */}
				<div className="flex-1 min-w-0 overflow-y-auto space-y-6 pr-2">
					<input
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						placeholder="Issue title"
						autoFocus
						className="w-full bg-transparent text-2xl font-semibold focus:outline-none placeholder:text-muted-foreground border-b border-transparent hover:border-border focus:border-primary transition-colors pb-1"
					/>

					<BlockNoteEditor
						key={itemType}
						markdown={bodyTemplate ? applyTemplate(bodyTemplate, title) : ""}
						editable
						onChange={(md) => {
							bodyRef.current = md;
						}}
					/>
				</div>

				{/* Right sidebar */}
				<aside className="w-64 shrink-0 overflow-y-auto">
					<Button
						variant="solid"
						className="w-full mb-4"
						disabled={!title.trim()}
						loading={createItem.isPending}
						onClick={handleCreate}
					>
						<FilePlus className="w-3.5 h-3.5" />
						Create issue
					</Button>

					<Section label="Properties">
						<PropRow label="Type">
							<Select
								value={itemType}
								onChange={(e) => {
									setItemType(e.target.value);
									bodyRef.current = "";
								}}
								size="xs"
							>
								{availableTypes.map((t) => (
									<option key={t} value={t}>
										{t}
									</option>
								))}
							</Select>
						</PropRow>
						<PropRow label="Priority">
							<Select
								value={priority}
								onChange={(e) => setPriority(e.target.value as ItemPriority)}
								size="xs"
							>
								{PRIORITIES.map((p) => (
									<option key={p} value={p}>
										{p}
									</option>
								))}
							</Select>
						</PropRow>
					</Section>

					<Section label="Labels">
						<div className="space-y-2 pt-1">
							{labels.length > 0 && (
								<div className="flex flex-wrap gap-1">
									{labels.map((l) => (
										<button
											key={l}
											type="button"
											onClick={() => removeLabel(l)}
											className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
										>
											{l} ×
										</button>
									))}
								</div>
							)}
							<div className="flex gap-1.5">
								<Input
									value={labelInput}
									onChange={(e) => setLabelInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											addLabel();
										}
									}}
									placeholder="Add label…"
									size="xs"
									className="flex-1"
								/>
								<Button variant="ghost" size="sm" onClick={addLabel}>
									+
								</Button>
							</div>
						</div>
					</Section>
				</aside>
			</div>
		</div>
	);
}
