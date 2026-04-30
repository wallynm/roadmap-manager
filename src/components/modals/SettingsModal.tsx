import {
	Check,
	ChevronDown,
	ChevronUp,
	Folder,
	Plus,
	RefreshCw,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { ModalOverlay, ModalPanel } from "@/components/ui/Modal";
import { useItems } from "@/hooks/useItems";
import { useLabelWeights, useScopeWeights } from "@/hooks/usePrefs";
import {
	useRemoveRepo,
	useRepos,
	useRescanRepo,
	useUpdateRepo,
} from "@/hooks/useRepos";
import { api, parseRepoDisplay, setRepoDisplayColor } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { Repo, RepoConfig, TemplateConfig } from "@/types";

// ── module-level open handle ────────────────────────────────────────────────
let _open: (() => void) | null = null;
export function openSettings() {
	_open?.();
}

const REPO_RE = /\/repos\/([^/]+)/;

const COLOR_PALETTE = [
	"#6366f1",
	"#8b5cf6",
	"#0ea5e9",
	"#14b8a6",
	"#10b981",
	"#f59e0b",
	"#f97316",
	"#f43f5e",
	"#ec4899",
	"#64748b",
];

function repoInitials(name: string): string {
	return name
		.split(/[\s\-_./]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0].toUpperCase())
		.join("");
}

