export interface FileChange {
  filePath: string;
  oldContent: string;
  newContent: string;
  editType: "edit" | "write" | "create" | "delete";
  timestamp: number;
  /** Number of lines in the file before the change */
  lineCount?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
  added: string[];
  removed: string[];
}

export interface FunctionChange {
  name: string;
  changeType: "added" | "removed" | "modified" | "renamed";
  oldSignature?: string;
  newSignature?: string;
  returnTypeChanged: boolean;
  paramsChanged: boolean;
  asyncChanged: boolean;
  details: string;
}

export interface ExportChange {
  name: string;
  changeType: "added" | "removed" | "modified";
  kind: "function" | "class" | "type" | "interface" | "variable" | "enum" | "default" | "unknown";
}

export interface TypeChange {
  name: string;
  changeType: "added" | "removed" | "modified";
  kind: "interface" | "type" | "enum" | "class";
  details: string;
}

export interface DependencyChange {
  name: string;
  changeType: "added" | "removed" | "upgraded" | "downgraded";
  oldVersion?: string;
  newVersion?: string;
}

export interface ImportInfo {
  filePath: string;
  importedNames: string[];
  importSource: string;
}

export interface AffectedDependent {
  filePath: string;
  usesSymbols: string[];
  brokenSymbols: string[];
  status: "ok" | "likely-broken" | "needs-review";
  reason: string;
}

export interface AffectedTest {
  filePath: string;
  relatedSource: string;
  status: "likely-broken" | "needs-review" | "ok";
  reason: string;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  reasons: string[];
}

export interface FileAnalysis {
  filePath: string;
  editType: FileChange["editType"];
  functions: FunctionChange[];
  exports: ExportChange[];
  types: TypeChange[];
  behaviorChanges: string[];
  configChanges: string[];
}

export interface SemanticReport {
  sessionId: string;
  timestamp: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  fileAnalyses: FileAnalysis[];
  behaviorChanges: string[];
  apiChanges: string[];
  breakingChanges: string[];
  sideEffects: AffectedDependent[];
  affectedTests: AffectedTest[];
  dependencyChanges: DependencyChange[];
  risk: RiskAssessment;
}

export interface SessionData {
  sessionId: string;
  startTime: number;
  changes: FileChange[];
}

export interface HookInput {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
}

export interface VibeDiffConfig {
  autoRun: boolean;
  outputFormat: "terminal" | "markdown" | "both";
  saveToDisk: boolean;
  includeRiskScore: boolean;
  generateCommitMessage: boolean;
  projectRoot: string;
}
