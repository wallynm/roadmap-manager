import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import {
	AlertCircle,
	CheckCircle2,
	ChevronLeft,
	ChevronRight,
	Folder,
	FolderOpen,
	Loader2,
	SkipForward,
	Wand2,
	X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ModalOverlay, ModalPanel } from "@/components/ui/Modal";
import { useAddRepo } from "@/hooks/useRepos";
import { api } from "@/lib/tauri";
import type { DiscoveredFolder, RepoConfig, ValidationIssue } from "@/types";

interface AddRepoDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

type Step = "info" | "folders" | "analysis" | "fixing";

interface FolderSelection extends DiscoveredFolder {
	selected: boolean;
	typeName: string;
	idPrefix: string;
}

interface ProgressEntry {
	file: string;
	fixed: boolean;
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
		if (!f.selected) continue;
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
	onContinue: () => void;
	loading: boolean;
}

function StepFolders({
	folders,
	onToggle,
	onTypeNameChange,
	onIdPrefixChange,
	onBack,
	onContinue,
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
					onClick={onContinue}
				>
					Continue
					<ChevronRight className="w-4 h-4 ml-1" />
				</Button>
			</div>
		</div>
	);
}

// ── Step 3 — Analysis ────────────────────────────────────────────────────────

interface StepAnalysisProps {
	repoId: string;
	repoName: string;
	initialAdded: number;
	issues: ValidationIssue[];
	onFix: () => void;
	onSkip: () => void;
}

function StepAnalysis({
	repoName,
	initialAdded,
	issues,
	onFix,
	onSkip,
}: StepAnalysisProps) {
	const needsFix = issues.length;

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-4 rounded-lg bg-muted/40 border border-border px-4 py-3">
				<div className="text-center">
					<div className="text-2xl font-bold tabular-nums">{initialAdded}</div>
					<div className="text-[10px] text-muted-foreground uppercase tracking-wide">
						imported
					</div>
				</div>
				<div className="w-px h-10 bg-border" />
				<div className="text-center">
					<div className="text-2xl font-bold tabular-nums text-amber-500">
						{needsFix}
					</div>
					<div className="text-[10px] text-muted-foreground uppercase tracking-wide">
						need fix
					</div>
				</div>
			</div>

			{needsFix > 0 ? (
				<>
					<div className="rounded-lg border border-border divide-y divide-border max-h-52 overflow-y-auto text-xs font-mono">
						{issues.map((issue) => (
							<div
								key={issue.file}
								className="px-3 py-1.5 flex items-start gap-2 min-w-0"
							>
								<AlertCircle className="w-3 h-3 shrink-0 text-amber-500 mt-0.5" />
								<div className="min-w-0">
									<span className="truncate block text-foreground">
										{issue.file}
									</span>
									{issue.missing.length > 0 && (
										<span className="text-muted-foreground">
											missing: {issue.missing.join(", ")}
										</span>
									)}
								</div>
							</div>
						))}
					</div>

					<label className="flex items-start gap-2.5 rounded-lg border border-border p-3 bg-primary/5 border-primary/20">
						<Wand2 className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
						<p className="text-xs text-muted-foreground leading-relaxed">
							Auto-fix will synthesize{" "}
							<code className="font-mono">id</code>,{" "}
							<code className="font-mono">title</code> and{" "}
							<code className="font-mono">status</code> from file content and
							commit the changes.
						</p>
					</label>

					<div className="flex gap-2">
						<Button
							variant="ghost"
							size="lg"
							className="flex-1"
							onClick={onSkip}
						>
							<SkipForward className="w-4 h-4 mr-1" />
							Skip fixing
						</Button>
						<Button variant="solid" size="lg" className="flex-1" onClick={onFix}>
							<Wand2 className="w-3.5 h-3.5 mr-1.5" />
							Fix & Open {repoName}
						</Button>
					</div>
				</>
			) : (
				<Button variant="solid" size="lg" className="w-full" onClick={onSkip}>
					Open {repoName}
					<ChevronRight className="w-4 h-4 ml-1" />
				</Button>
			)}
		</div>
	);
}

// ── Step 3 — Fixing progress ─────────────────────────────────────────────────

interface StepFixingProps {
	repoId: string;
	repoName: string;
	totalIssues: number;
	onDone: () => void;
}

