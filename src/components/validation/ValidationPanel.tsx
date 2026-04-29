import { useState } from "react";
import {
  useValidateRepo,
  useFixRepo,
  useDepsCheck,
  useArchiveDryRun,
  useArchiveExecute,
} from "@/hooks/useValidation";
import type {
  ValidationReport,
  ValidationIssue,
  DepAnalysis,
  DepIssue,
  ArchiveDryRun,
} from "@/types";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertTriangle,
  FileWarning,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Wrench,
  Archive,
  GitBranch,
} from "lucide-react";

interface Props {
  repoId: string;
  onFileClick?: (filePath: string) => void;
}

function SummaryBar({ report }: { report: ValidationReport }) {
  const allPass = report.failing === 0;
  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3 rounded-lg text-sm font-medium",
        allPass
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-red-500/10 text-red-400"
      )}
    >
      {allPass ? (
        <CheckCircle2 className="w-4 h-4 shrink-0" />
      ) : (
        <AlertTriangle className="w-4 h-4 shrink-0" />
      )}
      <span>
        {allPass
          ? "All files conform to their template."
          : `${report.failing} of ${report.checked} files have issues.`}
      </span>
      <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground font-normal">
        <span>Checked: {report.checked}</span>
        <span className="text-emerald-400">Pass: {report.passing}</span>
        <span className="text-red-400">Fail: {report.failing}</span>
      </div>
    </div>
  );
}