// ── nav sections ────────────────────────────────────────────────────────────
const SECTIONS = [
	{ id: "general", label: "General" },
	{ id: "folders", label: "Folders" },
	{ id: "next-up", label: "Next Up" },
	{ id: "danger", label: "Danger zone" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

// ── sub-components ──────────────────────────────────────────────────────────
function GeneralSection({ repo }: { repo: Repo }) {
	const [name, setName] = useState(repo.name);
	const [color, setColor] = useState(parseRepoDisplay(repo.config).color ?? "");
	const updateRepo = useUpdateRepo();
	const rescanRepo = useRescanRepo();
	const nameId = useId();

	useEffect(() => {
		setName(repo.name);
		setColor(parseRepoDisplay(repo.config).color ?? "");
	}, [repo.name, repo.config]);

	const isDirty =
		name.trim() !== repo.name ||
		color !== (parseRepoDisplay(repo.config).color ?? "");

	const handleSave = () => {
		const newConfig = setRepoDisplayColor(repo.config, color || undefined);
		updateRepo.mutate(
			{ id: repo.id, name: name.trim() || repo.name, config: newConfig },
			{ onSuccess: () => toast.success("Saved") },
		);
	};

	return (
		<div className="space-y-8">
			<h2 className="text-sm font-semibold">General</h2>

			{/* Appearance */}
			<div className="space-y-4">
				<div className="flex items-center gap-4">
					<div
						className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-white text-sm font-bold"
						style={{ backgroundColor: color || "#6366f1" }}
					>
						{repoInitials(name)}
					</div>
					<div className="flex-1 space-y-1">
						<label htmlFor={nameId} className="text-xs text-muted-foreground">
							Name
						</label>
						<Input
							id={nameId}
							value={name}
							onChange={(e) => setName(e.target.value)}
							size="md"
							className="w-full select-text"
							placeholder="Project name"
						/>
					</div>
				</div>

				<div className="space-y-2">
					<p className="text-xs text-muted-foreground">Color</p>
					<div className="flex items-center gap-2 flex-wrap">
						{COLOR_PALETTE.map((hex) => (
							<button
								key={hex}
								type="button"
								onClick={() => setColor(color === hex ? "" : hex)}
								className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none"
								style={{ backgroundColor: hex }}
							>
								{color === hex && (
									<Check className="w-3 h-3 text-white" strokeWidth={3} />
								)}
							</button>
						))}
					</div>
				</div>

				{isDirty && (
					<Button
						variant="primary"
						size="sm"
						loading={updateRepo.isPending}
						onClick={handleSave}
					>
						Save changes
					</Button>
				)}
			</div>

			{/* Repository */}
			<div className="space-y-3">
				<p className="text-xs font-medium text-muted-foreground">Repository</p>
				<div className="rounded-lg border border-border divide-y divide-border">
					<div className="flex items-baseline justify-between px-3 py-2 gap-4">
						<span className="text-xs text-muted-foreground shrink-0">Path</span>
						<span className="text-xs font-mono text-foreground truncate text-right select-text">
							{repo.path}
						</span>
					</div>
					<div className="flex items-baseline justify-between px-3 py-2 gap-4">
						<span className="text-xs text-muted-foreground shrink-0">
							Last scan
						</span>
						<span className="text-xs text-foreground select-text">
							{repo.last_scan ?? "Never"}
						</span>
					</div>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={() =>
						rescanRepo.mutate(repo.id, {
							onSuccess: (r) =>
								toast.success(
									`Rescanned: +${r.added} ~${r.updated} -${r.removed}`,
								),
						})
					}
				>
					<RefreshCw className="w-3.5 h-3.5" />
					Rescan now
				</Button>
			</div>
		</div>
	);
}

function NextUpSection({ repoId }: { repoId: string }) {
	return (
		<div className="space-y-8">
			<h2 className="text-sm font-semibold">Next Up</h2>
			<ScopeWeightsPanel repoId={repoId} />
			<LabelWeightsPanel repoId={repoId} />
		</div>
	);
}

function ScopeWeightsPanel({ repoId }: { repoId: string }) {
	const { data: items } = useItems(repoId, undefined);
	const { weights, setWeight, remove } = useScopeWeights(repoId);
	const selectId = useId();
	const [newScope, setNewScope] = useState("");

	const allScopes = useMemo(() => {
		const set = new Set<string>();
		for (const item of items ?? []) {
			if (item.scope) {
				set.add(item.scope);
			}
		}
		return [...set].sort();
	}, [items]);

	const configured = Object.entries(weights).sort(([a], [b]) =>
		a.localeCompare(b),
	);
	const unconfigured = allScopes.filter((s) => !(s in weights));

	const scopeLabel = (s: string) => s.split("/").pop() ?? s;

	const handleAdd = (scope: string) => {
		if (!scope || scope in weights) {
			return;
		}
		setWeight(scope, 1);
		setNewScope("");
	};

	return (
		<div className="space-y-3">
			<div>
				<p className="text-xs font-medium">Scope weights</p>
				<p className="text-xs text-muted-foreground mt-0.5">
					Multiplies all items in a scope. Default ×1.
				</p>
			</div>

			{configured.length > 0 && (
				<div className="rounded-lg border border-border divide-y divide-border">
					{configured.map(([scope, multiplier]) => (
						<div key={scope} className="flex items-center gap-2 px-3 py-2">
							<span className="flex-1 text-xs">
								<span className="font-medium">{scopeLabel(scope)}</span>
								<span className="text-muted-foreground/50 ml-1.5 font-mono text-[10px]">
									{scope}
								</span>
							</span>
							<span className="text-xs text-muted-foreground">×</span>
							<Input
								type="number"
								min={0.1}
								step={1}
								value={multiplier}
								onChange={(e) => {
									const v = parseFloat(e.target.value);
									if (!Number.isNaN(v) && v > 0) {
										setWeight(scope, v);
									}
								}}
								size="xs"
								numeric
								className="w-16 select-text"
							/>
							<button
								type="button"
								onClick={() => remove(scope)}
								className="text-muted-foreground/40 hover:text-destructive ml-1"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</div>
					))}
				</div>
			)}

			{configured.length === 0 && (
				<p className="text-xs text-muted-foreground/50 italic">
					No scope weights configured.
				</p>
			)}

			<div className="flex items-center gap-2">
				{unconfigured.length > 0 ? (
					<Select
						id={selectId}
						value={newScope}
						onChange={(e) => setNewScope(e.target.value)}
						size="sm"
						className="flex-1"
					>
						<option value="">Pick a scope…</option>
						{unconfigured.map((s) => (
							<option key={s} value={s}>
								{scopeLabel(s)} — {s}
							</option>
						))}
					</Select>
				) : (
					<Input
						id={selectId}
						value={newScope}
						onChange={(e) => setNewScope(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleAdd(newScope);
							}
						}}
						placeholder="Type a scope path…"
						size="sm"
						className="flex-1 select-text"
					/>
				)}
				<Button
					variant="secondary"
					size="sm"
					onClick={() => handleAdd(newScope)}
					disabled={!newScope}
				>
					<Plus className="w-3.5 h-3.5" />
					Add
				</Button>
			</div>
		</div>
	);
}

function LabelWeightsPanel({ repoId }: { repoId: string }) {
	const { data: items } = useItems(repoId, undefined);
	const { weights, setMultiplier, reorder, remove } = useLabelWeights(repoId);
	const selectId = useId();
	const [newLabel, setNewLabel] = useState("");

	const allLabels = useMemo(() => {
		const set = new Set<string>();
		for (const item of items ?? []) {
			try {
				(JSON.parse(item.labels) as string[]).forEach((l) => set.add(l));
			} catch {}
		}
		return [...set].sort();
	}, [items]);

	const configuredSet = new Set(weights.map((w) => w.label));
	const unconfigured = allLabels.filter((l) => !configuredSet.has(l));

	const handleAdd = (label: string) => {
		const t = label.trim();
		if (!t || configuredSet.has(t)) {
			return;
		}
		setMultiplier(t, 1);
		setNewLabel("");
	};

	return (
		<div className="space-y-3">
			<div>
				<p className="text-xs font-medium">Label weights</p>
				<p className="text-xs text-muted-foreground mt-0.5">
					Product of matched label multipliers. Default ×1.
				</p>
			</div>

			{weights.length > 0 && (
				<div className="rounded-lg border border-border divide-y divide-border">
					{weights.map((w, i) => (
						<div key={w.label} className="flex items-center gap-2 px-3 py-2">
							<div className="flex flex-col gap-0.5 shrink-0">
								<button
									type="button"
									disabled={i === 0}
									onClick={() => reorder(i, i - 1)}
									className="text-muted-foreground/40 hover:text-foreground disabled:opacity-20"
								>
									<ChevronUp className="w-3 h-3" />
								</button>
								<button
									type="button"
									disabled={i === weights.length - 1}
									onClick={() => reorder(i, i + 1)}
									className="text-muted-foreground/40 hover:text-foreground disabled:opacity-20"
								>
									<ChevronDown className="w-3 h-3" />
								</button>
							</div>
							<span className="text-[10px] text-muted-foreground/40 tabular-nums w-4">
								{i + 1}
							</span>
							<span className="flex-1 text-xs">{w.label}</span>
							<span className="text-xs text-muted-foreground">×</span>
							<Input
								type="number"
								min={0.1}
								step={0.5}
								value={w.multiplier}
								onChange={(e) => {
									const v = parseFloat(e.target.value);
									if (!Number.isNaN(v) && v > 0) {
										setMultiplier(w.label, v);
									}
								}}
								size="xs"
								numeric
								className="w-16 select-text"
							/>
							<button
								type="button"
								onClick={() => remove(w.label)}
								className="text-muted-foreground/40 hover:text-destructive ml-1"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</div>
					))}
				</div>
			)}

			{weights.length === 0 && (
				<p className="text-xs text-muted-foreground/50 italic">
					No label weights configured.
				</p>
			)}

			<div className="flex items-center gap-2">
				{unconfigured.length > 0 ? (
					<Select
						id={selectId}
						value={newLabel}
						onChange={(e) => setNewLabel(e.target.value)}
						size="sm"
						className="flex-1"
					>
						<option value="">Pick a label…</option>
						{unconfigured.map((l) => (
							<option key={l} value={l}>
								{l}
							</option>
						))}
					</Select>
				) : (
					<Input
						id={selectId}
						value={newLabel}
						onChange={(e) => setNewLabel(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleAdd(newLabel);
							}
						}}
						placeholder="Type a label name…"
						size="sm"
						className="flex-1 select-text"
					/>
				)}
				<Button
					variant="secondary"
					size="sm"
					onClick={() => handleAdd(newLabel)}
					disabled={!newLabel.trim()}
				>
					<Plus className="w-3.5 h-3.5" />
					Add
				</Button>
			</div>
		</div>
	);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseRepoConfig(configJson: string): RepoConfig {
	try {
		return JSON.parse(configJson) as RepoConfig;
	} catch {
		return {
			templates: {},
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
}

function patchTemplates(
	existingConfigJson: string,
	templates: Record<string, TemplateConfig>,
): string {
	try {
		const cfg = JSON.parse(existingConfigJson) as Record<string, unknown>;
		cfg.templates = templates;
		return JSON.stringify(cfg);
	} catch {
		return JSON.stringify({ templates });
	}
}

// ── Folders section ──────────────────────────────────────────────────────────

interface NewFolderForm {
	dir: string;
	typeName: string;
	idPrefix: string;
}

const EMPTY_FORM: NewFolderForm = { dir: "", typeName: "", idPrefix: "" };

function FoldersSection({ repo }: { repo: Repo }) {
	const config = useMemo(() => parseRepoConfig(repo.config), [repo.config]);
	const [templates, setTemplates] = useState<Record<string, TemplateConfig>>(
		() => ({ ...config.templates }),
	);
	const [form, setForm] = useState<NewFolderForm>(EMPTY_FORM);
	const [saving, setSaving] = useState(false);
	const updateRepo = useUpdateRepo();
	const rescanRepo = useRescanRepo();
	const dirId = useId();
	const typeId = useId();
	const prefixId = useId();

	const isDirty =
		JSON.stringify(templates) !== JSON.stringify(config.templates);

	const handleRemove = (key: string) => {
		setTemplates((prev) => {
			const next = { ...prev };
			delete next[key];
			return next;
		});
	};

	const handleAdd = () => {
		const dir = form.dir.trim();
		const typeName = form.typeName.trim();
		const idPrefix =
			form.idPrefix.trim().toUpperCase() || typeName.slice(0, 3).toUpperCase();
		if (!dir || !typeName) {
			return;
		}
		const key = typeName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
		setTemplates((prev) => ({
			...prev,
			[key]: {
				dir,
				filePrefix: idPrefix.slice(0, 3).toLowerCase(),
				idPrefix,
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
				bodyTemplate: "# {ID} — {TITLE}\n\nTODO\n",
			},
		}));
		setForm(EMPTY_FORM);
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			const newConfigJson = patchTemplates(repo.config, templates);

			await new Promise<void>((resolve, reject) => {
				updateRepo.mutate(
					{ id: repo.id, name: repo.name, config: newConfigJson },
					{ onSuccess: () => resolve(), onError: (e) => reject(e) },
				);
			});

			try {
				await api.writeRoadmapJson(repo.path, newConfigJson);
			} catch {
				// Non-fatal: roadmap.json write failure doesn't block the save
			}

			rescanRepo.mutate(repo.id, {
				onSuccess: (r) =>
					toast.success(
						`Saved — rescanned: +${r.added} ~${r.updated} -${r.removed}`,
					),
			});
		} catch (err) {
			toast.error(`Failed to save: ${err}`);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-6">
			<h2 className="text-sm font-semibold">Folders</h2>

			<p className="text-xs text-muted-foreground">
				Each folder maps to a template type. Changes are saved to the DB config
				and written to <span className="font-mono">roadmap.json</span> in the
				repo root.
			</p>

			{/* Current templates */}
			{Object.keys(templates).length === 0 ? (
				<p className="text-xs text-muted-foreground/50 italic">
					No folders configured.
				</p>
			) : (
				<div className="rounded-lg border border-border divide-y divide-border">
					{Object.entries(templates).map(([key, t]) => (
						<div key={key} className="flex items-center gap-3 px-3 py-2.5">
							<Folder className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-xs font-medium">{key}</span>
									<span className="text-[10px] font-mono text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">
										{t.idPrefix}
									</span>
								</div>
								<span className="text-[10px] font-mono text-muted-foreground truncate block">
									{t.dir}
								</span>
							</div>
							<button
								type="button"
								onClick={() => handleRemove(key)}
								className="text-muted-foreground/40 hover:text-destructive transition-colors"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</div>
					))}
				</div>
			)}

			{/* Add new folder */}
			<div className="space-y-3">
				<p className="text-xs font-medium text-muted-foreground">Add folder</p>
				<div className="space-y-2">
					<div>
						<label
							htmlFor={dirId}
							className="text-[10px] text-muted-foreground/70 block mb-0.5"
						>
							Folder path (relative to repo root)
						</label>
						<Input
							id={dirId}
							value={form.dir}
							onChange={(e) => setForm((f) => ({ ...f, dir: e.target.value }))}
							placeholder="roadmaps"
							size="sm"
							className="w-full font-mono"
						/>
					</div>
					<div className="flex gap-2">
						<div className="flex-1">
							<label
								htmlFor={typeId}
								className="text-[10px] text-muted-foreground/70 block mb-0.5"
							>
								Type name
							</label>
							<Input
								id={typeId}
								value={form.typeName}
								onChange={(e) =>
									setForm((f) => ({ ...f, typeName: e.target.value }))
								}
								placeholder="roadmap"
								size="sm"
								className="w-full"
							/>
						</div>
						<div className="w-24">
							<label
								htmlFor={prefixId}
								className="text-[10px] text-muted-foreground/70 block mb-0.5"
							>
								ID prefix
							</label>
							<Input
								id={prefixId}
								value={form.idPrefix}
								onChange={(e) =>
									setForm((f) => ({
										...f,
										idPrefix: e.target.value.toUpperCase(),
									}))
								}
								placeholder="RD"
								size="sm"
								className="w-full font-mono uppercase"
							/>
						</div>
					</div>
					<Button
						variant="secondary"
						size="sm"
						onClick={handleAdd}
						disabled={!form.dir.trim() || !form.typeName.trim()}
					>
						<Plus className="w-3.5 h-3.5" />
						Add folder
					</Button>
				</div>
			</div>

			{isDirty && (
				<Button
					variant="primary"
					size="sm"
					loading={saving}
					onClick={handleSave}
				>
					Save & rescan
				</Button>
			)}
		</div>
	);
}

function DangerSection({ repo, onClose }: { repo: Repo; onClose: () => void }) {
	const removeRepo = useRemoveRepo();
	const navigate = useNavigate();

	return (
		<div className="space-y-6">
			<h2 className="text-sm font-semibold">Danger zone</h2>
			<div className="rounded-lg border border-destructive/30 p-4 flex items-center justify-between">
				<div>
					<p className="text-sm font-medium">Remove project</p>
					<p className="text-xs text-muted-foreground">
						Removes the project from Roadmap Manager. Files are not deleted.
					</p>
				</div>
				<Button
					variant="destructive"
					size="sm"
					onClick={() =>
						removeRepo.mutate(repo.id, {
							onSuccess: () => {
								toast.success("Project removed");
								onClose();
								navigate("/");
							},
						})
					}
				>
					<Trash2 className="w-3.5 h-3.5" />
					Remove
				</Button>
			</div>
		</div>
	);
}

// ── main modal ──────────────────────────────────────────────────────────────
export function SettingsModal() {
	const [open, setOpen] = useState(false);
	const [section, setSection] = useState<SectionId>("general");
	const location = useLocation();
	const repoId = REPO_RE.exec(location.pathname)?.[1] ?? null;
	const { data: repos } = useRepos();
	const repo = repos?.find((r) => r.id === repoId);

	useEffect(() => {
		_open = () => setOpen(true);
		return () => {
			_open = null;
		};
	}, []);

	useEffect(() => {
		if (!open) {
			return;
		}
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setOpen(false);
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open]);

	if (!open) {
		return null;
	}

	return (
		<ModalOverlay onClose={() => setOpen(false)}>
			<ModalPanel className="rounded-2xl flex w-[780px] h-[540px] overflow-hidden">
				{/* Left nav */}
				<nav className="w-44 shrink-0 bg-secondary/30 border-r border-border flex flex-col py-4 px-2">
					<p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-2 pb-2">
						Settings
					</p>
					{SECTIONS.map((s) => (
						<button
							key={s.id}
							type="button"
							onClick={() => setSection(s.id)}
							className={cn(
								"flex items-center w-full px-2 py-1.5 text-xs rounded-lg transition-colors text-left mt-px first:mt-0",
								section === s.id
									? "bg-primary/10 text-primary font-medium"
									: "text-muted-foreground hover:text-foreground hover:bg-accent",
								s.id === "danger" &&
									section !== "danger" &&
									"text-destructive/60 hover:text-destructive",
								s.id === "danger" &&
									section === "danger" &&
									"bg-destructive/10 text-destructive",
							)}
						>
							{s.label}
						</button>
					))}
				</nav>

				{/* Content */}
				<div className="flex-1 overflow-y-auto p-8">
					{!repo ? (
						<p className="text-sm text-muted-foreground">
							No project selected.
						</p>
					) : (
						<>
							{section === "general" && <GeneralSection repo={repo} />}
							{section === "folders" && <FoldersSection repo={repo} />}
							{section === "next-up" && <NextUpSection repoId={repo.id} />}
							{section === "danger" && (
								<DangerSection repo={repo} onClose={() => setOpen(false)} />
							)}
						</>
					)}
				</div>

				{/* Close */}
				<button
					type="button"
					onClick={() => setOpen(false)}
					className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-accent transition-colors"
				>
					<X className="w-4 h-4" />
				</button>
			</ModalPanel>
		</ModalOverlay>
	);
}
