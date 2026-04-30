import { open } from "@tauri-apps/plugin-dialog";
import { ChevronLeft, ChevronRight, Folder, FolderOpen, X } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ModalOverlay, ModalPanel } from "@/components/ui/Modal";
import { useAddRepo } from "@/hooks/useRepos";
import { api } from "@/lib/tauri";
import type { DiscoveredFolder, RepoConfig } from "@/types";

interface AddRepoDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type Step = "info" | "folders";

interface FolderSelection extends DiscoveredFolder {
	selected: boolean;
	typeName: string;
	idPrefix: string;
}

function deriveName(folderPath: string): string {
	const last = folderPath.split("/").pop() ?? folderPath;
	const singular =
		last.endsWith("s") && last.length > 2 ? last.slice(0, -1) : last;
	return singular.toLowerCase().replace(/[-_]/g, " ");
}

function deriveIdPrefix(typeName: string): string {
	return typeName
		.trim()
		.slice(0, 3)
		.toUpperCase()
		.replace(/[^A-Z]/g, "");
}

function buildRepoConfig(folders: FolderSelection[]): RepoConfig {
	const templates: RepoConfig["templates"] = {};

	for (const f of folders) {
		if (!f.selected) {
			continue;
		}
		const key = f.typeName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
		const prefix = (f.idPrefix || deriveIdPrefix(f.typeName)).toUpperCase();
		templates[key] = {
			dir: f.path,
			filePrefix: prefix.slice(0, 3).toLowerCase(),
			idPrefix: prefix,
			idPadding: 2,
			frontmatterFields: [
				"id",
				"title",
				"type",
				"status",
				"priority",
				"labels",
				"created-date",
				"depends-on",
			],
			requiredFields: ["id", "title", "type", "status"],
			defaults: { status: "⬜ pendente" },
			bodyTemplate:
				"## Context\n\nWhy this work matters and what problem it solves.\n\n## Spec\n\nWhat exactly needs to be built or changed.\n\n## Acceptance criteria\n\n- [ ] \n\n## Key learnings\n\n",
		};
	}

	return {
		templates,
		labels: { whitelist: [], allowFreeForm: true, colors: {} },
		autoCommit: {
			enabled: true,
			branch: null,
			messageFormat: "chore(roadmap): {ID} → {STATUS_VERB}",
			includeNoteInBody: true,
			addReferenceLine: true,
			skipIfDirty: false,
		},
		branchPolicy: { allowedBranches: null, warnIfDetached: true },
	};
}

// ── Step 1 ──────────────────────────────────────────────────────────────────

interface StepInfoProps {
	path: string;
	name: string;
	onPathChange: (v: string) => void;
	onNameChange: (v: string) => void;
	onBrowse: () => void;
	onContinue: () => void;
	loading: boolean;
}

function StepInfo({
	path,
	name,
	onPathChange,
	onNameChange,
	onBrowse,
	onContinue,
	loading,
}: StepInfoProps) {
	const pathId = useId();
	const nameId = useId();

	return (
		<div className="space-y-4">
			<div>
				<label
					htmlFor={pathId}
					className="text-sm text-muted-foreground mb-1 block"
				>
					Path
				</label>
				<div className="flex gap-2">
					<Input
						id={pathId}
						value={path}
						onChange={(e) => onPathChange(e.target.value)}
						placeholder="/Users/.../your-repo"
						size="lg"
						className="flex-1"
					/>
					<Button variant="secondary" onClick={onBrowse}>
						<FolderOpen className="w-4 h-4" />
					</Button>
				</div>
			</div>

			<div>
				<label
					htmlFor={nameId}
					className="text-sm text-muted-foreground mb-1 block"
				>
					Name
				</label>
				<Input
					id={nameId}
					value={name}
					onChange={(e) => onNameChange(e.target.value)}
					placeholder="my-project"
					size="lg"
					className="w-full"
				/>
			</div>

			<Button
				variant="solid"
				size="lg"
				className="w-full"
				disabled={!path || !name}
				loading={loading}
				onClick={onContinue}
			>
				Continue
				<ChevronRight className="w-4 h-4 ml-1" />
			</Button>
		</div>
	);
}

// ── Step 2 ──────────────────────────────────────────────────────────────────

interface StepFoldersProps {
	folders: FolderSelection[];
	onToggle: (idx: number) => void;
	onTypeNameChange: (idx: number, v: string) => void;
	onIdPrefixChange: (idx: number, v: string) => void;
	onBack: () => void;
	onConfirm: () => void;
	loading: boolean;
}