function IssueRow({
  issue,
  onFileClick,
}: {
  issue: ValidationIssue;
  onFileClick?: (filePath: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-accent/30 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <FileText className="w-3.5 h-3.5 text-red-400 shrink-0" />
        <span className="font-mono text-xs truncate flex-1">{issue.file}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
          {issue.template}
        </span>
        <span className="text-xs text-red-400 shrink-0">
          {issue.missing.length} missing
        </span>
      </button>
      {expanded && (
        <div className="px-4 py-3 bg-card/50 border-t border-border space-y-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Missing required fields</p>
            <div className="flex flex-wrap gap-1.5">
              {issue.missing.map((field) => (
                <span key={field} className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-mono">
                  {field}
                </span>
              ))}
            </div>
          </div>
          {issue.extra.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Extra fields</p>
              <div className="flex flex-wrap gap-1.5">
                {issue.extra.map((field) => (
                  <span key={field} className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-mono">
                    {field}
                  </span>
                ))}
              </div>
            </div>
          )}
          {onFileClick && (
            <button
              onClick={(e) => { e.stopPropagation(); onFileClick(issue.file); }}
              className="text-xs text-primary hover:underline mt-1"
            >
              Open file
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DepIssueRow({ issue }: { issue: DepIssue }) {
  const kindLabel = { orphan: "Orphan", self_ref: "Self-ref", cycle: "Cycle" }[issue.kind];
  const kindColor = { orphan: "text-amber-400", self_ref: "text-red-400", cycle: "text-red-400" }[issue.kind];
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-sm border border-border rounded-lg">
      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full bg-secondary", kindColor)}>
        {kindLabel}
      </span>
      <span className="font-mono text-xs text-muted-foreground">{issue.external_id}</span>
      <span className="text-xs text-foreground truncate flex-1">{issue.detail}</span>
    </div>
  );
}

function DepSection({ analysis }: { analysis: DepAnalysis }) {
  const total = analysis.orphans.length + analysis.self_refs.length + analysis.cycles.length;
  const allIssues = [...analysis.cycles, ...analysis.self_refs, ...analysis.orphans];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Dep Graph Analysis</h3>
        {total === 0 ? (
          <span className="text-xs text-emerald-400 ml-2">Clean</span>
        ) : (
          <span className="text-xs text-red-400 ml-2">{total} issues</span>
        )}
      </div>
      {total === 0 && (
        <p className="text-xs text-muted-foreground px-4">No orphans, self-refs, or cycles found.</p>
      )}
      {allIssues.map((issue, i) => (
        <DepIssueRow key={i} issue={issue} />
      ))}
    </div>
  );
}


function ArchiveSection({
  repoId,
  dryRun,
  onDryRun,
  isDryRunning,
}: {
  repoId: string;
  dryRun: ArchiveDryRun | null;
  onDryRun: () => void;
  isDryRunning: boolean;
}) {
  const executeMutation = useArchiveExecute(repoId);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Archive className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Archive Shipped Items</h3>
        <button
          onClick={onDryRun}
          disabled={isDryRunning}
          className="ml-auto text-xs px-2.5 py-1 rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition-colors disabled:opacity-50"
        >
          {isDryRunning ? "Scanning..." : "Dry run"}
        </button>
      </div>

      {dryRun && dryRun.candidates.length === 0 && (
        <p className="text-xs text-emerald-400 px-4">No shipped items to archive.</p>
      )}

      {dryRun && dryRun.candidates.length > 0 && (
        <div className="border border-border rounded-lg p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Would move <strong className="text-foreground">{dryRun.candidates.length}</strong> files,
            update <strong className="text-foreground">{dryRun.ref_updates}</strong> references.
          </p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {dryRun.candidates.map((c) => (
              <div key={c.file_path} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground truncate">{c.file_path}</span>
                <span className="text-muted-foreground shrink-0">&rarr;</span>
                <span className="font-mono text-emerald-400 truncate">{c.target_path}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => executeMutation.mutate()}
            disabled={executeMutation.isPending}
            className={cn(
              "text-xs px-3 py-1.5 rounded-md font-medium transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50"
            )}
          >
            {executeMutation.isPending ? "Archiving..." : `Archive ${dryRun.candidates.length} items`}
          </button>
          {executeMutation.data && (
            <p className="text-xs text-emerald-400">
              Archived {executeMutation.data.moved} files, updated {executeMutation.data.refs_updated} refs.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ValidationPanel({ repoId, onFileClick }: Props) {
  const validateMutation = useValidateRepo(repoId);
  const fixMutation = useFixRepo(repoId);
  const depsMutation = useDepsCheck(repoId);
  const archiveDryRunMutation = useArchiveDryRun(repoId);

  const report = validateMutation.data ?? null;
  const depsAnalysis = depsMutation.data ?? null;
  const archiveDryRun = archiveDryRunMutation.data ?? null;

  const runAll = () => {
    validateMutation.mutate();
    depsMutation.mutate();
  };

  const handleFixAll = () => {
    fixMutation.mutate(undefined, {
      onSuccess: () => {
        validateMutation.mutate();
      },
    });
  };

  return (
    <div className="h-full flex flex-col gap-6 overflow-y-auto pr-1">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Pipeline Parity</h2>
        <div className="flex items-center gap-2">
          {report && report.failing > 0 && (
            <button
              onClick={handleFixAll}
              disabled={fixMutation.isPending || validateMutation.isPending}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25",
                "disabled:opacity-50"
              )}
            >
              <Wrench className={cn("w-3 h-3", (fixMutation.isPending || validateMutation.isPending) && "animate-spin")} />
              {fixMutation.isPending ? "Fixing..." : validateMutation.isPending ? "Re-checking..." : "Fix all"}
            </button>
          )}
          <button
            onClick={runAll}
            disabled={validateMutation.isPending}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-50"
            )}
          >
            <RefreshCw className={cn("w-3 h-3", validateMutation.isPending && "animate-spin")} />
            {validateMutation.isPending ? "Running..." : "Run all checks"}
          </button>
        </div>
      </div>

      {fixMutation.data && fixMutation.data.fixed > 0 && (
        <div className="bg-emerald-500/10 text-emerald-400 px-4 py-2 rounded-lg text-xs">
          Fixed {fixMutation.data.fixed} files. Single batch commit created.
        </div>
      )}

      {!report && !validateMutation.isPending && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm gap-2">
          <FileWarning className="w-8 h-8 opacity-40" />
          <p>Click "Run all checks" to validate frontmatter, deps, and impact.</p>
        </div>
      )}

      {report && (
        <>
          <SummaryBar report={report} />
          {report.issues.length > 0 && (
            <div className="space-y-2">
              {report.issues.map((issue) => (
                <IssueRow key={issue.file} issue={issue} onFileClick={onFileClick} />
              ))}
            </div>
          )}
          {report.orphan_files.length > 0 && (
            <div className="border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <p className="text-xs font-medium text-amber-400">
                  {report.orphan_files.length} .md files outside any template directory
                </p>
              </div>
              <div className="space-y-1">
                {report.orphan_files.map((f) => (
                  <p key={f} className="text-xs font-mono text-muted-foreground">{f}</p>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {depsAnalysis && <DepSection analysis={depsAnalysis} />}

      <ArchiveSection
        repoId={repoId}
        dryRun={archiveDryRun}
        onDryRun={() => archiveDryRunMutation.mutate()}
        isDryRunning={archiveDryRunMutation.isPending}
      />
    </div>
  );
}