function StepFixing({ repoId, repoName, totalIssues, onDone }: StepFixingProps) {
	const [entries, setEntries] = useState<ProgressEntry[]>([]);
	const [processedCount, setProcessedCount] = useState(0);
	const [fixedCount, setFixedCount] = useState(0);
	const [finished, setFinished] = useState(false);
	const listRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let unlistenProgress: (() => void) | undefined;
		let unlistenDone: (() => void) | undefined;

		listen<{ done: number; total: number; file: string; fixed: boolean }>(
			"fix:progress",
			(event) => {
				const { done, file, fixed } = event.payload;
				setProcessedCount(done);
				setEntries((prev) => [...prev, { file, fixed }]);
				if (fixed) setFixedCount((n) => n + 1);
			},
		).then((fn) => {
			unlistenProgress = fn;
		});

		listen<{ fixed: number; skipped: number; files: string[] }>(
			"fix:done",
			() => {
				setFinished(true);
			},
		).then((fn) => {
			unlistenDone = fn;
		});

		api.fixRepo(repoId).catch(() => {
			setFinished(true);
		});

		return () => {
			unlistenProgress?.();
			unlistenDone?.();
		};
	}, [repoId]);

	useEffect(() => {
		if (listRef.current) {
			listRef.current.scrollTop = listRef.current.scrollHeight;
		}
	}, [entries]);

	const pct =
		totalIssues > 0
			? Math.round((processedCount / totalIssues) * 100)
			: finished
				? 100
				: 0;

	return (
		<div className="space-y-4">
			<div className="space-y-1.5">
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">
						{finished ? "Done" : "Fixing frontmatter…"}
					</span>
					<span className="font-mono text-xs tabular-nums text-muted-foreground">
						{fixedCount} fixed
						{processedCount > 0 && processedCount > fixedCount && (
							<span className="ml-1 opacity-60">
								· {processedCount - fixedCount} skipped
							</span>
						)}
					</span>
				</div>
				<div className="h-1.5 rounded-full bg-muted overflow-hidden">
					<div
						className="h-full rounded-full bg-primary transition-all duration-100"
						style={{ width: `${finished ? 100 : pct}%` }}
					/>
				</div>
			</div>

			<div
				ref={listRef}
				className="rounded-lg border border-border divide-y divide-border max-h-52 overflow-y-auto text-xs font-mono"
			>
				{entries.length === 0 && !finished && (
					<div className="p-3 text-muted-foreground flex items-center gap-2">
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
						Starting…
					</div>
				)}
				{entries.map((entry, i) =>
					entry.fixed ? (
						<div
							key={`${entry.file}-${i}`}
							className="px-3 py-1.5 flex items-center gap-2 truncate"
						>
							<CheckCircle2 className="w-3 h-3 shrink-0 text-green-500" />
							<span className="truncate text-foreground">{entry.file}</span>
						</div>
					) : null,
				)}
			</div>

			<Button
				variant="solid"
				size="lg"
				className="w-full"
				disabled={!finished}
				onClick={onDone}
			>
				{finished ? (
					<>
						Open {repoName}
					</>
				) : (
					<>
						<Loader2 className="w-4 h-4 mr-2 animate-spin" />
						Please wait…
					</>
				)}
			</Button>
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
	const [repoId, setRepoId] = useState("");
	const [repoName, setRepoName] = useState("");
	const [initialAdded, setInitialAdded] = useState(0);
	const [issues, setIssues] = useState<ValidationIssue[]>([]);
	const [analyzing, setAnalyzing] = useState(false);
	const addRepo = useAddRepo();
	const navigate = useNavigate();

	if (!isOpen) return null;

	const reset = () => {
		setPath("");
		setName("");
		setStep("info");
		setFolders([]);
		setRepoId("");
		setRepoName("");
		setInitialAdded(0);
		setIssues([]);
		setAnalyzing(false);
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
		if (!path || !name) return;
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
				if (i !== idx) return f;
				return { ...f, typeName: v, idPrefix: deriveIdPrefix(v) };
			}),
		);
	};

	const handleIdPrefixChange = (idx: number, v: string) => {
		setFolders((prev) =>
			prev.map((f, i) => (i === idx ? { ...f, idPrefix: v.toUpperCase() } : f)),
		);
	};

	// Step 2 → 3: add repo then run validation to show analysis
	const handleContinueToAnalysis = () => {
		const config = buildRepoConfig(folders);
		const configJson = JSON.stringify(config);

		setAnalyzing(true);
		addRepo.mutate(
			{ name, path, config: configJson },
			{
				onSuccess: async ([repo, scanReport]) => {
					try {
						await api.writeRoadmapJson(path, configJson);
					} catch {
						// Non-fatal
					}
					setRepoId(repo.id);
					setRepoName(repo.name);

					try {
						const validation = await api.validateRepo(repo.id);
						// Use validation.passing as the indexed count — it reflects all files
						// on disk that have complete frontmatter, regardless of whether they
						// were new inserts or pre-existing updates in the DB.
						setInitialAdded(validation.passing);
						setIssues(validation.issues);
					} catch {
						setInitialAdded(scanReport.added + scanReport.updated);
						setIssues([]);
					}
					setAnalyzing(false);
					setStep("analysis");
				},
				onError: (err) => {
					setAnalyzing(false);
					toast.error(`Failed: ${err}`);
				},
			},
		);
	};

	const handleSkipFix = () => {
		navigate(`/repos/${repoId}`);
		handleClose();
	};

	const handleStartFix = () => {
		setStep("fixing");
	};

	const handleFixingDone = () => {
		navigate(`/repos/${repoId}`);
		handleClose();
	};

	const stepLabel =
		step === "folders"
			? "Step 2 of 3 — Managed folders"
			: step === "analysis" || step === "fixing"
				? "Step 3 of 3 — Scan results"
				: undefined;

	const isLocked = step === "fixing";

	return (
		<ModalOverlay onClose={isLocked ? undefined : handleClose}>
			<ModalPanel className="w-full max-w-md p-6">
				<div className="flex items-center justify-between mb-6">
					<div>
						<h3 className="text-lg font-semibold">Add Repository</h3>
						{stepLabel && (
							<p className="text-xs text-muted-foreground mt-0.5">
								{stepLabel}
							</p>
						)}
					</div>
					{!isLocked && (
						<Button variant="ghost" size="icon" onClick={handleClose}>
							<X className="w-4 h-4" />
						</Button>
					)}
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
						onContinue={handleContinueToAnalysis}
						loading={analyzing || addRepo.isPending}
					/>
				)}

				{step === "analysis" && (
					<StepAnalysis
						repoId={repoId}
						repoName={repoName}
						initialAdded={initialAdded}
						issues={issues}
						onFix={handleStartFix}
						onSkip={handleSkipFix}
					/>
				)}

				{step === "fixing" && (
					<StepFixing
						repoId={repoId}
						repoName={repoName}
						totalIssues={issues.length}
						onDone={handleFixingDone}
					/>
				)}
			</ModalPanel>
		</ModalOverlay>
	);
}