function StepFolders({
	folders,
	onToggle,
	onTypeNameChange,
	onIdPrefixChange,
	onBack,
	onConfirm,
	loading,
}: StepFoldersProps) {
	const anySelected = folders.some((f) => f.selected);

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				{folders.length === 0
					? "No Markdown folders found. The repo will be added with default settings."
					: "Select the folders you want to manage. We'll create a roadmap.json in the repo."}
			</p>

			{folders.length > 0 && (
				<div className="rounded-lg border border-border divide-y divide-border max-h-72 overflow-y-auto">
					{folders.map((f, idx) => (
						<div key={f.path} className="p-3 space-y-2">
							<div className="flex items-center gap-3">
								<input
									type="checkbox"
									id={`folder-${idx}`}
									checked={f.selected}
									onChange={() => onToggle(idx)}
									className="rounded border-border accent-primary"
								/>
								<label
									htmlFor={`folder-${idx}`}
									className="flex items-center gap-2 flex-1 cursor-pointer min-w-0"
								>
									<Folder className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
									<span className="text-sm font-mono truncate">{f.path}</span>
									<span className="text-xs text-muted-foreground shrink-0">
										{f.md_count} file{f.md_count !== 1 ? "s" : ""}
									</span>
								</label>
							</div>

							{f.selected && (
								<div className="flex gap-2 pl-7">
									<div className="flex-1">
										<label
											htmlFor={`type-${f.path}`}
											className="text-[10px] text-muted-foreground/70 block mb-0.5"
										>
											Type name
										</label>
										<Input
											id={`type-${f.path}`}
											value={f.typeName}
											onChange={(e) => onTypeNameChange(idx, e.target.value)}
											placeholder="roadmap"
											size="sm"
											className="w-full"
										/>
									</div>
									<div className="w-24">
										<label
											htmlFor={`prefix-${f.path}`}
											className="text-[10px] text-muted-foreground/70 block mb-0.5"
										>
											ID prefix
										</label>
										<Input
											id={`prefix-${f.path}`}
											value={f.idPrefix}
											onChange={(e) => onIdPrefixChange(idx, e.target.value)}
											placeholder="RD"
											size="sm"
											className="w-full font-mono uppercase"
										/>
									</div>
								</div>
							)}
						</div>
					))}
				</div>
			)}

			<div className="flex gap-2">
				<Button variant="ghost" size="lg" onClick={onBack} className="flex-1">
					<ChevronLeft className="w-4 h-4 mr-1" />
					Back
				</Button>
				<Button
					variant="solid"
					size="lg"
					className="flex-1"
					disabled={folders.length > 0 && !anySelected}
					loading={loading}
					onClick={onConfirm}
				>
					Add & Scan
				</Button>
			</div>
		</div>
	);
}

// ── Main dialog ─────────────────────────────────────────────────────────────

export function AddRepoDialog({
	open: isOpen,
	onOpenChange,
}: AddRepoDialogProps) {
	const [path, setPath] = useState("");
	const [name, setName] = useState("");
	const [step, setStep] = useState<Step>("info");
	const [folders, setFolders] = useState<FolderSelection[]>([]);
	const [discovering, setDiscovering] = useState(false);
	const addRepo = useAddRepo();
	const navigate = useNavigate();

	if (!isOpen) {
		return null;
	}

	const reset = () => {
		setPath("");
		setName("");
		setStep("info");
		setFolders([]);
	};

	const handleClose = () => {
		onOpenChange(false);
		reset();
	};

	const handleBrowse = async () => {
		const selected = await open({ directory: true, multiple: false });
		if (selected) {
			const p = selected as string;
			setPath(p);
			const segments = p.split("/");
			setName(segments[segments.length - 1] || "");
		}
	};

	const handleContinue = async () => {
		if (!path || !name) {
			return;
		}
		setDiscovering(true);
		try {
			const discovered = await api.discoverMdFolders(path);
			const selections: FolderSelection[] = discovered.map((f) => {
				const typeName = deriveName(f.path);
				return {
					...f,
					selected: true,
					typeName,
					idPrefix: deriveIdPrefix(typeName),
				};
			});
			setFolders(selections);
			setStep("folders");
		} catch (err) {
			toast.error(`Discovery failed: ${err}`);
		} finally {
			setDiscovering(false);
		}
	};

	const handleToggle = (idx: number) => {
		setFolders((prev) =>
			prev.map((f, i) => (i === idx ? { ...f, selected: !f.selected } : f)),
		);
	};

	const handleTypeNameChange = (idx: number, v: string) => {
		setFolders((prev) =>
			prev.map((f, i) => {
				if (i !== idx) {
					return f;
				}
				const newIdPrefix = deriveIdPrefix(v);
				return { ...f, typeName: v, idPrefix: newIdPrefix };
			}),
		);
	};

	const handleIdPrefixChange = (idx: number, v: string) => {
		setFolders((prev) =>
			prev.map((f, i) => (i === idx ? { ...f, idPrefix: v.toUpperCase() } : f)),
		);
	};

	const handleConfirm = () => {
		const config = buildRepoConfig(folders);
		const configJson = JSON.stringify(config);

		addRepo.mutate(
			{ name, path, config: configJson },
			{
				onSuccess: async ([repo, report]) => {
					// Write roadmap.json to the repo
					try {
						await api.writeRoadmapJson(path, configJson);
					} catch {
						// Non-fatal: DB config is already saved
					}
					toast.success(`Added ${repo.name}: ${report.added} items imported`);
					navigate(`/repos/${repo.id}`);
					handleClose();
				},
				onError: (err) => {
					toast.error(`Failed: ${err}`);
				},
			},
		);
	};

	return (
		<ModalOverlay onClose={handleClose}>
			<ModalPanel className="w-full max-w-md p-6">
				<div className="flex items-center justify-between mb-6">
					<div>
						<h3 className="text-lg font-semibold">Add Repository</h3>
						{step === "folders" && (
							<p className="text-xs text-muted-foreground mt-0.5">
								Step 2 of 2 — Managed folders
							</p>
						)}
					</div>
					<Button variant="ghost" size="icon" onClick={handleClose}>
						<X className="w-4 h-4" />
					</Button>
				</div>

				{step === "info" && (
					<StepInfo
						path={path}
						name={name}
						onPathChange={setPath}
						onNameChange={setName}
						onBrowse={handleBrowse}
						onContinue={handleContinue}
						loading={discovering}
					/>
				)}

				{step === "folders" && (
					<StepFolders
						folders={folders}
						onToggle={handleToggle}
						onTypeNameChange={handleTypeNameChange}
						onIdPrefixChange={handleIdPrefixChange}
						onBack={() => setStep("info")}
						onConfirm={handleConfirm}
						loading={addRepo.isPending}
					/>
				)}
			</ModalPanel>
		</ModalOverlay>
	);
}
