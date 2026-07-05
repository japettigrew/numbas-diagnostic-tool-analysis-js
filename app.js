const GROUP_COLOURS = [
  "#c75100", "#0072b2", "#009e73", "#cc79a7", "#b58a00",
  "#56b4e9", "#7f3c8d", "#8c564b", "#3969ac", "#e73f74",
  "#5f8d2e", "#008695", "#a65628", "#6a51a3", "#d73027"
];

const STORAGE_KEY = "nwgDiagnosticToolConfig";
const SETUP_CACHE_KEY = "nwgDiagnosticToolSetupCache";
const LOADING_OVERLAY_DELAY_MS = 2000;
const KM_NODE_WIDTH = 250;
const KM_NODE_HEIGHT = 86;
const KM_NODE_BORDER_WIDTH = 4;
const KM_NODE_ACTIVE_BORDER_WIDTH = 8;

let loadingOverlayTimer = null;
let graphPatternCounter = 0;

const state = {
  config: {
    questionThreshold: 0.5,
    setNumOfAttempts: 0,
    minimumNumberOfImpliedScores: 0,
    excludePreviewUsers: false,
    filePaths: {
      attemptData: "",
      exam: "",
      gexf: ""
    }
  },
  setupDirty: false,
  loadingLabel: "",
  kmVisibleGroups: null,
  kmSelectedNodeId: "",
  kmSearchQuery: "",
  kmLayoutMode: "default",
  showImpliedMatrices: false,
  importStatus: {
    imported: false,
    signature: "",
    message: ""
  },
  dashboardDirty: false,
  dashboardBuild: {
    running: false,
    tasks: [],
    message: ""
  },
  pendingSetupUpload: null,
  stagedSources: emptyStagedSources(),
  exam: null,
  km: null,
  gexf: null,
  attemptSources: [],
  attempts: [],
  datasets: null,
  implied: null,
  curriculum: null,
  validation: null,
  rasch: null,
  tracker: defaultTrackerState()
};

function defaultTrackerState() {
  return {
    rowKey: "",
    step: 0,
    finalState: false,
    studentQuery: "",
    directCorrectFilter: "",
    impliedCorrectFilter: "",
    scoredFilter: "",
    statusFilters: [],
    appliedStudentQuery: "",
    appliedDirectCorrectFilter: "",
    appliedImpliedCorrectFilter: "",
    appliedScoredFilter: ""
  };
}

document.addEventListener("DOMContentLoaded", () => {
  restoreConfig();
  initialiseTabs();
  bindGlobalButtons();
  makeFloatingPanelDraggable();
  renderAll();
});

function restoreConfig() {
  state.config.filePaths = { attemptData: "", exam: "", gexf: "" };
}

function saveConfig() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
}

function updateConfig(key, value) {
  if (key.includes(".")) {
    const [parent, child] = key.split(".");
    state.config[parent] = { ...(state.config[parent] || {}), [child]: value };
  } else {
    state.config[key] = value;
  }
  state.setupDirty = true;
  invalidateDashboardOutputs("Analysis settings changed. Import Sources if paths changed, then choose an enabled build button to refresh the affected outputs.");
  updateSaveSetupButton();
  renderAll();
}

function markSetupClean() {
  state.setupDirty = false;
  updateSaveSetupButton();
}

function updateSaveSetupButton() {
  const button = document.getElementById("saveSetupButton");
  if (!button) return;
  button.classList.toggle("is-dirty", state.setupDirty);
  button.classList.toggle("is-clean", !state.setupDirty);
}

function setLoading(label, detail = "") {
  state.loadingLabel = label || "";
  const overlay = document.getElementById("loadingOverlay");
  const labelNode = document.getElementById("loadingLabel");
  const detailNode = document.getElementById("loadingDetail");
  if (!overlay || !labelNode) return;
  const overlayWasVisible = !overlay.hidden;

  if (loadingOverlayTimer) {
    clearTimeout(loadingOverlayTimer);
    loadingOverlayTimer = null;
  }

  labelNode.textContent = state.loadingLabel || "Working";
  if (detailNode) detailNode.textContent = detail || "Preparing...";

  if (!state.loadingLabel) {
    overlay.hidden = true;
    return;
  }

  if (overlayWasVisible) return;

  overlay.hidden = true;
  const expectedLabel = state.loadingLabel;
  loadingOverlayTimer = setTimeout(() => {
    if (state.loadingLabel === expectedLabel) {
      overlay.hidden = false;
    }
    loadingOverlayTimer = null;
  }, LOADING_OVERLAY_DELAY_MS);
}

function updateLoadingDetail(detail) {
  const detailNode = document.getElementById("loadingDetail");
  if (detailNode) detailNode.textContent = detail || "";
}

async function withLoading(label, task, detail = "") {
  setLoading(label, detail);
  await new Promise((resolve) => setTimeout(resolve, 40));
  try {
    return await task();
  } finally {
    setLoading("");
    updateSaveSetupButton();
  }
}

function initialiseTabs() {
  document.querySelectorAll(".board-tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".board-tab").forEach((tab) => tab.classList.remove("is-active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("is-active"));
      button.classList.add("is-active");
      document.getElementById(button.dataset.tabTarget).classList.add("is-active");
      if (button.dataset.tabTarget === "trackerTab") {
        renderTracker();
      }
    });
  });
}

function bindGlobalButtons() {
  document.getElementById("saveSetupButton").addEventListener("click", () => {
    saveSetup().catch((error) => alert(`Could not save setup: ${error.message}`));
  });
  document.getElementById("downloadSetupButton").addEventListener("click", () => {
    downloadSetup().catch((error) => alert(`Could not download setup: ${error.message}`));
  });
  document.getElementById("uploadSetupButton").addEventListener("click", () => {
    document.getElementById("uploadSetupInput").click();
  });
  document.getElementById("uploadSetupInput").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) uploadSetup(file);
    event.target.value = "";
  });
  document.getElementById("resetWorkspaceButton").addEventListener("click", () => {
    if (!confirm("Reset the current browser workspace?")) return;
    Object.assign(state, {
      exam: null,
      km: null,
      gexf: null,
      stagedSources: emptyStagedSources(),
      attemptSources: [],
      attempts: [],
      datasets: null,
      implied: null,
      curriculum: null,
      validation: null,
      rasch: null,
      kmVisibleGroups: null,
      kmSelectedNodeId: "",
      kmSearchQuery: "",
      kmLayoutMode: "default",
      importStatus: { imported: false, signature: "", message: "" },
      dashboardDirty: false,
      dashboardBuild: { running: false, tasks: [], message: "" },
      pendingSetupUpload: null,
      tracker: defaultTrackerState()
    });
    state.config = {
      questionThreshold: 0.5,
      setNumOfAttempts: 0,
      minimumNumberOfImpliedScores: 0,
      excludePreviewUsers: false,
      filePaths: {
        attemptData: "",
        exam: "",
        gexf: ""
      }
    };
    state.setupDirty = false;
    saveConfig();
    renderAll();
  });
  document.getElementById("confirmUploadSetupButton").addEventListener("click", confirmSetupUpload);
  document.getElementById("cancelUploadSetupButton").addEventListener("click", closeSetupPreview);
  document.getElementById("closeDictionaryButton").addEventListener("click", () => {
    closeFloatingContent();
  });
  document.getElementById("downloadDictionaryCsvButton").addEventListener("click", () => {
    if (!state.km) return;
    downloadRows("kmDictionary_using_numbas_exam_json_data.csv", state.km.dictionary);
  });
  document.getElementById("downloadDictionaryJsonButton").addEventListener("click", () => {
    if (!state.km) return;
    downloadFile("kmDictionary_using_numbas_exam_json_data.json", "application/json", JSON.stringify(state.km.dictionary, null, 2));
  });
  document.getElementById("closeGraphModalButton").addEventListener("click", closeGraphModal);
  document.getElementById("graphModal").addEventListener("click", (event) => {
    if (event.target.id === "graphModal") closeGraphModal();
  });
}

function renderAll() {
  updateHeader();
  updateSaveSetupButton();
  renderSetup();
  renderKnowledgeMap();
  renderDatasets();
  renderImpliedScoring();
  renderRasch();
  renderCurriculum();
  renderValidation();
  renderTracker();
}

function updateHeader() {
  const parts = [];
  if (state.km) parts.push(`${state.km.nodes.length} KM topics`);
  if (state.attempts.length) parts.push(`${state.attempts.length} imported attempts`);
  if (state.datasets) parts.push(`${state.datasets.rows.length} dataset rows`);
  if (state.implied) parts.push(`${state.implied.rows.length} implied-scored rows`);
  if (state.dashboardDirty) parts.push("dashboard dirty");
  document.getElementById("headerStatus").textContent = parts.length ? parts.join(" | ") : "No data loaded";
}

function renderSetup() {
  const host = document.getElementById("setupTab");
  host.replaceChildren(
    panel(
      "Setup and Data Staging",
      "Stage source paths and analysis parameters. Calculations run in JavaScript in this browser.",
      [
        el("div", { class: "setup-staging-layout" }, [
          el("section", { class: "source-staging-column" }, [
            sourceStagingControl("Attempt data JSON file/s (one file per line, full path/URL including filename)", "attempts"),
            sourceStagingControl("Numbas diagnostic .exam file (full path/URL including filename)", "exam"),
            sourceStagingControl("Optional GEXF knowledge map (full path/URL including filename)", "gexf"),
            el("label", { class: "check-row previewuser-check-row" }, [
              checkbox(state.config.excludePreviewUsers, (checked) => {
                updateConfig("excludePreviewUsers", checked);
              }),
              "Exclude previewuser rows"
            ])
          ]),
          el("section", { class: "param-staging-column" }, [
            compactParamField("Score threshold", numberInput(state.config.questionThreshold, 0, 0.01, (value) => {
              updateConfig("questionThreshold", value);
            })),
            compactParamField("Minimum implied scores", numberInput(state.config.minimumNumberOfImpliedScores, 0, 1, (value) => {
              updateConfig("minimumNumberOfImpliedScores", value);
            }))
          ])
        ]),
        el("div", { class: "button-row setup-action-row" }, [
          actionButton("Import Sources", () => importSources().catch((error) => alert(`Could not import sources: ${error.message}`)), false, "primary-action"),
          ...setupBuildButtons()
        ]),
        importStatusNotice(),
        dashboardBuildPanel()
      ]
    )
  );
}

function importStatusNotice() {
  if (state.dashboardDirty && state.importStatus.imported) {
    return el("div", { class: "status-stack" }, [
      state.importStatus.message ? el("p", { class: "status-line ok" }, state.importStatus.message) : "",
      el("p", { class: "status-line warn" }, "Dashboard outputs are dirty. Choose an enabled build button to refresh the relevant datasets, visualisations, Rasch outputs, and tracker state.")
    ]);
  }
  if (!state.importStatus.message) return "";
  return el("p", {
    class: state.importStatus.imported ? "status-line ok" : "status-line warn"
  }, state.importStatus.message);
}

function setupBuildButtons() {
  const canBuild = buildCapabilities();
  return [
    setupBuildButton("Build Knowledge Map", () => buildKnowledgeMapSubset({ validate: false }), {
      disabled: !canBuild.knowledgeMap,
      title: canBuild.knowledgeMap ? "Build the Numbas-derived knowledge map and KM dictionary." : canBuild.reason.knowledgeMap,
      className: "secondary-action"
    }),
    setupBuildButton("Build and Validate Knowledge Map", () => buildKnowledgeMapSubset({ validate: true }), {
      disabled: !canBuild.validateKnowledgeMap,
      title: canBuild.validateKnowledgeMap ? "Build the Numbas-derived knowledge map, then compare it with the staged GEXF map." : canBuild.reason.validateKnowledgeMap,
      className: "secondary-action"
    }),
    setupBuildButton("Build non-Rasch Dashboard", () => buildDashboard({ includeRasch: false }), {
      disabled: !canBuild.nonRaschDashboard,
      title: canBuild.nonRaschDashboard ? "Build all non-Rasch tabs from the imported sources." : canBuild.reason.nonRaschDashboard,
      className: "primary-action"
    }),
    setupBuildButton("Build Dashboard", () => buildDashboard({ includeRasch: true }), {
      disabled: !canBuild.fullDashboard,
      title: canBuild.fullDashboard ? "Build all tabs, including Rasch Analysis." : canBuild.reason.fullDashboard,
      className: "primary-action"
    })
  ];
}

function setupBuildButton(label, onClick, options = {}) {
  const button = actionButton(label, onClick, Boolean(options.disabled), options.className || "");
  button.title = options.title || "";
  return button;
}

function buildCapabilities() {
  const imported = state.importStatus.imported;
  const running = Boolean(state.dashboardBuild?.running);
  const hasExam = hasImportedExam();
  const hasGexf = hasImportedGexf();
  const hasAttempts = hasImportedAttempts();
  const busyReason = "A build is already running.";
  const reason = {
    knowledgeMap: running ? busyReason : (!imported ? "Import Sources first." : (!hasExam ? "Import a Numbas diagnostic .exam file first." : "")),
    validateKnowledgeMap: running ? busyReason : (!imported ? "Import Sources first." : (!hasExam ? "Import a Numbas diagnostic .exam file first." : (!hasGexf ? "Import a GEXF knowledge map first." : ""))),
    nonRaschDashboard: running ? busyReason : (!imported ? "Import Sources first." : (!hasExam ? "Import a Numbas diagnostic .exam file first." : (!hasAttempts ? "Import attempt data JSON file/s first." : ""))),
    fullDashboard: running ? busyReason : (!imported ? "Import Sources first." : (!hasExam ? "Import a Numbas diagnostic .exam file first." : (!hasAttempts ? "Import attempt data JSON file/s first." : "")))
  };
  return {
    knowledgeMap: imported && hasExam && !running,
    validateKnowledgeMap: imported && hasExam && hasGexf && !running,
    nonRaschDashboard: imported && hasExam && hasAttempts && !running,
    fullDashboard: imported && hasExam && hasAttempts && !running,
    reason
  };
}

function hasImportedExam() {
  return Boolean(state.exam?.data);
}

function hasImportedGexf() {
  return Boolean(state.gexf);
}

function hasImportedAttempts() {
  return state.attemptSources.some((source) => source.raw && Array.isArray(source.raw.attempts));
}

function dashboardBuildPanel() {
  const build = state.dashboardBuild || {};
  if (!build.running && !build.message && !(build.tasks || []).length) return "";
  return el("article", { class: build.running ? "card dashboard-build-panel is-running" : "card dashboard-build-panel" }, [
    el("h3", {}, "Dashboard build"),
    build.message ? el("p", { class: build.status === "issue" ? "status-line issue" : "status-line" }, build.message) : "",
    el("div", { class: "dashboard-task-list" }, (build.tasks || []).map(dashboardTaskRow))
  ]);
}

function dashboardTaskRow(task) {
  const percent = Math.max(0, Math.min(100, Math.round(Number(task.percent || 0))));
  return el("div", { class: `dashboard-task ${task.status || "pending"}` }, [
    el("div", { class: "dashboard-task-head" }, [
      el("strong", {}, task.label),
      el("span", {}, `${percent}%`)
    ]),
    el("progress", { max: "100", value: String(percent), "aria-label": `${task.label} progress` }),
    el("div", { class: "dashboard-task-detail" }, [
      el("span", {}, task.detail || taskStatusLabel(task.status))
    ])
  ]);
}

function taskStatusLabel(status) {
  if (status === "complete") return "Complete";
  if (status === "running") return "Running";
  if (status === "issue") return "Needs attention";
  return "Pending";
}

function createDashboardTasks() {
  return createDashboardTasksFor(["km", "datasets", "implied", "curriculum", "finalise", "validation", "rasch"]);
}

function createDashboardTasksFor(keys) {
  const definitions = {
    km: { key: "km", label: "Knowledge Map", status: "pending", percent: 0, detail: "Waiting to parse the exam and build the KM dictionary." },
    datasets: { key: "datasets", label: "Datasets", status: "pending", percent: 0, detail: "Waiting to read attempt data and build the Attempt Dataset." },
    implied: { key: "implied", label: "Implied Scoring", status: "pending", percent: 0, detail: "Waiting to apply implied scoring." },
    curriculum: { key: "curriculum", label: "Curriculum Groups", status: "pending", percent: 0, detail: "Waiting to build curriculum-group summaries." },
    finalise: { key: "finalise", label: "Prepare Browser Output", status: "pending", percent: 0, detail: "Waiting to prepare compact browser output." },
    validation: { key: "validation", label: "KM Validation and Tracker", status: "pending", percent: 0, detail: "Waiting for graph and student sequence outputs." },
    rasch: { key: "rasch", label: "Rasch Analysis", status: "pending", percent: 0, detail: "Waiting for raw and implied matrices." }
  };
  return keys.map((key) => ({ ...definitions[key] })).filter(Boolean);
}

async function buildKnowledgeMapSubset(options = {}) {
  const validate = Boolean(options.validate);
  if (state.dashboardBuild.running) return;
  if (!state.importStatus.imported) throw new Error("Import the staged sources before building.");
  if (!hasImportedExam()) throw new Error("Import a Numbas diagnostic .exam file before building the knowledge map.");
  if (validate && !hasImportedGexf()) throw new Error("Import a GEXF knowledge map before building and validating.");

  clearDashboardOutputs();
  state.dashboardDirty = false;
  state.dashboardBuild = {
    running: true,
    status: "running",
    startedAt: Date.now(),
    tasks: createDashboardTasksFor(validate ? ["km", "validation"] : ["km"]),
    message: validate ? "Building and validating the knowledge map." : "Building the knowledge map."
  };
  renderSetup();

  try {
    markDashboardTask("km", { status: "running", percent: 10, detail: "Parsing Numbas exam knowledge graph." });
    renderSetup();
    const result = await runRSourceAnalysis("km");
    applyAnalysisResult(result);
    normaliseAttemptSources();
    completeDashboardTask("km", "Knowledge map and dictionary built.");

    if (validate) {
      markDashboardTask("validation", { status: "running", percent: 50, detail: "Comparing the Numbas-derived graph with the staged GEXF map." });
      state.validation = compareKnowledgeMaps(state.km, state.gexf);
      completeDashboardTask("validation", "GEXF validation complete.");
    } else {
      state.validation = null;
    }

    state.dashboardBuild.running = false;
    state.dashboardBuild.status = "complete";
    state.dashboardBuild.message = validate ? "Knowledge map and validation build complete." : "Knowledge map build complete.";
    state.dashboardDirty = false;
    renderAll();
  } catch (error) {
    updateDashboardBuildFailure(error);
    throw error;
  }
}

async function buildDashboard(options = {}) {
  const includeRasch = options.includeRasch !== false;
  if (state.dashboardBuild.running) return;
  if (!state.importStatus.imported) {
    state.importStatus.message = "Import the staged sources before building.";
    renderSetup();
    return;
  }
  if (!hasImportedExam()) throw new Error("Import a Numbas diagnostic .exam file before building the dashboard.");
  if (!hasImportedAttempts()) throw new Error("Import attempt data JSON file/s before building the dashboard.");

  clearDashboardOutputs();
  state.dashboardDirty = false;
  state.dashboardBuild = {
    running: true,
    status: "running",
    startedAt: Date.now(),
    tasks: createDashboardTasksFor(includeRasch
      ? ["km", "datasets", "implied", "curriculum", "finalise", "validation", "rasch"]
      : ["km", "datasets", "implied", "curriculum", "finalise", "validation"]),
    message: includeRasch
      ? "Building all dashboard sections from the imported sources."
      : "Building all non-Rasch dashboard sections from the imported sources."
  };
  renderSetup();

  try {
    const result = await runRSourceAnalysis("pipeline", {
      onProgress: updateDashboardPipelineProgress
    });
    applyAnalysisResult(result);
    normaliseAttemptSources();
    state.validation = state.km && state.gexf ? compareKnowledgeMaps(state.km, state.gexf) : null;
    completeDashboardTask("km", "Knowledge map and dictionary built.");
    completeDashboardTask("datasets", `${state.datasets?.rows?.length || 0} Attempt Dataset rows available.`);
    completeDashboardTask("implied", `${state.implied?.rows?.length || 0} rows scored.`);
    completeDashboardTask("curriculum", `${state.curriculum?.groups?.length || 0} curriculum groups summarised.`);
    completeDashboardTask("finalise", "Compact dashboard payload received by the browser.");
    completeDashboardTask("validation", state.validation ? "GEXF validation complete; tracker data is available from implied scoring." : "Tracker data is available; no GEXF validation source was staged.");
    renderSetup();

    if (includeRasch) {
      if (state.implied) {
        await runDashboardRaschTask();
      } else {
        markDashboardTask("rasch", {
          status: "issue",
          percent: 0,
          detail: "Skipped because implied matrices were not generated."
        });
      }
    } else {
      state.rasch = null;
    }

    state.dashboardBuild.running = false;
    state.dashboardBuild.status = "complete";
    state.dashboardBuild.message = includeRasch
      ? "Dashboard build complete. The tab outputs are ready to inspect."
      : "Non-Rasch dashboard build complete. The Rasch Analysis tab was not run.";
    state.dashboardDirty = false;
    renderAll();
  } catch (error) {
    updateDashboardBuildFailure(error);
    throw error;
  }
}

function updateDashboardPipelineProgress(info) {
  const percent = Number(info.percent || 0);
  const ranges = [
    { key: "km", start: 14, end: 34 },
    { key: "datasets", start: 34, end: 62 },
    { key: "implied", start: 62, end: 78 },
    { key: "curriculum", start: 78, end: 88 },
    { key: "finalise", start: 88, end: 100 }
  ];
  ranges.forEach((range) => {
    const taskPercent = taskPercentFromGlobal(percent, range.start, range.end);
    const status = percent >= range.end ? "complete" : (percent >= range.start ? "running" : "pending");
    const current = (state.dashboardBuild.tasks || []).find((task) => task.key === range.key) || {};
    const patch = { status, percent: taskPercent };
    if (status === "running") {
      patch.detail = [info.phase, info.message].filter(Boolean).join(": ") || current.detail;
    } else if (status === "complete" && current.status !== "complete") {
      patch.detail = "Complete.";
    } else if (status === "pending") {
      patch.detail = current.detail;
    }
    markDashboardTask(range.key, patch);
  });
  state.dashboardBuild.message = [info.phase, info.message].filter(Boolean).join(": ") || "Building dashboard.";
  renderSetup();
}

function taskPercentFromGlobal(percent, start, end) {
  if (percent <= start) return 0;
  if (percent >= end) return 100;
  return Math.round(((percent - start) / (end - start)) * 100);
}

function completeDashboardTask(key, detail) {
  markDashboardTask(key, {
    status: "complete",
    percent: 100,
    detail
  });
}

function markDashboardTask(key, patch) {
  const build = state.dashboardBuild || {};
  const task = (build.tasks || []).find((item) => item.key === key);
  if (!task) return;
  Object.assign(task, patch);
}

function updateDashboardBuildFailure(error) {
  const message = error?.message || String(error || "Dashboard build failed.");
  const running = (state.dashboardBuild.tasks || []).find((task) => task.status === "running");
  if (running) {
    running.status = "issue";
    running.detail = message;
  }
  state.dashboardBuild.running = false;
  state.dashboardBuild.status = "issue";
  state.dashboardBuild.message = message;
  renderSetup();
}

async function runDashboardRaschTask() {
  markDashboardTask("rasch", {
    status: "running",
    percent: 0,
    detail: "Starting browser 1PL MML Rasch analysis for raw and implied matrices."
  });
  renderSetup();
  const payload = await requestRaschAnalysis({
    onProgress: (info) => {
      markDashboardTask("rasch", {
        status: "running",
        percent: info.percent ?? 0,
        detail: info.detail || info.message || "Running browser Rasch analysis."
      });
      renderSetup();
    }
  });
  state.rasch = payload;
  completeDashboardTask("rasch", `Browser Rasch run ${payload.runId} complete.`);
  renderSetup();
}

function renderKnowledgeMap() {
  const host = document.getElementById("knowledgeMapTab");
  if (!state.exam) {
    host.replaceChildren(emptyPanel("Knowledge Map", "Stage and import a Numbas .exam file in Setup and Data Staging first."));
    return;
  }
  if (!state.km) {
    host.replaceChildren(
      panel("Knowledge Map", "Create the knowledge map and KM dictionary from the loaded Numbas .exam file.", [
        el("article", { class: "card notice" }, [
          el("h3", {}, "Ready to build"),
          el("p", { class: "muted" }, `Loaded exam: ${state.exam.name}. This step parses diagnostic.knowledge_graph.topics, creates immediate prerequisite -> dependent edges, and builds kmDictionary.`)
        ]),
        el("div", { class: "button-row setup-action-row" }, [
          actionButton("Build Knowledge Map", () => buildKnowledgeMapSubset({ validate: false }), state.dashboardBuild.running, "primary-action")
        ])
      ])
    );
    return;
  }

  host.replaceChildren(
    el("section", { class: "grid-panel" }, [
      el("aside", { class: "side-panel" }, [
        heading("Knowledge Map", "Built from the Numbas diagnostic exam file."),
        el("div", { class: "metric-grid" }, [
          metric(state.km.nodes.length, "Questions"),
          metric(state.km.edges.length, "Edges"),
          metric(state.km.groups.length, "Groups"),
          metric(state.km.validation.mismatches.length, "Mismatches")
        ]),
        el("div", { class: "button-row" }, [
          actionButton("Validation Checks", showValidationChecks, false, "secondary-action"),
          actionButton("Show Dictionary", showDictionary, false, "violet-action"),
          actionButton("Export Dictionary CSV", () => downloadRows("kmDictionary_using_numbas_exam_json_data.csv", state.km.dictionary)),
          actionButton("Export Dictionary JSON", () => downloadFile("kmDictionary_using_numbas_exam_json_data.json", "application/json", JSON.stringify(state.km.dictionary, null, 2))),
          actionButton("Full Screen KM", () => openGraphModal("Knowledge Map", state.km))
        ])
      ]),
      el("section", { class: "work-panel" }, [
        heading("Knowledge Map Visualisation", "Immediate edges are drawn from prerequisite topic to dependent topic."),
        graphBlock(state.km, { small: false })
      ])
    ])
  );
}

function renderDatasets() {
  const host = document.getElementById("datasetsTab");
  if (!state.km) {
    host.replaceChildren(emptyPanel("Datasets", "Build the knowledge map first. The dataset builder needs the KM question count and topic mapping."));
    return;
  }
  if (!hasImportedAttempts()) {
    host.replaceChildren(emptyPanel("Datasets", "Stage and import attempt data JSON files in Setup and Data Staging first."));
    return;
  }
  if (!state.datasets) {
    host.replaceChildren(
      panel("Datasets", "Builds the Attempt Dataset from the imported attempt data and knowledge map.", [
        el("article", { class: "card notice" }, [
          el("h3", {}, "What this step does"),
          el("p", { class: "muted" }, "Creates the attempt-level dataset, records FIRST_QUESTION_NUMBER from each attempt sequence, populates direct score and response-sequence columns from the imported attempts, thresholds raw scores, then creates attemptedQuestionCountsDFOrdered and selected-question average scores.")
        ]),
        el("div", { class: "form-grid two" }, [
          field("setNumOfAttempts", numberInput(state.config.setNumOfAttempts, 0, 1, (value) => {
            updateConfig("setNumOfAttempts", value);
          })),
          el("div", { class: "field-row" }, [
            el("span", {}, "Dataset basis"),
            el("div", { class: "card" }, `${countAttemptInputsForR()} attempt data source(s), ${state.km.nodes.length} KM questions`)
          ])
        ]),
        el("div", { class: "button-row setup-action-row" }, [
          actionButton("Build Attempt Dataset", () => withLoading("Building Attempt Dataset", async () => {
            await buildDatasets();
            renderAll();
          }, "Populating the Attempt Dataset, attempted counts, and average scores."))
        ])
      ])
    );
    return;
  }

  host.replaceChildren(
    panel("Datasets", "Main attempt-level dataset recreated from the source script with attemptedQuestionCountsDFOrdered.", [
      el("div", { class: "button-row" }, [
        actionButton("Rebuild Attempt Dataset", () => withLoading("Rebuilding Attempt Dataset", async () => {
          await buildDatasets();
          state.implied = null;
          state.curriculum = null;
          renderAll();
        }, "Recomputing the Attempt Dataset and attempted-question counts."))
      ]),
      el("div", { class: "metric-grid" }, [
        metric(state.datasets.allRows, "Imported rows"),
        metric(state.datasets.rows.length, "Attempt Dataset rows"),
        metric(state.datasets.removedEmptyFirstQuestion, "Removed missing first move"),
        metric(state.datasets.previewRows, "Previewuser rows")
      ]),
      heading("Attempt Counts", `Questions with AttemptCounts > ${state.config.setNumOfAttempts} are selected.`),
      createTable(state.datasets.attemptedQuestionCountsSelected, ["QuestionNumber", "TopicName", "AttemptCounts", "AverageScore"]),
      heading("Attempt Dataset Records", "A compact preview is shown here. The full direct score, sequence, and implied score table is available after implied scoring."),
      createTable(datasetPreviewRows().slice(0, 50), ["rowKey", "username", "start_time", "end_time", "direct_topics", "first_question_number"])
    ])
  );
}

function renderImpliedScoring() {
  const host = document.getElementById("impliedScoringTab");
  if (!state.datasets) {
    host.replaceChildren(emptyPanel("Implied Scoring", "Build the Attempt Dataset first. This step uses the Attempt Dataset from the Datasets tab as its input."));
    return;
  }
  if (!state.implied) {
    host.replaceChildren(
      panel("Implied Scoring", "Apply the AI version of the implied scoring computation from the source script.", [
        el("article", { class: "card notice" }, [
          el("h3", {}, "Dataset basis"),
          el("p", { class: "muted" }, `This will use the Attempt Dataset from Datasets: ${state.datasets.rows.length} rows, ${state.km.nodes.length} questions. Rows are filtered using minimumNumberOfImpliedScores = ${state.config.minimumNumberOfImpliedScores}.`)
        ]),
        el("div", { class: "button-row" }, [
          actionButton("Run Implied Scoring", () => withLoading("Running implied scoring", async () => {
            await runImpliedScoring();
            renderAll();
          }, "Applying direct scores, graph reachability, Rasch handoff filtering, and raw/implied matrix cleanup."))
        ])
      ])
    );
    return;
  }

  host.replaceChildren(
    panel("Implied Scoring", "Generated raw-scored and implied-scored response matrices up to the Rasch-analysis handoff.", [
      el("article", { class: "card notice" }, [
        el("h3", {}, "Dataset basis"),
        el("p", { class: "muted" }, `Used the Attempt Dataset from Datasets: ${state.datasets.rows.length} rows. The Rasch handoff keeps rows with numImpliedScoreQuestions >= ${state.config.minimumNumberOfImpliedScores}.`)
      ]),
      el("div", { class: "button-row" }, [
        actionButton("Rerun Implied Scoring", () => withLoading("Running implied scoring", async () => {
          await runImpliedScoring();
          renderAll();
        }, "Recomputing implied scores and response matrices.")),
        actionButton("Preview Full Attempt Dataset", showDatasetFullPreview, false, "secondary-action")
      ]),
      el("div", { class: "metric-grid" }, [
        metric(state.implied.allRows?.length ?? state.implied.rows.length, "Rows scored before filter"),
        metric(state.implied.rows.length, "Rows kept after filter"),
        metric(state.implied.impliedMatrix.columns.length, "Implied matrix columns"),
        metric(state.implied.rawMatrix.columns.length, "Raw matrix columns")
      ]),
      el("label", { class: "toggle-line implied-matrix-toggle" }, [
        checkbox(state.showImpliedMatrices, (checked) => {
          state.showImpliedMatrices = checked;
          renderImpliedScoring();
        }),
        el("span", {}, "Show implied and raw matrix summaries")
      ]),
      state.showImpliedMatrices ? el("div", { class: "card-grid" }, [
        el("article", { class: "card notice" }, [
          el("h3", {}, "Raw matrix"),
          el("p", { class: "muted" }, `${state.implied.rawRemovedColumns.length} all-zero/all-NA columns removed.`),
          createTable(matrixColumnSummaryRows("raw"), ["Topic", "kept", "nonMissing", "sum"])
        ]),
        el("article", { class: "card notice" }, [
          el("h3", {}, "Implied matrix"),
          el("p", { class: "muted" }, `${state.implied.impliedRemovedColumns.length} all-zero/all-NA columns removed.`),
          createTable(matrixColumnSummaryRows("implied"), ["Topic", "kept", "nonMissing", "sum"])
        ])
      ]) : "",
      heading("Student Counts", "Direct and implied scored question counts by student."),
      createTable(impliedPreviewRows(), ["rowKey", "username", "numDirectScoreQuestions", "numImpliedScoreQuestions", "totalImpliedCorrect"])
    ])
  );
}

function renderRasch() {
  const host = document.getElementById("raschTab");
  if (!state.implied) {
    host.replaceChildren(emptyPanel("Rasch Analysis", "Run implied scoring first so the raw and implied response matrices are available."));
    return;
  }

  const resultNodes = [];
  if (state.rasch) {
    if (state.rasch.running) {
      resultNodes.push(el("article", { class: "card notice" }, [
        el("h3", {}, "Rasch analysis running"),
        el("p", { class: "muted" }, "The JavaScript Rasch engine is fitting raw and implied models.")
      ]));
    } else if (state.rasch.ok) {
      resultNodes.push(el("article", { class: "card notice" }, [
        el("h3", {}, `Rasch run ${state.rasch.runId}`),
        el("p", { class: "muted" }, "Rasch output files were generated in the browser."),
        createTable(raschSummaryRows(), ["matrix", "rows", "columns", "removed_zero_or_na_columns", "deviance"]),
        raschOutputBrowser(state.rasch.files)
      ]));
    } else if (state.rasch.pending) {
      resultNodes.push(el("article", { class: "card notice issue" }, [
        el("h3", {}, "Rasch output unavailable"),
        el("p", { class: "muted" }, state.rasch.error || "The raw and implied matrices are available, but Rasch output has not been generated for this workspace.")
      ]));
    } else {
      resultNodes.push(el("article", { class: "card notice issue" }, [
        el("h3", {}, "Rasch run failed"),
        el("p", { class: "muted" }, state.rasch.error || state.rasch.output || "No error output was returned."),
        state.rasch.output ? el("textarea", { rows: 10, readonly: true }, state.rasch.output) : ""
      ]));
    }
  }

  host.replaceChildren(
    panel("Rasch Analysis", "Run browser-native 1PL MML Rasch analysis for raw-scored and implied-scored matrices, then inspect item and person outputs.", [
      el("div", { class: "metric-grid" }, [
        metric(matrixRowCount(state.implied.rawMatrix), "Raw rows"),
        metric(state.implied.rawMatrix.columns.length, "Raw items"),
        metric(matrixRowCount(state.implied.impliedMatrix), "Implied rows"),
        metric(state.implied.impliedMatrix.columns.length, "Implied items")
      ]),
      el("div", { class: "button-row" }, [
        (() => {
          const button = actionButton("Run Rasch Analysis", runRaschAnalysis, state.rasch?.running);
          button.title = "Runs the browser-based 1PL MML Rasch analysis. This targets the TAM::tam.mml dichotomous use case used by the original app.";
          return button;
        })(),
        (() => {
          const button = actionButton("Compare Item Difficulties", compareRaschItemDifficulties, !raschHasItemOutputs());
          button.title = "Compare raw and implied item difficulties from the latest Rasch output.";
          return button;
        })(),
        matrixHasRows(state.implied.rawMatrix) ? actionButton("Download Raw Matrix", () => downloadMatrix("dfRawScores.csv", state.implied.rawMatrix)) : "",
        matrixHasRows(state.implied.impliedMatrix) ? actionButton("Download Implied Matrix", () => downloadMatrix("dfFullyImpliedScoredImpliedScores.csv", state.implied.impliedMatrix)) : ""
      ]),
      el("article", { class: "card notice rasch-calibration-note" }, [
        el("h3", {}, "Model calibration"),
        el("p", { class: "muted" }, "Raw and implied models are fitted separately using the browser-native dichotomous 1PL marginal maximum likelihood routine ported for the app's TAM::tam.mml(resp = response) use case. The routine uses fixed quadrature nodes from -6 to 6; WLE outputs and no-simulation item fit use separate browser ports of TAM::tam.wle and TAM::msq.itemfit.")
      ]),
      state.rasch?.running ? el("p", { class: "status-line warn" }, "Running browser Rasch analysis...") : "",
      ...resultNodes
    ])
  );
}

function renderCurriculum() {
  const host = document.getElementById("curriculumTab");
  if (!state.curriculum) {
    if (!state.implied) {
      host.replaceChildren(emptyPanel("Curriculum Groups", "Run implied scoring first to add curriculum-group aggregates to the Attempt Dataset."));
      return;
    }
    host.replaceChildren(
      panel("Curriculum Groups", "Add curriculum-group aggregates using the browser JavaScript analysis engine.", [
        el("article", { class: "card notice" }, [
          el("h3", {}, "Ready to build"),
          el("p", { class: "muted" }, "This step returns curriculum-group columns added to the Attempt Dataset.")
        ]),
        el("div", { class: "button-row" }, [
          actionButton("Build Curriculum Groups", () => withLoading("Building curriculum groups", async () => {
            await buildCurriculumGroups();
          }, "Running curriculum-group aggregation in JavaScript."))
        ])
      ])
    );
    return;
  }

  host.replaceChildren(
    panel("Curriculum Groups", "Curriculum group percentages and aggregate means added from the implied-scored dataframe.", [
      el("div", { class: "metric-grid" }, [
        metric(state.curriculum.groups.length, "Groups"),
        metric(state.curriculum.studentRows.length, "Students"),
        metric(formatNumber(state.curriculum.overallMean, 3), "Overall mean"),
        metric(formatNumber(state.curriculum.totalCorrectMean, 1), "Mean total correct")
      ]),
      heading("Overall Group Means", "Means are calculated across students with non-missing group percentages."),
      createTable(state.curriculum.groupRows, ["group", "question_count", "students_with_data", "mean_percent_correct", "mean_correct_count"]),
      heading("Student Curriculum Percentages", "Each row extends the Attempt Dataset with per-group percentage columns."),
      (() => {
        const table = createTable(state.curriculum.studentRows, (state.curriculum.studentColumns || []).filter((column) => column !== "data_source"));
        table.classList.add("curriculum-student-table");
        return table;
      })()
    ])
  );
}

function renderValidation() {
  const host = document.getElementById("validationTab");
  if (!state.km) {
    host.replaceChildren(emptyPanel("KM Validation", "Build the Numbas knowledge map first."));
    return;
  }
  if (!state.gexf) {
    host.replaceChildren(
      panel("KM Validation", "No GEXF file has been loaded, so the comparison is skipped.", [
        el("article", { class: "card notice warn" }, [
          el("h3", {}, "GEXF comparison unavailable"),
          el("p", { class: "muted" }, "The Numbas-derived knowledge map is still available in the Knowledge Map tab.")
        ])
      ])
    );
    return;
  }
  if (!state.validation) {
    host.replaceChildren(
      panel("KM Validation", "Compare the staged GEXF knowledge map against the map built from the Numbas exam.", [
        el("article", { class: "card notice" }, [
          el("h3", {}, "Ready to validate"),
          el("p", { class: "muted" }, "A Numbas-derived knowledge map and GEXF map are loaded. Run the validation build to populate this tab.")
        ]),
        el("div", { class: "button-row" }, [
          actionButton("Build and Validate Knowledge Map", () => buildKnowledgeMapSubset({ validate: true }), state.dashboardBuild.running, "primary-action")
        ])
      ])
    );
    return;
  }

  host.replaceChildren(
    panel("KM Validation", "Comparison of the GEXF knowledge map against the map built from the Numbas exam.", [
      el("div", { class: "metric-grid" }, [
        metric(state.validation.matchingNodes, "Matching nodes"),
        metric(state.validation.nodesMissingInGexf.length, "Nodes missing in GEXF"),
        metric(state.validation.nodesExtraInGexf.length, "Nodes extra in GEXF"),
        metric(state.validation.edgeDiscrepancies, "Edge discrepancies")
      ]),
      el("article", { class: state.validation.edgeDiscrepancies ? "card notice warn" : "card notice" }, [
        el("h3", {}, "Edge orientation used"),
        el("p", { class: "muted" }, state.validation.orientation || "Compared using the staged graph edge directions.")
      ]),
      el("div", { class: "card-grid" }, [
        validationCard("Nodes missing in GEXF", state.validation.nodesMissingInGexf),
        validationCard("Nodes extra in GEXF", state.validation.nodesExtraInGexf),
        validationCard("Edges missing in GEXF", state.validation.edgesMissingInGexf),
        validationCard("Edges extra in GEXF", state.validation.edgesExtraInGexf)
      ]),
      heading("Topic Neighbour Comparison", "Immediate in-node and out-node sets compared in kmDictionary_fixed orientation."),
      createTable(state.validation.topicNeighbourRows || [], [
        "topic",
        "all_neighbour_sets_match",
        "km_in_nodes",
        "gexf_in_nodes",
        "in_nodes_missing_from_gexf",
        "in_nodes_extra_in_gexf",
        "km_out_nodes",
        "gexf_out_nodes",
        "out_nodes_missing_from_gexf",
        "out_nodes_extra_in_gexf"
      ])
    ])
  );
}

function renderTracker() {
  const host = document.getElementById("trackerTab");
  if (!state.implied) {
    host.replaceChildren(emptyPanel("Attempt Tracker", "Run implied scoring first to step through student attempts on the knowledge map."));
    return;
  }

  const rows = state.implied.rows.filter((row) => row.numDirectScoreQuestions > 0);
  if (!rows.length) {
    host.replaceChildren(emptyPanel("Attempt Tracker", "No rows with direct attempts are available."));
    return;
  }
  const candidateRows = trackerFilteredRows(rows);
  if (!state.tracker.rowKey || !candidateRows.some((row) => row.rowKey === state.tracker.rowKey)) {
    state.tracker.rowKey = candidateRows[0]?.rowKey || "";
    state.tracker.step = 0;
    state.tracker.finalState = false;
  }
  if (!candidateRows.length) {
    host.replaceChildren(
      panel("Attempt Tracker", "Step through the direct response sequence and watch the implied scoring state on the KM.", [
        el("div", { class: "tracker-layout" }, [
          el("aside", { class: "tracker-side" }, [
            trackerSelectionControls(rows, candidateRows),
            el("p", { class: "status-line warn" }, "No students match the current criteria.")
          ]),
          el("div", { class: "empty-state" }, "Adjust the student criteria to select an attempt sequence.")
        ])
      ])
    );
    return;
  }
  const row = candidateRows.find((item) => item.rowKey === state.tracker.rowKey) || candidateRows[0];
  const attempts = attemptsForRow(row);
  if (state.tracker.step > attempts.length) state.tracker.step = 0;
  const statusFilters = selectedTrackerStatusFilters();
  const simulation = statusFilters.size
    ? simulateTrackerStatusFilter(row, statusFilters)
    : state.tracker.finalState
    ? simulateTrackerFinalState(row)
    : simulateTracker(row, state.tracker.step);
  const stepGrid = el("div", { class: "step-grid" }, attempts.map((attempt) => {
    const active = !state.tracker.finalState && Number(attempt.step) === Number(state.tracker.step);
    const button = el("button", { class: active ? "step-button is-active" : "step-button", type: "button" }, [
      el("span", {}, `S${attempt.step}: Q${attempt.questionNumber}`),
      el("span", {}, `${attempt.score === 1 ? "correct" : "incorrect"}`)
    ]);
    button.addEventListener("click", () => {
      state.tracker.stepGridScrollTop = stepGrid.scrollTop;
      state.tracker.windowScrollY = window.scrollY;
      state.tracker.step = active ? 0 : attempt.step;
      state.tracker.finalState = false;
      clearTrackerStatusFilters();
      renderTracker();
    });
    const info = el("button", { class: "step-info-button", type: "button", title: "Step details" }, "i");
    info.addEventListener("click", () => showTrackerStepInfo(attempt));
    return el("div", { class: "step-pair" }, [button, info]);
  }));
  stepGrid.scrollTop = Number(state.tracker.stepGridScrollTop || 0);
  stepGrid.addEventListener("scroll", () => {
    state.tracker.stepGridScrollTop = stepGrid.scrollTop;
  });

  host.replaceChildren(
    panel("Attempt Tracker", "Step through the direct response sequence and watch the implied scoring state on the KM.", [
      el("div", { class: "tracker-layout" }, [
        el("aside", { class: "tracker-side" }, [
          trackerSelectionControls(rows, candidateRows),
          trackerStatusKey(simulation),
          el("div", { class: "tracker-state-actions" }, [
            actionButton(state.tracker.finalState ? "Hide final state" : "Final state", () => {
              state.tracker.finalState = !state.tracker.finalState;
              state.tracker.step = 0;
              clearTrackerStatusFilters();
              refreshGraphViews();
            }, false, "secondary-action tracker-final-state-button"),
            actionButton("Reset view", () => {
              resetTrackerSequence();
              state.kmSelectedNodeId = "";
              state.kmSearchQuery = "";
              state.kmVisibleGroups = [];
              state.kmLayoutMode = "default";
              refreshGraphViews();
            }, false, "secondary-action tracker-final-state-button")
          ]),
          trackerSelectedStepLine(row, attempts),
          stepGrid,
        ]),
        graphBlock(state.km, {
          small: false,
          statusById: simulation.statusById,
          edgeStatusByKey: simulation.edgeStatusByKey,
          activeId: simulation.activeId,
          showSearch: true,
          trackerStatusControls: true,
          trackerRow: row,
          focusStatusOnly: statusFilters.size > 0,
          redrawCurrentOnly: true
        })
      ])
    ])
  );
  requestAnimationFrame(() => {
    const restoredGrid = host.querySelector(".step-grid");
    if (restoredGrid) restoredGrid.scrollTop = Number(state.tracker.stepGridScrollTop || 0);
    const savedWindowScrollY = state.tracker.windowScrollY;
    if (typeof savedWindowScrollY === "number" && Number.isFinite(savedWindowScrollY)) {
      restoreWindowScroll(window.scrollX, savedWindowScrollY);
      state.tracker.windowScrollY = null;
    }
  });
}

function trackerSelectionControls(rows, candidateRows) {
  const selectedIndex = candidateRows.findIndex((row) => row.rowKey === state.tracker.rowKey);
  const selectedRow = selectedIndex >= 0 ? candidateRows[selectedIndex] : candidateRows[0];
  const hasStudentQuery = String(state.tracker.studentQuery || "").trim() !== "";
  const submitSelection = () => {
    const draftRows = trackerRowsForDraft(rows);
    if (!draftRows.length) {
      applyTrackerDraftFilters();
      state.tracker.rowKey = "";
      resetTrackerSequence();
      renderTracker();
      return;
    }
    if (draftRows.length === 1) {
      chooseTrackerRow(draftRows[0], { applyDraft: true });
      renderTracker();
      return;
    }
    showTrackerSelectionPreview(rows);
  };
  return el("div", { class: "tracker-selection" }, [
    field("Student ID", input("text", state.tracker.studentQuery || "", (value) => {
      state.tracker.studentQuery = value;
      const disabled = String(value || "").trim() !== "";
      document.querySelectorAll("#trackerTab .tracker-criterion-input").forEach((node) => {
        node.disabled = disabled;
      });
    }, { placeholder: "zID or row key" })),
    trackerNumberCriterion("Direct correct topics", "directCorrectFilter", hasStudentQuery),
    trackerNumberCriterion("Implied correct topics", "impliedCorrectFilter", hasStudentQuery),
    trackerNumberCriterion("Scored topics", "scoredFilter", hasStudentQuery),
    el("div", { class: "tracker-selection-actions" }, [
      actionButton("Submit selection", submitSelection, false, "tracker-submit-button"),
      actionButton("Preview selection", () => showTrackerSelectionPreview(rows), false, "secondary-action")
    ]),
    el("div", { class: "tracker-match-row" }, [
      el("span", { class: "muted" }, candidateRows.length
        ? `${selectedIndex + 1} of ${candidateRows.length}: ${trackerStudentLabel(selectedRow)}`
        : "0 matches")
    ])
  ]);
}

function trackerNumberCriterion(label, key, disabled = false) {
  return field(label, input("number", state.tracker[key] ?? "", (value) => {
    state.tracker[key] = value;
  }, {
    class: "tracker-criterion-input",
    min: "0",
    step: "1",
    placeholder: "Any",
    disabled
  }));
}

function trackerFilteredRows(rows) {
  return trackerRowsForFilters(rows, trackerAppliedFilters());
}

function trackerRowsForDraft(rows) {
  return trackerRowsForFilters(rows, trackerDraftFilters());
}

function trackerDraftFilters() {
  const studentQuery = String(state.tracker.studentQuery || "").trim();
  return {
    studentQuery,
    directCorrectFilter: studentQuery ? "" : state.tracker.directCorrectFilter,
    impliedCorrectFilter: studentQuery ? "" : state.tracker.impliedCorrectFilter,
    scoredFilter: studentQuery ? "" : state.tracker.scoredFilter
  };
}

function trackerAppliedFilters() {
  return {
    studentQuery: state.tracker.appliedStudentQuery || "",
    directCorrectFilter: state.tracker.appliedDirectCorrectFilter ?? "",
    impliedCorrectFilter: state.tracker.appliedImpliedCorrectFilter ?? "",
    scoredFilter: state.tracker.appliedScoredFilter ?? ""
  };
}

function applyTrackerDraftFilters() {
  const filters = trackerDraftFilters();
  state.tracker.appliedStudentQuery = filters.studentQuery;
  state.tracker.appliedDirectCorrectFilter = filters.directCorrectFilter;
  state.tracker.appliedImpliedCorrectFilter = filters.impliedCorrectFilter;
  state.tracker.appliedScoredFilter = filters.scoredFilter;
}

function trackerRowsForFilters(rows, filters) {
  const studentQuery = normaliseGraphSearch(filters.studentQuery || "");
  const directCorrect = optionalNumberCriterion(filters.directCorrectFilter);
  const impliedCorrect = optionalNumberCriterion(filters.impliedCorrectFilter);
  const scored = optionalNumberCriterion(filters.scoredFilter);
  return rows.filter((row) => {
    const metrics = trackerRowMetrics(row);
    const idText = normaliseGraphSearch(`${row.username || ""} ${row.rowKey || ""}`);
    return (!studentQuery || idText.includes(studentQuery))
      && (directCorrect === null || metrics.directCorrect === directCorrect)
      && (impliedCorrect === null || metrics.impliedCorrect === impliedCorrect)
      && (scored === null || metrics.scored === scored);
  });
}

function chooseTrackerRow(row, options = {}) {
  if (!row) return;
  if (options.applyDraft) applyTrackerDraftFilters();
  state.tracker.rowKey = row.rowKey;
  resetTrackerSequence();
}

function resetTrackerSequence() {
  state.tracker.step = 0;
  state.tracker.finalState = false;
  state.tracker.statusFilters = [];
  state.tracker.stepGridScrollTop = 0;
  state.tracker.windowScrollY = null;
}

function clearTrackerStatusFilters() {
  state.tracker.statusFilters = [];
}

function showTrackerSelectionPreview(rows) {
  const matches = trackerRowsForDraft(rows);
  const rowByKey = new Map(matches.map((row) => [row.rowKey, row]));
  const previewRows = matches.map((row) => {
    const metrics = trackerRowMetrics(row);
    return {
      ROW_KEY: row.rowKey,
      STUDENT_ID: row.username || "",
      DIRECT_CORRECT_TOPICS: metrics.directCorrect,
      DIRECT_INCORRECT_TOPICS: metrics.directIncorrect,
      IMPLIED_CORRECT_TOPICS: metrics.impliedCorrect,
      IMPLIED_INCORRECT_TOPICS: metrics.impliedIncorrect,
      SCORED_TOPICS: metrics.scored,
      DIRECT_ATTEMPTS: row.numDirectScoreQuestions ?? countNonNull(row.directScores || [])
    };
  });
  const selectedMatch = previewRows.find((row) => row.ROW_KEY === state.tracker.rowKey) || previewRows[0] || null;
  let selectedRowKey = selectedMatch?.ROW_KEY || "";
  const columns = [
    "SELECT",
    "ROW_KEY",
    "STUDENT_ID",
    "DIRECT_CORRECT_TOPICS",
    "DIRECT_INCORRECT_TOPICS",
    "IMPLIED_CORRECT_TOPICS",
    "IMPLIED_INCORRECT_TOPICS",
    "SCORED_TOPICS",
    "DIRECT_ATTEMPTS"
  ];

  const table = selectableTrackerTable(previewRows, columns, () => selectedRowKey, (rowKey) => {
    selectedRowKey = rowKey;
  });
  const submitButton = actionButton("Submit selection", () => {
    const selected = rowByKey.get(selectedRowKey);
    if (!selected) return;
    chooseTrackerRow(selected, { applyDraft: true });
    closeFloatingContent();
    requestAnimationFrame(renderTracker);
  }, !previewRows.length, "tracker-submit-button");
  showFloatingContent("Preview Selection", el("div", { class: "tracker-selection-preview" }, [
    el("div", { class: "tracker-selection-preview-bar" }, [
      el("p", { class: "muted" }, previewRows.length
        ? `${previewRows.length} matching attempt sequence${previewRows.length === 1 ? "" : "s"}. Select one row, then submit.`
        : "No attempt sequences match the current selection criteria."),
      submitButton
    ]),
    previewRows.length ? table : el("div", { class: "empty-state" }, "No rows to display.")
  ]), { fullscreen: true });
}

function selectableTrackerTable(rows, columns, getSelectedRowKey, setSelectedRowKey) {
  const wrapper = el("div", { class: "table-wrap selectable-table-wrap" });
  const table = el("table");
  const thead = el("thead");
  const tbody = el("tbody");
  let sortKey = "";
  let sortDirection = 1;
  const rowElements = new Map();
  const radioElements = new Map();
  let renderToken = null;
  let currentRows = rows.slice();
  const rowHeight = 38;
  const virtual = rows.length > 250;

  const updateSelectedRow = (rowKey) => {
    const previousRowKey = getSelectedRowKey();
    if (previousRowKey === rowKey) return;
    setSelectedRowKey(rowKey);
    [previousRowKey, rowKey].forEach((key) => {
      if (!key) return;
      rowElements.get(key)?.classList.toggle("is-selected", key === rowKey);
      const radio = radioElements.get(key);
      if (radio) radio.checked = key === rowKey;
    });
  };

  const sortedRows = () => {
    const sorted = rows.slice();
    if (sortKey) sorted.sort((a, b) => compareValues(a[sortKey], b[sortKey]) * sortDirection);
    return sorted;
  };

  const renderHeader = () => {
    thead.replaceChildren(el("tr", {}, columns.map((column) => {
      if (column === "SELECT") return el("th", { class: "col-select" }, "SELECT");
      const isSorted = sortKey === column;
      const th = el("th", {
        class: columnClassName(column),
        title: isSorted ? (sortDirection === 1 ? "Sorted ascending" : "Sorted descending") : "Sort",
        "aria-sort": isSorted ? (sortDirection === 1 ? "ascending" : "descending") : "none"
      }, [
        el("span", { class: "th-content" }, [
          el("span", {}, columnHeaderLabel(column)),
          el("span", { class: isSorted ? "sort-indicator is-active" : "sort-indicator", "aria-hidden": "true" }, isSorted ? (sortDirection === 1 ? "▲" : "▼") : "↕")
        ])
      ]);
      th.addEventListener("click", () => {
        if (sortKey === column) sortDirection *= -1;
        else {
          sortKey = column;
          sortDirection = 1;
        }
        renderHeader();
        renderBody();
      });
      return th;
    })));
  };

  const renderBody = () => {
    currentRows = sortedRows();
    if (!virtual) {
      renderVisibleRows(currentRows, 0, currentRows.length, 0, 0);
      return;
    }
    wrapper.scrollTop = 0;
    renderVirtualBody();
  };

  const renderVisibleRows = (sourceRows, start, end, topHeight, bottomHeight) => {
    rowElements.clear();
    radioElements.clear();
    const bodyRows = [];
    if (topHeight > 0) {
      bodyRows.push(el("tr", { class: "virtual-spacer-row" }, [
        el("td", { colspan: String(columns.length), style: `height:${topHeight}px;padding:0;border:0;` })
      ]));
    }
    sourceRows.slice(start, end).forEach((row) => {
      const radio = el("input", { type: "radio", name: "tracker-selection-row", value: row.ROW_KEY });
      radio.checked = getSelectedRowKey() === row.ROW_KEY;
      radio.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      radio.addEventListener("change", () => {
        updateSelectedRow(row.ROW_KEY);
      });
      const tr = el("tr", { class: getSelectedRowKey() === row.ROW_KEY ? "is-selected" : "" }, columns.map((column) => (
        column === "SELECT"
          ? el("td", { class: "col-select" }, radio)
          : el("td", { class: columnClassName(column) }, valueText(row[column]))
      )));
      tr.addEventListener("click", (event) => {
        if (event.target?.tagName === "INPUT") return;
        updateSelectedRow(row.ROW_KEY);
      });
      rowElements.set(row.ROW_KEY, tr);
      radioElements.set(row.ROW_KEY, radio);
      bodyRows.push(tr);
    });
    if (bottomHeight > 0) {
      bodyRows.push(el("tr", { class: "virtual-spacer-row" }, [
        el("td", { colspan: String(columns.length), style: `height:${bottomHeight}px;padding:0;border:0;` })
      ]));
    }
    tbody.replaceChildren(...bodyRows);
  };

  const renderVirtualBody = () => {
    const viewportRows = Math.ceil(wrapper.clientHeight / rowHeight) + 12;
    const start = Math.max(0, Math.floor(wrapper.scrollTop / rowHeight) - 6);
    const end = Math.min(currentRows.length, start + viewportRows);
    renderVisibleRows(
      currentRows,
      start,
      end,
      start * rowHeight,
      Math.max(0, (currentRows.length - end) * rowHeight)
    );
  };

  renderHeader();
  renderBody();
  table.append(thead, tbody);
  wrapper.appendChild(table);
  if (virtual) {
    wrapper.classList.add("is-virtualized");
    wrapper.addEventListener("scroll", () => {
      if (renderToken !== null) return;
      renderToken = requestAnimationFrame(() => {
        renderToken = null;
        renderVirtualBody();
      });
    });
    requestAnimationFrame(renderVirtualBody);
  }
  return wrapper;
}

function optionalNumberCriterion(value) {
  const text = String(value ?? "").trim();
  if (text === "") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function trackerRowMetrics(row) {
  const directScores = row.directScores || [];
  const impliedScores = row.impliedScores || [];
  return {
    directCorrect: directScores.filter((score) => score === 1).length,
    directIncorrect: directScores.filter((score) => score === 0).length,
    impliedCorrect: impliedScores.filter((score, index) => score === 1 && !hasDirectScore(directScores[index])).length,
    impliedIncorrect: impliedScores.filter((score, index) => score === 0 && !hasDirectScore(directScores[index])).length,
    scored: impliedScores.filter((score) => score !== null && score !== undefined).length
  };
}

function hasDirectScore(score) {
  return score !== null && score !== undefined;
}

function trackerSelectedStepLine(row, attempts) {
  const statusFilters = selectedTrackerStatusFilters();
  if (statusFilters.size) {
    return el("p", { class: "status-line" }, "Showing complete selected status set.");
  }
  if (state.tracker.finalState) {
    return el("p", { class: "status-line ok" }, "Final state shown for this student.");
  }
  if (!state.tracker.step) {
    return el("p", { class: "status-line" }, "No sequence step selected.");
  }
  const active = attempts.find((attempt) => Number(attempt.step) === Number(state.tracker.step));
  if (!active) return el("p", { class: "status-line warn" }, "Selected step is not available for this student.");
  const priorStatus = active.step > 1 ? simulateTracker(row, active.step - 1).statusById[String(active.questionNumber)] : "";
  return el("p", { class: "status-line" }, [
    `Selected S${active.step}: Q${active.questionNumber} (${active.score === 1 ? "correct" : "incorrect"})`,
    priorStatus ? `; previously ${priorStatus.replace("-", " ")}` : ""
  ]);
}

function sourceRows() {
  const stagedRows = stagedAttemptRows();
  if (stagedRows.length) return stagedRows;
  return state.attemptSources.map((source) => sourceRow(source, source.error || "imported"));
}

function stagedAttemptRows() {
  return state.stagedSources.attempts.map((source) => sourceRow({
    ...source,
    attemptCount: "",
    attempts: []
  }, "staged"));
}

function sourceRow(source, status) {
  return {
    label: source.label,
    fileName: source.fileName,
    path: source.file ? "Browser-selected file (current session only)" : (source.windowsPath || source.path || ""),
    attempts: source.attemptCount,
    normalised: source.attempts?.length ?? "",
    status
  };
}

function emptyStagedSources() {
  return {
    exam: null,
    gexf: null,
    attempts: [],
    embeddedSetup: null
  };
}

function cloneStagedSources(staged = emptyStagedSources()) {
  return {
    exam: staged.exam ? { ...staged.exam } : null,
    gexf: staged.gexf ? { ...staged.gexf } : null,
    attempts: (staged.attempts || []).map((source) => ({ ...source })),
    embeddedSetup: staged.embeddedSetup || null
  };
}

function markSourcesStaged() {
  state.stagedSources.embeddedSetup = null;
  clearDashboardOutputs();
  resetImportStatus("Sources changed. Click Import Sources to load these paths, then choose an enabled build button.");
  state.setupDirty = true;
  updateSaveSetupButton();
  renderAll();
}

async function importSources() {
  if (state.importStatus.imported && state.importStatus.signature === sourceImportSignature()) {
    state.importStatus.message = "Staged sources have already been imported.";
    renderSetup();
    return;
  }
  await withLoading("Importing staged sources", async () => {
    if (state.stagedSources.embeddedSetup) {
      applyEmbeddedSetupFiles(state.stagedSources.embeddedSetup);
    } else {
      await importBrowserSelectedSources();
    }
    validateRequiredSourcePathsForAnalysis();
    localStorage.setItem(SETUP_CACHE_KEY, JSON.stringify(setupPayload({ embedFiles: false })));
    markSetupClean();
    state.importStatus = {
      imported: true,
      signature: sourceImportSignature(),
      message: importSuccessMessage()
    };
    state.dashboardDirty = true;
    renderAll();
  }, "Reading staged filenames and paths, then parsing source data.");
}

function validateRequiredSourcePathsForAnalysis() {
  if (!hasImportedExam() && !hasImportedGexf() && !hasImportedAttempts()) {
    resetImportStatus("No readable source files were imported. Check the staged paths, then click Import Sources again.");
    throw new Error("No readable source files were imported. Check the staged paths, then click Import Sources again.");
  }
}

function sourceImportSignature() {
  const setup = setupPayload({ embedFiles: false });
  return JSON.stringify({
    filePaths: setup.filePaths || {},
    files: setup.files || {},
    windowsFilePaths: setup.windowsFilePaths || {},
    browserFiles: {
      exam: fileSignature(state.stagedSources.exam),
      gexf: fileSignature(state.stagedSources.gexf),
      attempts: (state.stagedSources.attempts || []).map(fileSignature)
    }
  });
}

function fileSignature(source) {
  if (!source) return null;
  return {
    fileName: source.fileName || source.name || "",
    size: source.size ?? source.file?.size ?? "",
    lastModified: source.lastModified ?? source.file?.lastModified ?? ""
  };
}

function importSuccessMessage() {
  const parts = [];
  if (state.exam || state.stagedSources.exam) parts.push("Numbas exam");
  const attemptCount = countAttemptInputsForR();
  if (attemptCount) parts.push(`${attemptCount} attempt source${attemptCount === 1 ? "" : "s"}`);
  if (state.gexf || state.stagedSources.gexf) parts.push("GEXF map");
  return `Sources imported: ${parts.length ? parts.join(", ") : "staged source metadata"}.`;
}

function resetImportStatus(message = "") {
  state.importStatus = {
    imported: false,
    signature: "",
    message
  };
  state.dashboardDirty = Boolean(message);
  state.dashboardBuild = { running: false, tasks: [], message: "" };
}

function clearDashboardOutputs() {
  closeTransientVisuals();
  state.km = null;
  state.validation = null;
  state.datasets = null;
  state.implied = null;
  state.curriculum = null;
  state.rasch = null;
  state.tracker = defaultTrackerState();
  state.kmVisibleGroups = null;
  state.kmSelectedNodeId = "";
  state.kmSearchQuery = "";
  state.kmLayoutMode = "default";
}

function invalidateDashboardOutputs(message) {
  clearDashboardOutputs();
  state.dashboardDirty = true;
  state.dashboardBuild = {
    running: false,
    status: "dirty",
    tasks: [],
    message: message || "Dashboard outputs are dirty. Build Dashboard to refresh them."
  };
}

async function importBrowserSelectedSources() {
  resetImportedSourceData();
  await loadSelectedBrowserFiles();
  normaliseAttemptSources();
  state.validation = state.km && state.gexf ? compareKnowledgeMaps(state.km, state.gexf) : null;
}

async function loadSelectedBrowserFiles() {
  const errors = [];
  if (state.stagedSources.exam) {
    try {
      const text = await readStagedSourceText(state.stagedSources.exam, "Numbas exam");
      state.exam = {
        name: state.stagedSources.exam.fileName,
        path: state.stagedSources.exam.file ? "" : (state.stagedSources.exam.path || state.stagedSources.exam.windowsPath || state.stagedSources.exam.fileName),
        text,
        data: parseNumbasExam(text)
      };
    } catch (error) {
      errors.push(`Exam: ${error.message}`);
    }
  }

  state.attemptSources = [];
  for (const [index, source] of (state.stagedSources.attempts || []).entries()) {
    try {
      const text = await readStagedSourceText(source, `Attempt data ${source.fileName || index + 1}`);
      const raw = JSON.parse(text.replace(/^\uFEFF/, ""));
      state.attemptSources.push({
        label: source.label || `data_source_${index + 1}`,
        fileName: source.fileName || `attempt_${index + 1}.json`,
        path: source.file ? "" : (source.path || source.windowsPath || source.fileName || ""),
        text,
        raw,
        attemptCount: Array.isArray(raw.attempts) ? raw.attempts.length : 0,
        attempts: [],
        error: ""
      });
    } catch (error) {
      errors.push(`Attempt data ${source.fileName || index + 1}: ${error.message}`);
    }
  }

  if (state.stagedSources.gexf) {
    try {
      const text = await readStagedSourceText(state.stagedSources.gexf, "GEXF knowledge map");
      state.gexf = parseGexf(text, state.stagedSources.gexf.fileName);
      state.gexf.path = state.stagedSources.gexf.file ? "" : (state.stagedSources.gexf.path || state.stagedSources.gexf.windowsPath || state.stagedSources.gexf.fileName);
      state.gexf.text = text;
    } catch (error) {
      errors.push(`GEXF: ${error.message}`);
    }
  }

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }
}

async function readStagedSourceText(source, label) {
  if (source?.file) return source.file.text();
  const sourcePath = source?.path || source?.windowsPath || "";
  if (!sourcePath && source?.fileName) {
    throw new Error(`${source.fileName} has no saved path or URL. Choose the local file for this session, enter a full path/URL, or upload a setup JSON that includes source paths.`);
  }
  if (isLocalFilesystemPath(sourcePath)) {
    if (!canUseLocalSourceBridge()) {
      throw new Error(localFilesystemPathUnavailableMessage(sourcePath));
    }
    return readSourceTextViaLocalBridge(sourcePath);
  }
  const url = browserFetchUrlForPath(sourcePath);
  if (url) return fetchText(url);
  throw new Error(`${sourcePath || label} could not be converted to a browser-readable URL or local source-file path.`);
}

async function readSourceTextViaLocalBridge(sourcePath) {
  let response;
  try {
    response = await fetch("api.php?action=read-source", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: sourcePath })
    });
  } catch (error) {
    throw new Error(`Could not reach the local file bridge api.php. Start the app with the PHP local server, then try Import Sources again. (${error.message})`);
  }

  const text = await response.text();
  if (!response.ok) {
    const looksLikeStaticServer = response.status === 404 || response.status === 405 || response.status === 501 || /<!doctype html|<html|unsupported method/i.test(text);
    if (looksLikeStaticServer) {
      throw new Error("Local filesystem paths require the PHP local server for this JS app. For example: php -S 127.0.0.1:8010 -t NumeracyWorkingGroup/DiagnosticToolProject/Analysis/DiagnosticToolWebsiteJS");
    }
    throw new Error(text || `Could not read ${sourcePath}`);
  }
  return text;
}

function canUseLocalSourceBridge() {
  const host = String(window.location.hostname || "").toLowerCase();
  return host === "localhost" || host === "::1" || host === "[::1]" || /^127(?:\.\d+){3}$/.test(host);
}

function localFilesystemPathUnavailableMessage(sourcePath) {
  return `${sourcePath} is a local filesystem path. A hosted web page cannot read files from your computer by path. Use Choose local file(s), enter an http(s) URL or relative URL to a file hosted with the app, or run this app locally with the PHP server so api.php can read local paths.`;
}

function isLocalFilesystemPath(path) {
  const rawPath = String(path || "").trim();
  const cleanPath = rawPath.replace(/\\/g, "/");
  return Boolean(
    /^[A-Za-z]:\//.test(cleanPath) ||
    rawPath.startsWith("\\\\") ||
    cleanPath.startsWith("//wsl$/") ||
    cleanPath.startsWith("//wsl.localhost/") ||
    (cleanPath.startsWith("/") && !cleanPath.startsWith("//"))
  );
}

function browserFetchUrlForPath(path) {
  const cleanPath = String(path || "").trim();
  if (!cleanPath) return "";
  if (/^(https?:)?\/\//i.test(cleanPath) && !isWslUncPath(cleanPath)) return cleanPath;

  const normalised = cleanPath.replace(/\\/g, "/");
  const rootMarker = "/DiagnosticToolWebsiteJS/";
  const markerIndex = normalised.toLowerCase().lastIndexOf(rootMarker.toLowerCase());
  if (markerIndex >= 0) {
    return encodePathUrl(normalised.slice(markerIndex + rootMarker.length));
  }

  if (/^[A-Za-z]:\//.test(normalised) || normalised.startsWith("//") || normalised.startsWith("/")) {
    return "";
  }
  return encodePathUrl(normalised);
}

function encodePathUrl(path) {
  return String(path || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function resetImportedSourceData() {
  closeTransientVisuals();
  state.exam = null;
  state.gexf = null;
  state.attemptSources = [];
  state.attempts = [];
  state.km = null;
  state.validation = null;
  state.datasets = null;
  state.implied = null;
  state.curriculum = null;
  state.rasch = null;
  state.tracker = defaultTrackerState();
}

function datasetPreviewRows() {
  if (!state.datasets) return [];
  return state.datasets.rows.map((row) => ({
    rowKey: row.rowKey,
    username: row.username,
    start_time: formatAttemptTimestamp(row.start_time),
    end_time: formatAttemptTimestamp(row.end_time),
    direct_topics: row.directAttempts ?? row.numDirectScoreQuestions ?? countNonNull(row.directScores || []),
    first_question_number: valueText(row.firstQuestionNumber)
  }));
}

function showDatasetFullPreview() {
  const rows = datasetFullRows();
  const columns = rows[0] ? Object.keys(rows[0]) : datasetFullColumns();
  showFloatingContent("Attempt Dataset Records", createPagedTable(rows, columns, { pageSize: 50 }), { fullscreen: true });
}

function datasetFullRows() {
  const sourceRows = state.implied?.rows || state.datasets?.rows || [];
  if (!sourceRows.length) return [];
  const questionCount = state.km?.nodes?.length || Math.max(
    ...sourceRows.flatMap((row) => [
      row.directScores?.length || 0,
      row.sequence?.length || 0,
      row.impliedScores?.length || 0
    ]),
    0
  );
  return sourceRows.map((row) => {
    const out = {
      rowKey: row.rowKey,
      username: row.username,
      start_time: formatAttemptTimestamp(row.start_time),
      end_time: formatAttemptTimestamp(row.end_time),
      direct_topics: row.directAttempts ?? row.numDirectScoreQuestions ?? countNonNull(row.directScores || []),
      first_question_number: valueText(row.firstQuestionNumber)
    };
    for (let index = 0; index < questionCount; index += 1) {
      const label = paddedQuestionLabel(index + 1);
      out[`${label}_direct_score`] = arrayCell(row.directScores, index);
    }
    for (let index = 0; index < questionCount; index += 1) {
      const label = paddedQuestionLabel(index + 1);
      out[`${label}_sequence`] = arrayCell(row.sequence, index);
    }
    for (let index = 0; index < questionCount; index += 1) {
      const label = paddedQuestionLabel(index + 1);
      out[`${label}_implied_score`] = arrayCell(row.impliedScores, index);
    }
    return out;
  });
}

function datasetFullColumns() {
  return ["rowKey", "username", "start_time", "end_time", "direct_topics", "first_question_number"];
}

function arrayCell(values, index) {
  if (!Array.isArray(values)) return "";
  const value = values[index];
  return value === null || value === undefined ? "" : value;
}

function paddedQuestionLabel(number) {
  return `Q${String(number).padStart(3, "0")}`;
}

function impliedPreviewRows() {
  if (!state.implied) return [];
  return state.implied.rows.map((row) => ({
    rowKey: row.rowKey,
    username: row.username,
    numDirectScoreQuestions: row.numDirectScoreQuestions,
    numImpliedScoreQuestions: row.numImpliedScoreQuestions,
    totalImpliedCorrect: row.impliedScores.filter((score) => score === 1).length
  }));
}

function matrixColumnSummaryRows(kind) {
  if (!state.implied) return [];
  return state.implied.impliedColumnRows(kind)
    .slice()
    .sort((a, b) => {
      const aNumber = questionNumberFromColumn(a.column);
      const bNumber = questionNumberFromColumn(b.column);
      if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
      if (Number.isFinite(aNumber)) return -1;
      if (Number.isFinite(bNumber)) return 1;
      return String(a.column || "").localeCompare(String(b.column || ""));
    })
    .map((row) => ({
      Topic: matrixTopicLabel(row.column),
      kept: row.kept,
      nonMissing: row.nonMissing,
      sum: row.sum
    }));
}

function matrixTopicLabel(column) {
  const number = questionNumberFromColumn(column);
  return Number.isFinite(number) ? paddedQuestionLabel(number) : cleanLabel(column);
}

function questionNumberFromColumn(column) {
  const match = String(column || "").match(/Q0*(\d+)/i);
  return match ? Number(match[1]) : NaN;
}

function validationNotice() {
  const checks = state.km.validation;
  const rows = [
    { check: "length(questionNamesJSON)", value: checks.questionNamesJSON, expected: state.km.nodes.length },
    { check: "length(questionNumbersJSON)", value: checks.questionNumbersJSON, expected: state.km.nodes.length },
    { check: "length(topicNumbersDiagnosticTool)", value: checks.topicNumbersDiagnosticTool, expected: state.km.nodes.length },
    { check: "mismatches", value: checks.mismatches.length, expected: 0 }
  ];
  const hasIssue = rows.some((row) => row.value !== row.expected);
  return el("article", { class: hasIssue ? "card notice issue" : "card notice" }, [
    el("h3", {}, "Validation checks"),
    createTable(rows, ["check", "value", "expected"])
  ]);
}

function showValidationChecks() {
  const host = document.getElementById("setupPreviewHost");
  host.replaceChildren(validationNotice());
  setSetupPreviewMode("staged");
  const title = document.querySelector("#setupPreviewModal .modal-bar strong");
  if (title) title.textContent = "Validation Checks";
  document.getElementById("setupPreviewModal").hidden = false;
}

function validationCard(title, rows) {
  const normalised = rows.map((row) => typeof row === "string" ? { value: row } : row);
  return el("article", { class: normalised.length ? "card notice issue" : "card notice" }, [
    el("h3", {}, title),
    normalised.length ? createTable(normalised, Object.keys(normalised[0])) : el("p", { class: "muted" }, "No rows reported.")
  ]);
}

function buildKnowledgeMapFromExam(exam) {
  const diagnostic = exam.diagnostic || {};
  const graph = diagnostic.knowledge_graph || {};
  const topics = Array.isArray(graph.topics) ? graph.topics : [];
  const questionGroups = Array.isArray(exam.question_groups) ? exam.question_groups : [];

  if (!topics.length) {
    throw new Error("The exam file does not contain diagnostic.knowledge_graph.topics.");
  }

  const topicIndexByName = uniqueIndexMap(topics.map((topic) => cleanLabel(topic.name)));
  const topicIndexByKey = uniqueIndexMap(topics.map((topic) => labelMatchKey(topic.name)));
  const questionGroupMatches = questionGroups.map((group, index) => {
    const exact = topicIndexByName.get(cleanLabel(group.name));
    if (Number.isInteger(exact)) return { index: exact, matched: true };
    const keyed = topicIndexByKey.get(labelMatchKey(group.name));
    if (Number.isInteger(keyed)) return { index: keyed, matched: true };
    return { index: null, matched: false };
  });
  const questionGroupToTopicIndex = questionGroupMatches.map((match) => match.index);

  const nodes = topics.map((topic, index) => {
    const matchedGroups = questionGroups.filter((item, groupIndex) => {
      const match = questionGroupMatches[groupIndex];
      return match?.matched && match.index === index;
    });
    const questionNames = uniqueStrings(matchedGroups.flatMap((group) => questionNamesFromGroup(group.questions)));
    const learningObjectives = Array.isArray(topic.learning_objectives) ? topic.learning_objectives.map(cleanLabel) : [];
    return {
      id: String(index + 1),
      zeroBasedIndex: index,
      topicName: cleanLabel(topic.name),
      questionNames,
      questionName: questionNames.length ? questionNames.join(", ") : cleanLabel(topic.name),
      curriculumGroup: learningObjectives[0] || "",
      learningObjectives
    };
  });

  const edges = [];
  topics.forEach((topic, index) => {
    const dependent = nodes[index];
    const dependsOn = Array.isArray(topic.depends_on) ? topic.depends_on : [];
    dependsOn.forEach((dependencyName) => {
      const depIndex = topicIndexByName.get(cleanLabel(dependencyName));
      if (depIndex === undefined) return;
      const prerequisite = nodes[depIndex];
      edges.push({
        source: prerequisite.id,
        target: dependent.id,
        sourceTopic: prerequisite.topicName,
        targetTopic: dependent.topicName
      });
    });
  });

  const reach = buildReachability(nodes, edges);
  const dictionary = nodes.map((node) => ({
    TopicName: node.topicName,
    QuestionNamesJSON: node.questionNames?.length ? node.questionNames.join(", ") : node.questionName,
    TopicNumbersDiagnosticTool: Number(node.id),
    ImmediateInNodes: nodeIdListText(reach.inAdj[node.id]),
    ImmediateOutNodes: nodeIdListText(reach.outAdj[node.id]),
    AllInNodes: nodeIdListText(reach.in[node.id]),
    AllOutNodes: nodeIdListText(reach.out[node.id]),
    curriculumGroup: node.curriculumGroup
  }));

  const mismatches = nodes
    .filter((node) => !topicIndexByName.has(cleanLabel(node.topicName)))
    .map((node) => node.id);

  const payload = {
    nodes,
    edges,
    dictionary,
    groups: [...new Set(nodes.map((node) => node.curriculumGroup || "Ungrouped"))].sort(),
    reachability: reach,
    questionGroupToTopicIndex,
    questionNameToTopicIndex: questionNameTopicMap(nodes),
    validation: {
      questionNamesJSON: nodes.length,
      questionNumbersJSON: nodes.length,
      topicNumbersDiagnosticTool: nodes.length,
      mismatches
    }
  };
  return payload;
}

function questionNamesFromGroup(questions) {
  const values = [];
  if (Array.isArray(questions)) {
    questions.forEach((question) => {
      const name = cleanLabel(question?.name);
      if (name) values.push(name);
    });
  } else if (questions && typeof questions === "object") {
    const nameValues = Array.isArray(questions.name) ? questions.name : [questions.name];
    nameValues.forEach((name) => {
      const cleanName = cleanLabel(name);
      if (cleanName) values.push(cleanName);
    });
  }
  return uniqueStrings(values);
}

function questionNameTopicMap(nodes) {
  const exact = new Map();
  const normalised = new Map();
  nodes.forEach((node, index) => {
    (node.questionNames || [node.questionName]).forEach((name) => {
      const cleanName = cleanLabel(name);
      if (!cleanName) return;
      addTopicIndexToMap(exact, cleanName, index);
      addTopicIndexToMap(normalised, labelMatchKey(cleanName), index);
    });
  });
  return { exact, normalised };
}

function addTopicIndexToMap(map, key, index) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  const values = map.get(key);
  if (!values.includes(index)) values.push(index);
}

function topicIndexesForQuestionName(questionName) {
  const cleanName = cleanLabel(questionName);
  if (!cleanName || !state.km?.questionNameToTopicIndex) return [];
  const exact = state.km.questionNameToTopicIndex.exact?.get(cleanName);
  if (Array.isArray(exact) && exact.length) return exact;
  const normalised = state.km.questionNameToTopicIndex.normalised?.get(labelMatchKey(cleanName));
  return Array.isArray(normalised) ? normalised : [];
}

function buildReachability(nodes, edges) {
  const outAdj = Object.fromEntries(nodes.map((node) => [node.id, []]));
  const inAdj = Object.fromEntries(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => {
    outAdj[edge.source].push(edge.target);
    inAdj[edge.target].push(edge.source);
  });
  const out = {};
  const incoming = {};
  nodes.forEach((node) => {
    out[node.id] = reachableFrom(node.id, outAdj);
    incoming[node.id] = reachableFrom(node.id, inAdj);
  });
  return { out, in: incoming, outAdj, inAdj };
}

function nodeIdListText(ids) {
  const values = normaliseIdList(ids)
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b);
  return values.length ? values.join(";") : "NA";
}

function normaliseIdList(ids) {
  if (ids === null || ids === undefined || ids === "" || ids === "NA") return [];
  if (Array.isArray(ids)) return ids;
  if (ids instanceof Set) return [...ids];
  if (ids instanceof Map) return [...ids.values()].flatMap(normaliseIdList);
  if (typeof ids === "number" || typeof ids === "bigint") return [ids];
  if (typeof ids === "string") {
    return ids.split(/[;,\s|]+/).map((part) => part.trim()).filter(Boolean);
  }
  if (typeof ids === "object") {
    const entries = Object.entries(ids);
    if (entries.length && entries.every(([, value]) => typeof value === "boolean")) {
      return entries.filter(([, value]) => value).map(([key]) => key);
    }
    return Object.values(ids).flatMap(normaliseIdList);
  }
  return [];
}

function reachableFrom(startId, adjacency) {
  const seen = new Set();
  const queue = [...(adjacency[startId] || [])];
  while (queue.length) {
    const id = queue.shift();
    if (!id || id === startId || seen.has(id)) continue;
    seen.add(id);
    (adjacency[id] || []).forEach((next) => {
      if (!seen.has(next) && next !== startId) queue.push(next);
    });
  }
  return [...seen].sort((a, b) => Number(a) - Number(b));
}

function parseNumbasExam(text) {
  const stripped = text.replace(/^\uFEFF/, "").replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(stripped);
}

function parseGexf(text, name) {
  const cleaned = text.replace(/\s*<viz:color[^>]*\/>/g, "");
  const doc = new DOMParser().parseFromString(cleaned, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("The GEXF XML could not be parsed.");
  }

  const attrTitles = {};
  [...doc.getElementsByTagName("attribute")].forEach((attr) => {
    attrTitles[attr.getAttribute("id")] = attr.getAttribute("title");
  });

  const nodes = [...doc.getElementsByTagName("node")].map((node, index) => {
    const attrs = {};
    [...node.getElementsByTagName("attvalue")].forEach((att) => {
      const key = attrTitles[att.getAttribute("for")] || att.getAttribute("for");
      attrs[key] = att.getAttribute("value") || "";
    });
    return {
      id: node.getAttribute("id") || String(index + 1),
      label: cleanLabel(node.getAttribute("label") || node.getAttribute("id") || String(index + 1)),
      group: attrs.group || "",
      gexf_id: attrs.gexf_id || ""
    };
  });

  const labelByEndpoint = new Map();
  nodes.forEach((node) => {
    labelByEndpoint.set(node.id, node.label);
    labelByEndpoint.set(node.label, node.label);
    if (node.gexf_id !== "") labelByEndpoint.set(node.gexf_id, node.label);
  });

  const edges = [...doc.getElementsByTagName("edge")].map((edge) => ({
    source: labelByEndpoint.get(edge.getAttribute("source")) || cleanLabel(edge.getAttribute("source")),
    target: labelByEndpoint.get(edge.getAttribute("target")) || cleanLabel(edge.getAttribute("target"))
  }));

  return { name, nodes, edges };
}

function normaliseAttemptSources() {
  if (!state.km) {
    state.attempts = [];
    return;
  }
  const attempts = [];
  state.attemptSources.forEach((source) => {
    if (!source.raw || !Array.isArray(source.raw.attempts)) return;
    source.attempts = source.raw.attempts.map((attempt, index) => normaliseAttempt(attempt, source.label, index + 1));
    attempts.push(...source.attempts);
  });
  state.attempts = attempts;
}

function normaliseAttempt(attempt, dataSource, sourceIndex) {
  const numQuestions = state.km.nodes.length;
  const directScores = Array(numQuestions).fill(null);
  const sequence = Array(numQuestions).fill(null);
  const attemptQuestions = readAttemptQuestions(attempt);
  const scores = Array.isArray(attempt.scores) ? attempt.scores : [];
  const mappingErrors = [];
  let firstQuestionNumber = null;

  if (attemptQuestions.length) {
    attemptQuestions.forEach((question, index) => {
      const zeroIndexes = topicIndexesForAttemptQuestion(question);
      if (!zeroIndexes.length) {
        mappingErrors.push({
          step: index + 1,
          questionName: cleanLabel(question?.name),
          debugGroup: question?.group
        });
        return;
      }
      const scoreRecord = scores[index] || {};
      const scaledScore = numericOrNull(scoreRecord.scaled_score ?? scaledQuestionScore(question));
      const uniqueIndexes = uniqueFiniteIntegers(zeroIndexes).filter((zeroIndex) => zeroIndex >= 0 && zeroIndex < numQuestions);
      if (index === 0 && uniqueIndexes.length === 1) firstQuestionNumber = uniqueIndexes[0] + 1;
      uniqueIndexes.forEach((zeroIndex) => {
        directScores[zeroIndex] = scaledScore;
        sequence[zeroIndex] = index + 1;
      });
    });
  } else {
    scores.forEach((scoreRecord, index) => {
      mappingErrors.push({
        step: index + 1,
        questionName: "",
        debugGroup: scoreRecord.question
      });
    });
  }

  const user = attempt.user || {};
  const payload = {
    attempt_id: attempt.attempt ?? `${dataSource}_${sourceIndex}`,
    data_source: dataSource,
    source_index: sourceIndex,
    username: cleanLabel(user.username || user.name || ""),
    first_name: cleanLabel(user.first_name || ""),
    last_name: cleanLabel(user.last_name || ""),
    start_time: attempt.start_time ?? "",
    end_time: attempt.end_time ?? "",
    firstQuestionNumber,
    directScoresRaw: directScores,
    sequence,
    mappingErrors
  };
  return payload;
}

function topicIndexesForAttemptQuestion(question) {
  return topicIndexesForQuestionName(question?.name);
}

function uniqueFiniteIntegers(values) {
  return [...new Set((values || []).map(Number).filter((value) => Number.isInteger(value)))];
}

function readAttemptQuestions(attempt) {
  const suspend = attempt.suspend_data || parseScormSuspendData(attempt);
  return Array.isArray(suspend?.questions) ? suspend.questions : [];
}

function parseScormSuspendData(attempt) {
  const value = attempt?.scorm?.current?.["cmi.suspend_data"]?.value;
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function scaledQuestionScore(question) {
  const score = numericOrNull(question.score);
  const max = numericOrNull(question.max_score);
  if (score === null || !max) return null;
  return score / max;
}

async function buildDatasets() {
  const result = await runRSourceAnalysis("datasets");
  applyAnalysisResult(result);
}

async function runImpliedScoring() {
  const result = await runRSourceAnalysis("implied");
  applyAnalysisResult(result);
}

async function requestRaschAnalysis(options = {}) {
  if (!state.implied?.rawMatrix || !state.implied?.impliedMatrix) {
    throw new Error("Run implied scoring first so raw and implied response matrices are available.");
  }
  return runBrowserRaschAnalysis(state.implied.rawMatrix, state.implied.impliedMatrix, options);
}

async function runRaschAnalysis() {
  if (!state.implied) return;
  state.rasch = { running: true };
  setLoading("Running Rasch Analysis");
  renderRasch();
  try {
    state.rasch = await requestRaschAnalysis();
  } catch (error) {
    state.rasch = { ok: false, error: error.message };
  } finally {
    setLoading("");
  }
  renderRasch();
}

async function runBrowserRaschAnalysis(rawMatrix, impliedMatrix, options = {}) {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  onProgress({
    percent: 2,
    phase: "Rasch Analysis",
    message: "Preparing response matrices.",
    detail: "Preparing raw and implied score matrices for browser Rasch analysis."
  });
  await nextFrame();

  const raw = await fitBrowserRaschMatrix(rawMatrix, "raw", {
    progressStart: 4,
    progressEnd: 48,
    onProgress
  });
  const implied = await fitBrowserRaschMatrix(impliedMatrix, "implied", {
    progressStart: 52,
    progressEnd: 96,
    onProgress
  });
  const summary = {
    raw: raw.summary,
    implied: implied.summary,
    engine: {
      name: "browser-1pl-mml",
      target: "TAM::tam.mml(resp = response), dichotomous 1PL",
      quadratureNodes: 21,
      nodeRange: [-6, 6]
    }
  };
  const summaryText = JSON.stringify(summary, null, 2);
  const files = [
    ...raw.files,
    ...implied.files,
    createRaschOutputFile("rasch_summary.json", "application/json", summaryText)
  ];
  onProgress({
    percent: 100,
    phase: "Rasch Analysis",
    message: "Browser Rasch analysis complete.",
    detail: "Browser Rasch analysis complete. Output tables are available."
  });
  return {
    ok: true,
    browserEngine: true,
    runId: `browser_${timestampId()}`,
    summary,
    files
  };
}

async function fitBrowserRaschMatrix(matrix, prefix, options = {}) {
  const prepared = prepareRaschMatrix(matrix);
  if (prepared.rows.length < 2 || prepared.columns.length < 2) {
    throw new Error(`${kindLabel(prefix)} response matrix must have at least two rows and two usable item columns.`);
  }
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const progressStart = Number(options.progressStart || 0);
  const progressEnd = Number(options.progressEnd || 100);
  const progress = (fraction, message) => {
    const percent = Math.round(progressStart + Math.max(0, Math.min(1, fraction)) * (progressEnd - progressStart));
    onProgress({
      percent,
      phase: "Rasch Analysis",
      message,
      detail: `${kindLabel(prefix)} Rasch: ${message} (${percent}%)`
    });
  };
  progress(0, "Initialising 1PL MML fit.");
  const fit = await rasch1plMml(prepared, { onProgress: progress });
  progress(0.96, "Writing browser output files.");
  const files = raschFilesForFit(prefix, prepared, fit);
  progress(1, "Complete.");
  return {
    summary: {
      prefix,
      rows: prepared.rows.length,
      columns: prepared.columns.length,
      removed_zero_or_na_columns: prepared.removedColumns,
      deviance: round(fit.deviance, 4),
      iterations: fit.iterations,
      variance: round(fit.variance, 6),
      converged: fit.converged
    },
    files
  };
}

function prepareRaschMatrix(matrix) {
  const columns = Array.isArray(matrix?.columns) ? matrix.columns.slice() : [];
  const sourceRows = Array.isArray(matrix?.rows) ? matrix.rows : [];
  const rows = sourceRows.map((row) => columns.map((_, index) => {
    const value = row[index];
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return number >= 0.5 ? 1 : 0;
  }));
  const keep = columns.map((_, index) => rows.some((row) => row[index] === 1));
  return {
    columns: columns.filter((_, index) => keep[index]),
    rows: rows.map((row) => row.filter((_, index) => keep[index])),
    removedColumns: columns.filter((_, index) => !keep[index])
  };
}

async function rasch1plMml(prepared, options = {}) {
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
  const data = prepared.rows;
  const nPersons = data.length;
  const nItems = prepared.columns.length;
  const nodes = Array.from({ length: 21 }, (_, index) => -6 + index * 0.6);
  const thetaWidth = nodes.length > 1 ? Math.abs(nodes[1] - nodes[0]) : 1;
  const observedCounts = Array(nItems).fill(0);
  const observedScores = Array(nItems).fill(0);

  data.forEach((row) => {
    row.forEach((value, itemIndex) => {
      if (value === null || value === undefined) return;
      observedCounts[itemIndex] += 1;
      observedScores[itemIndex] += value;
    });
  });

  const difficulty = observedScores.map((score, index) => {
    const count = observedCounts[index];
    const numerator = Math.abs(0.5 - score);
    const denominator = Math.abs(score - count + 0.5);
    return -Math.log(numerator / denominator);
  });

  let variance = 1;
  let deviance = Infinity;
  let previousDeviance = Infinity;
  let converged = false;
  let posteriorCache = null;
  let minDeviance = Infinity;
  let minDifficulty = difficulty.slice();
  let minVariance = variance;
  let minPosteriorCache = null;
  let minProbabilityCache = null;
  const maxIter = 1000;
  const conv = 1e-4;
  const convD = 1e-3;

  for (let iter = 1; iter <= maxIter; iter += 1) {
    const prior = normalDensityWeights(nodes, variance);
    const probabilities = difficulty.map((itemDifficulty) => nodes.map((theta) => logistic(theta - itemDifficulty)));
    const nodeObservedWeights = Array.from({ length: nItems }, () => Array(nodes.length).fill(0));
    let firstMoment = 0;
    let secondMoment = 0;
    let logLikelihood = 0;
    posteriorCache = [];

    data.forEach((row) => {
      const logPosterior = nodes.map((_, nodeIndex) => {
        let total = Math.log(prior[nodeIndex]);
        row.forEach((value, itemIndex) => {
          if (value === null || value === undefined) return;
          const p = clampProbability(probabilities[itemIndex][nodeIndex]);
          total += value === 1 ? Math.log(p) : Math.log1p(-p);
        });
        return total;
      });
      const logNorm = logSumExp(logPosterior);
      logLikelihood += logNorm + Math.log(thetaWidth);
      const posterior = logPosterior.map((value) => Math.exp(value - logNorm));
      posteriorCache.push(posterior);
      posterior.forEach((weight, nodeIndex) => {
        firstMoment += weight * nodes[nodeIndex];
        secondMoment += weight * nodes[nodeIndex] * nodes[nodeIndex];
      });
      row.forEach((value, itemIndex) => {
        if (value === null || value === undefined) return;
        posterior.forEach((weight, nodeIndex) => {
          nodeObservedWeights[itemIndex][nodeIndex] += weight;
        });
      });
    });

    const oldDifficulty = difficulty.slice();
    const oldVariance = variance;
    for (let itemIndex = 0; itemIndex < nItems; itemIndex += 1) {
      if (!observedCounts[itemIndex]) continue;
      let oldIncrement = 1;
      for (let step = 0; step < 4; step += 1) {
        let expected = 0;
        let information = 0;
        nodes.forEach((theta, nodeIndex) => {
          const p = logistic(theta - difficulty[itemIndex]);
          const weight = nodeObservedWeights[itemIndex][nodeIndex];
          expected += weight * p;
          information += weight * p * (1 - p);
        });
        if (information <= 1e-10) break;
        let increment = (observedScores[itemIndex] - expected) / information;
        increment = trimTamHalfIncrement(increment, oldIncrement);
        oldIncrement = increment;
        difficulty[itemIndex] -= increment;
        if (Math.abs(increment) < conv) break;
      }
    }
    const betaForVariance = firstMoment / Math.max(1, nPersons);
    variance = Math.max(1e-3, (secondMoment - firstMoment * betaForVariance) / Math.max(1, nPersons) + 1e-10);
    deviance = -2 * logLikelihood;
    if (deviance < minDeviance) {
      minDeviance = deviance;
      minDifficulty = difficulty.slice();
      minVariance = variance;
      minPosteriorCache = posteriorCache.map((posterior) => posterior.slice());
      minProbabilityCache = probabilities.map((row) => row.slice());
    }
    const maxDifficultyChange = Math.max(...difficulty.map((value, index) => Math.abs(value - oldDifficulty[index])));
    const varianceChange = Math.abs(variance - oldVariance);
    const devianceChange = Number.isFinite(previousDeviance) ? Math.abs(previousDeviance - deviance) : Infinity;

    if (iter % 5 === 0 || iter === 1) {
      onProgress(Math.min(0.94, iter / maxIter), `Iteration ${iter}: max item change ${formatNumber(maxDifficultyChange, 5)}; deviance ${formatNumber(deviance, 2)}.`);
      await nextFrame();
    }
    if (maxDifficultyChange < conv && varianceChange < conv && devianceChange < convD) {
      converged = true;
      onProgress(0.94, `Converged after ${iter} iterations.`);
      return raschFitResult(prepared, nodes, minDifficulty, minVariance, minDeviance, iter, converged, observedCounts, observedScores, minPosteriorCache || posteriorCache, minProbabilityCache);
    }
    previousDeviance = deviance;
  }

  onProgress(0.94, `Reached maximum iterations (${maxIter}).`);
  return raschFitResult(prepared, nodes, minDifficulty, minVariance, minDeviance, maxIter, converged, observedCounts, observedScores, minPosteriorCache || posteriorCache, minProbabilityCache);
}

function raschFitResult(prepared, nodes, difficulty, variance, deviance, iterations, converged, observedCounts, observedScores, posteriorWeights = null, probabilityWeights = null) {
  const posterior = posteriorWeights || raschPosteriorWeights(prepared, nodes, difficulty, variance);
  const probabilities = probabilityWeights || difficulty.map((itemDifficulty) => nodes.map((theta) => logistic(theta - itemDifficulty)));
  const persons = posterior.map((personPosterior, index) => {
    const eap = personPosterior.reduce((total, weight, nodeIndex) => total + weight * nodes[nodeIndex], 0);
    const eap2 = personPosterior.reduce((total, weight, nodeIndex) => total + weight * nodes[nodeIndex] * nodes[nodeIndex], 0);
    return {
      pid: index + 1,
      EAP: eap,
      "SD.EAP": Math.sqrt(Math.max(0, eap2 - eap * eap))
    };
  });
  const items = prepared.columns.map((column, index) => ({
    item: column,
    N: observedCounts[index],
    M: observedCounts[index] ? observedScores[index] / observedCounts[index] : NaN,
    "xsi.item": difficulty[index],
    "AXsi_.Cat1": difficulty[index],
    "B.Cat1.Dim1": 1
  }));
  const wle = tamWlePersons(prepared, difficulty);
  const itemFit = msqItemFit(prepared, nodes, difficulty, posterior, probabilities);
  return {
    items,
    persons,
    wle,
    itemFit,
    nodes,
    difficulty,
    posterior,
    probabilities,
    variance,
    deviance,
    iterations,
    converged
  };
}

function raschPosteriorWeights(prepared, nodes, difficulty, variance) {
  const prior = normalDensityWeights(nodes, variance);
  return prepared.rows.map((row) => {
    const logPosterior = nodes.map((theta, nodeIndex) => {
      let total = Math.log(prior[nodeIndex]);
      row.forEach((value, itemIndex) => {
        if (value === null || value === undefined) return;
        const p = clampProbability(logistic(theta - difficulty[itemIndex]));
        total += value === 1 ? Math.log(p) : Math.log1p(-p);
      });
      return total;
    });
    const logNorm = logSumExp(logPosterior);
    return logPosterior.map((value) => Math.exp(value - logNorm));
  });
}

function tamWlePersons(prepared, difficulty) {
  const maxSteps = 20;
  const convM = 1e-4;
  const rows = prepared.rows || [];
  const scores = rows.map((row) => row.reduce((total, value) => total + (value === null || value === undefined ? 0 : value), 0));
  const maxScores = rows.map((row) => row.reduce((total, value) => total + (value === null || value === undefined ? 0 : 1), 0));
  const theta = scores.map((score, index) => {
    const max = maxScores[index];
    return max > 0 ? Math.log((score + 0.5) / (max - score + 1)) : NaN;
  });
  const oldIncrement = rows.map(() => 3);
  let lastErrorInv = rows.map(() => NaN);

  for (let iter = 0; iter <= maxSteps; iter += 1) {
    let maxIncrement = 0;
    const increments = rows.map((row, personIndex) => {
      if (!Number.isFinite(theta[personIndex]) || maxScores[personIndex] <= 0) return 0;
      let expected = 0;
      let information = 0;
      let warmAdd = 0;
      row.forEach((value, itemIndex) => {
        if (value === null || value === undefined) return;
        const p = clampProbability(logistic(theta[personIndex] - difficulty[itemIndex]));
        const variance = p * (1 - p);
        expected += p;
        information += variance;
        warmAdd += variance * (1 - 2 * p);
      });
      if (information <= 0) {
        lastErrorInv[personIndex] = NaN;
        return 0;
      }
      const errorInv = 1 / information;
      lastErrorInv[personIndex] = Math.abs(errorInv);
      const score = scores[personIndex] - expected + (errorInv * warmAdd) / 2;
      let increment = errorInv * score;
      if (Math.abs(increment) > Math.abs(oldIncrement[personIndex])) {
        const divisor = 2 * Math.ceil(Math.abs(increment) / (Math.abs(oldIncrement[personIndex]) + 1e-10));
        increment /= divisor;
      }
      oldIncrement[personIndex] *= 0.95;
      if (!Number.isFinite(increment)) increment = 0;
      maxIncrement = Math.max(maxIncrement, Math.abs(increment));
      return increment;
    });
    increments.forEach((increment, index) => {
      theta[index] += increment;
    });
    if (maxIncrement < convM) break;
  }

  return rows.map((row, index) => ({
    pid: index + 1,
    "N.items": maxScores[index],
    PersonScores: scores[index],
    PersonMax: maxScores[index],
    theta: maxScores[index] > 0 ? theta[index] : NaN,
    error: maxScores[index] > 0 ? Math.sqrt(lastErrorInv[index]) : NaN
  }));
}

function msqItemFit(prepared, nodes, difficulty, posterior, probabilities = null) {
  return prepared.columns.map((column, itemIndex) => {
    let nObserved = 0;
    let outfitNumerator = 0;
    let outfitQSum = 0;
    let infitNumerator = 0;
    let infitDenominator = 0;
    let infitQSum = 0;

    prepared.rows.forEach((row, personIndex) => {
      const response = row[itemIndex];
      if (response === null || response === undefined) return;
      nObserved += 1;
      let outfitPerson = 0;
      let outfitKurtosis = 0;
      let infitPersonNumerator = 0;
      let infitPersonDenominator = 0;
      let infitKurtosis = 0;
      nodes.forEach((theta, nodeIndex) => {
        const weight = posterior[personIndex]?.[nodeIndex] || 0;
        const p = clampProbability(probabilities?.[itemIndex]?.[nodeIndex] ?? logistic(theta - difficulty[itemIndex]));
        const variance = Math.max(1e-15, p * (1 - p));
        const residualSquared = (response - p) ** 2;
        const kurtosis = (1 - p) * p ** 4 + p * (1 - p) ** 4;
        outfitPerson += weight * residualSquared / variance;
        outfitKurtosis += weight * kurtosis / (variance ** 2);
        infitPersonNumerator += weight * residualSquared;
        infitPersonDenominator += weight * variance;
        infitKurtosis += weight * (kurtosis - variance ** 2);
      });
      outfitNumerator += outfitPerson;
      outfitQSum += outfitKurtosis;
      infitNumerator += infitPersonNumerator;
      infitDenominator += infitPersonDenominator;
      infitQSum += infitKurtosis;
    });

    const outfit = nObserved > 0 ? outfitNumerator / nObserved : NaN;
    const outfitQ = nObserved > 0 ? outfitQSum / (nObserved ** 2) - 1 / nObserved : NaN;
    const outfitT = meanSquareT(outfit, outfitQ);
    const infit = infitDenominator > 0 ? infitNumerator / infitDenominator : NaN;
    const infitQ = infitDenominator > 0 ? infitQSum / (infitDenominator ** 2) : NaN;
    const infitT = meanSquareT(infit, infitQ);
    return {
      item: column,
      fitgroup: itemIndex + 1,
      Outfit: outfit,
      Outfit_t: outfitT,
      Outfit_p: twoSidedNormalP(outfitT),
      Infit: infit,
      Infit_t: infitT,
      Infit_p: twoSidedNormalP(infitT)
    };
  });
}

function meanSquareT(meanSquare, qValue) {
  if (!Number.isFinite(meanSquare) || meanSquare <= 0 || !Number.isFinite(qValue) || qValue <= 0) return NaN;
  const rootQ = Math.sqrt(qValue);
  return (Math.cbrt(meanSquare) - 1) * 3 / rootQ + rootQ / 3;
}

function twoSidedNormalP(value) {
  if (!Number.isFinite(value)) return NaN;
  return 2 * normalCdf(-Math.abs(value));
}

function normalCdf(value) {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

function trimTamHalfIncrement(increment, previousIncrement) {
  const eps = 1e-10;
  const absPrevious = Math.abs(previousIncrement);
  const absIncrement = Math.abs(increment);
  if (absIncrement <= absPrevious) return increment;
  const divisor = 2 * Math.ceil(absIncrement / (absPrevious + eps));
  return increment / divisor;
}

function approximateItemSe(difficulty, count, variance) {
  if (!count) return NaN;
  const nodes = Array.from({ length: 21 }, (_, index) => -6 + index * 0.6);
  const weights = normalisedNormalWeights(nodes, variance);
  const information = nodes.reduce((total, theta, index) => {
    const p = logistic(theta - difficulty);
    return total + weights[index] * p * (1 - p);
  }, 0) * count;
  return information > 0 ? Math.sqrt(1 / information) : NaN;
}

function raschFilesForFit(prefix, prepared, fit) {
  const itemRows = fit.items.map((row) => raschRoundedRow(row));
  const personRows = fit.persons.map((row) => raschRoundedRow(row));
  const thetaRows = fit.wle.map((row) => ({ x: round(row.theta, 12) }));
  const errorRows = fit.wle.map((row) => ({ x: round(row.error, 12) }));
  const fitRows = fit.itemFit.map((row) => raschRoundedRow(row));
  const matrixRows = matrixRowsForCsv(prepared);
  const summaryText = [
    "Browser 1PL MML Rasch Analysis",
    "",
    `Matrix: ${prefix}`,
    `Rows: ${prepared.rows.length}`,
    `Items: ${prepared.columns.length}`,
    `Iterations: ${fit.iterations}`,
    `Converged: ${fit.converged ? "yes" : "no"}`,
    `Deviance: ${formatNumber(fit.deviance, 4)}`,
    `Latent variance: ${formatNumber(fit.variance, 6)}`,
    "",
    "Target compatibility: TAM::tam.mml(resp = response), dichotomous 1PL use case.",
    "This browser implementation estimates item difficulties and EAP person locations with fixed quadrature nodes from -6 to 6.",
    "WLE theta/error files use a JavaScript port of TAM::tam.wle for this dichotomous 1PL use case.",
    "The no-simulation item-fit file uses a JavaScript port of TAM::msq.itemfit for this dichotomous 1PL use case.",
    "The simulation-based TAM::tam.fit item-fit file is not generated by the browser version because TAM's simulation/RNG path is not reproduced here."
  ].join("\n");
  return [
    createRaschOutputFile(`${prefix}_item.csv`, "text/csv", rowsToCsv(itemRows, Object.keys(itemRows[0] || {}))),
    createRaschOutputFile(`${prefix}_person_EAP.csv`, "text/csv", rowsToCsv(personRows, Object.keys(personRows[0] || {}))),
    createRaschOutputFile(`${prefix}_model_summary.txt`, "text/plain", summaryText),
    createRaschOutputFile(`${prefix}_item_fit_with_no_simulation.csv`, "text/csv", rowsToCsv(fitRows, Object.keys(fitRows[0] || {}))),
    createRaschOutputFile(`${prefix}_person_statistics_WLE_theta.csv`, "text/csv", rowsToCsv(thetaRows, ["x"])),
    createRaschOutputFile(`${prefix}_person_statistics_WLE_error.csv`, "text/csv", rowsToCsv(errorRows, ["x"])),
    createRaschOutputFile(`${prefix}_scores.csv`, "text/csv", rowsToCsv(matrixRows, prepared.columns)),
    createRaschOutputFile(`${prefix}_wright_map.png`, "image/png", transparentPngBytes())
  ];
}

function raschRoundedRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    typeof value === "number" && Number.isFinite(value) ? round(value, 12) : value
  ]));
}

function matrixRowsForCsv(prepared) {
  return prepared.rows.map((row) => Object.fromEntries(prepared.columns.map((column, index) => [column, row[index] ?? ""])));
}

function createRaschOutputFile(name, mime, content) {
  const blob = content instanceof Uint8Array
    ? new Blob([content], { type: mime })
    : new Blob([String(content ?? "")], { type: mime });
  return {
    name,
    url: URL.createObjectURL(blob),
    bytes: blob.size
  };
}

function transparentPngBytes() {
  const binary = atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lL9W4wAAAABJRU5ErkJggg==");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function normalisedNormalWeights(nodes, variance) {
  const densities = normalDensityWeights(nodes, variance);
  const total = densities.reduce((sum, value) => sum + value, 0);
  return densities.map((value) => value / total);
}

function normalDensityWeights(nodes, variance) {
  const sd = Math.sqrt(Math.max(1e-6, variance));
  const normalisingConstant = sd * Math.sqrt(2 * Math.PI);
  return nodes.map((theta) => Math.exp(-0.5 * (theta / sd) ** 2) / normalisingConstant);
}

function logistic(value) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function clampProbability(value) {
  return Math.max(1e-12, Math.min(1 - 1e-12, value));
}

function logSumExp(values) {
  const max = Math.max(...values);
  const sum = values.reduce((total, value) => total + Math.exp(value - max), 0);
  return max + Math.log(sum);
}

function timestampId() {
  const now = new Date();
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
    "_",
    Math.random().toString(16).slice(2, 10)
  ].join("");
}

async function buildCurriculumGroups() {
  const result = await runRSourceAnalysis("curriculum");
  applyAnalysisResult(result);
  renderAll();
  return;

  if (!state.implied) return;
  const groups = [...new Set(state.km.nodes.map((node) => node.curriculumGroup || "Ungrouped"))].sort();
  const questionIndexesByGroup = Object.fromEntries(groups.map((group) => [group, []]));
  state.km.nodes.forEach((node, index) => {
    questionIndexesByGroup[node.curriculumGroup || "Ungrouped"].push(index);
  });

  const studentRows = state.implied.rows.map((row) => {
    const out = {
      rowKey: row.rowKey,
      username: row.username,
      numDirectScoreQuestions: row.numDirectScoreQuestions,
      numImpliedScoreQuestions: row.numImpliedScoreQuestions,
      TOTAL_CORRECT: row.impliedScores.filter((score) => score === 1).length
    };
    groups.forEach((group) => {
      const indexes = questionIndexesByGroup[group];
      const correct = indexes.filter((index) => row.impliedScores[index] === 1).length;
      const missing = indexes.filter((index) => row.impliedScores[index] === null).length;
      out[`${group}_TOTAL`] = indexes.length;
      out[`${group}_NA`] = missing;
      out[`${group}_CORRECT`] = correct;
      out[`${group}_PROP_CORRECT`] = missing === indexes.length ? null : round(correct / indexes.length, 4);
    });
    return out;
  });

  const groupRows = groups.map((group) => {
    const pctKey = `${group}_PROP_CORRECT`;
    const correctKey = `${group}_CORRECT`;
    const pcts = studentRows.map((row) => row[pctKey]).filter((value) => value !== null);
    const correctCounts = studentRows.map((row) => row[correctKey]).filter((value) => value !== null);
    return {
      group,
      question_count: questionIndexesByGroup[group].length,
      students_with_data: pcts.length,
      mean_percent_correct: pcts.length ? round(mean(pcts), 4) : "",
      mean_correct_count: correctCounts.length ? round(mean(correctCounts), 3) : ""
    };
  });

  const pctValues = groupRows.map((row) => row.mean_percent_correct).filter((value) => value !== "");
  state.curriculum = {
    groups,
    groupRows,
    studentRows,
    studentColumns: ["rowKey", "username", "numDirectScoreQuestions", "numImpliedScoreQuestions", "TOTAL_CORRECT"].concat(groups.map((group) => `${group}_PROP_CORRECT`)),
    overallMean: pctValues.length ? mean(pctValues.map(Number)) : 0,
    totalCorrectMean: mean(studentRows.map((row) => row.TOTAL_CORRECT))
  };
}

function compareKnowledgeMaps(km, gexf) {
  const kmLabels = km.nodes.map((node) => node.topicName);
  const gexfLabels = gexf.nodes.map((node) => node.label);
  const kmSet = new Set(kmLabels);
  const gexfSet = new Set(gexfLabels);
  const kmRawEdges = km.edges.map((edge) => ({ source: edge.sourceTopic, target: edge.targetTopic }));
  const gexfRawEdges = gexf.edges.map((edge) => ({ source: edge.source, target: edge.target }));
  const orientation = bestValidationOrientation(kmRawEdges, gexfRawEdges);
  const kmEdges = edgeSet(orientation.kmEdges);
  const gexfEdges = edgeSet(orientation.gexfEdges);

  const nodesMissingInGexf = kmLabels.filter((label) => !gexfSet.has(label));
  const nodesExtraInGexf = gexfLabels.filter((label) => !kmSet.has(label));
  const edgesMissingInGexf = [...kmEdges]
    .filter((key) => !gexfEdges.has(key))
    .map(splitEdgeKey);
  const edgesExtraInGexf = [...gexfEdges]
    .filter((key) => !kmEdges.has(key))
    .map(splitEdgeKey);

  return {
    matchingNodes: kmLabels.filter((label) => gexfSet.has(label)).length,
    nodesMissingInGexf,
    nodesExtraInGexf,
    edgesMissingInGexf,
    edgesExtraInGexf,
    edgeDiscrepancies: edgesMissingInGexf.length + edgesExtraInGexf.length,
    orientation: orientation.label,
    topicNeighbourRows: topicNeighbourComparison(kmLabels, [...kmEdges].map(splitEdgeKey), [...gexfEdges].map(splitEdgeKey))
  };
}

function bestValidationOrientation(kmEdges, gexfEdges) {
  const candidates = [
    {
      label: "Compared app KM edges as displayed against staged GEXF edges as encoded.",
      kmEdges,
      gexfEdges
    },
    {
      label: "Compared app KM edges as displayed against staged GEXF edges reversed into the app KM direction.",
      kmEdges,
      gexfEdges: reverseEdgeRows(gexfEdges)
    },
    {
      label: "Compared in-house/app KM edges reversed against staged GEXF edges as encoded.",
      kmEdges: reverseEdgeRows(kmEdges),
      gexfEdges
    },
    {
      label: "Compared both app KM and staged GEXF edges reversed. This preserves agreement but reverses the encoded directions for checking.",
      kmEdges: reverseEdgeRows(kmEdges),
      gexfEdges: reverseEdgeRows(gexfEdges)
    }
  ];
  candidates.forEach((candidate) => {
    const kmSet = edgeSet(candidate.kmEdges);
    const gexfSet = edgeSet(candidate.gexfEdges);
    candidate.matches = [...kmSet].filter((key) => gexfSet.has(key)).length;
    candidate.discrepancies = [...kmSet].filter((key) => !gexfSet.has(key)).length
      + [...gexfSet].filter((key) => !kmSet.has(key)).length;
  });
  return candidates.sort((a, b) => {
    if (a.discrepancies !== b.discrepancies) return a.discrepancies - b.discrepancies;
    return b.matches - a.matches;
  })[0];
}

function reverseEdgeRows(edges) {
  return edges.map((edge) => ({ source: edge.target, target: edge.source }));
}

function edgeSet(edges) {
  return new Set(edges.map((edge) => edgeKey(edge.source, edge.target)));
}

function topicNeighbourComparison(labels, kmEdges, gexfEdges) {
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b)).map((label) => {
    const kmIn = sortedUnique(kmEdges.filter((edge) => edge.target === label).map((edge) => edge.source));
    const kmOut = sortedUnique(kmEdges.filter((edge) => edge.source === label).map((edge) => edge.target));
    const gexfIn = sortedUnique(gexfEdges.filter((edge) => edge.target === label).map((edge) => edge.source));
    const gexfOut = sortedUnique(gexfEdges.filter((edge) => edge.source === label).map((edge) => edge.target));
    const inMissing = setDifference(kmIn, gexfIn);
    const inExtra = setDifference(gexfIn, kmIn);
    const outMissing = setDifference(kmOut, gexfOut);
    const outExtra = setDifference(gexfOut, kmOut);
    return {
      topic: label,
      all_neighbour_sets_match: !inMissing.length && !inExtra.length && !outMissing.length && !outExtra.length ? "yes" : "no",
      km_in_nodes: collapseSet(kmIn),
      gexf_in_nodes: collapseSet(gexfIn),
      in_nodes_missing_from_gexf: collapseSet(inMissing),
      in_nodes_extra_in_gexf: collapseSet(inExtra),
      km_out_nodes: collapseSet(kmOut),
      gexf_out_nodes: collapseSet(gexfOut),
      out_nodes_missing_from_gexf: collapseSet(outMissing),
      out_nodes_extra_in_gexf: collapseSet(outExtra)
    };
  });
}

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function setDifference(a, b) {
  const other = new Set(b);
  return a.filter((value) => !other.has(value));
}

function collapseSet(values) {
  return values.length ? values.join("; ") : "";
}

function graphBlock(km, options = {}) {
  const frame = el("div", { class: options.small ? "graph-frame small" : "graph-frame" });
  drawGraph(frame, km, options);
  const searchable = options.interactive !== false && (
    options.showSearch === true ||
    (options.showSearch !== false && !options.statusById)
  );
  return el("div", { class: "graph-shell", "data-searchable-km": searchable ? "true" : null }, [
    graphToolbar(km, { ...options, searchable }),
    frame
  ]);
}

function drawGraph(frame, km, options = {}) {
  const layout = layoutGraph(km.nodes, km.edges, options);
  const hatchPatternForwardId = `km-implied-correct-hatch-forward-${++graphPatternCounter}`;
  const hatchPatternBackwardId = `km-implied-correct-hatch-backward-${graphPatternCounter}`;
  const svg = svgEl("svg", {
    class: "km-svg",
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    role: "img",
    "aria-label": "Knowledge map graph"
  });
  svg.appendChild(svgEl("defs", {}, [
    svgEl("pattern", {
      id: hatchPatternForwardId,
      patternUnits: "userSpaceOnUse",
      width: "12",
      height: "12"
    }, [
      svgEl("path", {
        d: "M -3 3 L 3 -3 M 0 12 L 12 0 M 9 15 L 15 9",
        stroke: "#18805f",
        "stroke-width": "0.7",
        "stroke-opacity": "0.46",
        "stroke-linecap": "butt",
        fill: "none"
      })
    ]),
    svgEl("pattern", {
      id: hatchPatternBackwardId,
      patternUnits: "userSpaceOnUse",
      width: "12",
      height: "12"
    }, [
      svgEl("path", {
        d: "M -3 9 L 3 15 M 0 0 L 12 12 M 9 -3 L 15 3",
        stroke: "#18805f",
        "stroke-width": "0.7",
        "stroke-opacity": "0.46",
        "stroke-linecap": "butt",
        fill: "none"
      })
    ])
  ]));
  const selectedId = options.activeId || state.kmSelectedNodeId || "";
  const connectedIds = selectedId ? immediateConnectedIds(selectedId, km) : new Set();
  const statusIds = new Set(Object.keys(options.statusById || {}));
  const edgeStatusByKey = options.edgeStatusByKey || {};
  const searchQuery = normaliseGraphSearch(state.kmSearchQuery);
  const searchMatchIds = searchQuery ? matchingGraphNodeIds(km, searchQuery) : new Set();
  const visibleGroups = selectedId || searchQuery || statusIds.size ? new Set(km.groups) : visibleGroupSet(km);
  const shownByGroup = (node) => visibleGroups.has(node.curriculumGroup || "Ungrouped");
  const groupColour = groupColourMap(km.groups);

  const edgeLayer = svgEl("g");
  km.edges.forEach((edge) => {
    const source = layout.byId[edge.source];
    const target = layout.byId[edge.target];
    if (!source || !target) return;
    const sourceNode = km.nodes[Number(edge.source) - 1];
    const targetNode = km.nodes[Number(edge.target) - 1];
    const trackerEdgeStatus = edgeStatusByKey[edgeKey(edge.source, edge.target)] || "";
    const highlighted = Boolean(trackerEdgeStatus) || (selectedId && (edge.source === selectedId || edge.target === selectedId));
    const searchHighlighted = searchQuery && (searchMatchIds.has(edge.source) || searchMatchIds.has(edge.target));
    const directionClass = selectedId && edge.source === selectedId ? "is-outgoing" : (selectedId && edge.target === selectedId ? "is-incoming" : "");
    const dimmed = (!shownByGroup(sourceNode) || !shownByGroup(targetNode))
      || (options.focusStatusOnly && statusIds.size)
      || (selectedId && !highlighted)
      || (searchQuery && !searchHighlighted && !highlighted);
    const sourcePad = (edge.source === selectedId || statusIds.has(edge.source)) ? KM_NODE_ACTIVE_BORDER_WIDTH / 2 + 3 : KM_NODE_BORDER_WIDTH / 2 + 2;
    const targetPad = (edge.target === selectedId || statusIds.has(edge.target)) ? KM_NODE_ACTIVE_BORDER_WIDTH / 2 + 3 : KM_NODE_BORDER_WIDTH / 2 + 2;
    const geometry = edgeGeometry(source, target, layout, sourcePad, targetPad);
    const edgeClasses = ["km-edge", highlighted ? "is-highlighted" : "", trackerEdgeStatus, searchHighlighted ? "is-search-highlighted" : "", directionClass, dimmed ? "is-dimmed" : ""].filter(Boolean).join(" ");
    edgeLayer.appendChild(svgEl("path", {
      class: edgeClasses,
      d: geometry.path
    }));
    edgeLayer.appendChild(svgEl("polygon", {
      class: `km-arrowhead ${edgeClasses}`,
      points: arrowHeadPoints(geometry, highlighted ? 20 : 12, highlighted ? 16 : 9)
    }));
  });
  svg.appendChild(edgeLayer);

  const nodeLayer = svgEl("g");
  km.nodes.forEach((node) => {
    const point = layout.byId[node.id];
    const status = options.statusById?.[node.id] || "";
    const classes = ["km-node"];
    if (status) classes.push(status);
    const isActive = selectedId === node.id;
    const isConnected = connectedIds.has(node.id);
    const isSearchMatch = searchQuery && searchMatchIds.has(node.id);
    const hasStatus = statusIds.has(node.id);
    const dimmed = !shownByGroup(node)
      || (options.focusStatusOnly && statusIds.size && !hasStatus)
      || (selectedId && !isActive && !isConnected && !hasStatus)
      || (searchQuery && !isSearchMatch && !isActive && !isConnected && !hasStatus);
    if (isActive) classes.push("is-active");
    if (isConnected) classes.push("is-connected");
    if (isSearchMatch) classes.push("is-search-match");
    if (dimmed) classes.push("is-dimmed");
    const group = svgEl("g", {
      class: classes.join(" "),
      transform: `translate(${point.x - (layout.nodeWidth / 2)}, ${point.y - (layout.nodeHeight / 2)})`
    });
    if (isActive) {
      group.appendChild(svgEl("rect", {
        class: "km-node-halo",
        x: "-12",
        y: "-12",
        width: String(layout.nodeWidth + 24),
        height: String(layout.nodeHeight + 24),
        rx: "14",
        fill: "none"
      }));
    }
    const groupColor = groupColour[node.curriculumGroup || "Ungrouped"] || "#7a8a96";
    group.appendChild(svgEl("rect", {
      class: "km-node-main",
      width: String(layout.nodeWidth),
      height: String(layout.nodeHeight),
      rx: "8",
      fill: colourWithAlpha(groupColor, 0.2),
      stroke: groupColor
    }));
    if (status === "implied-correct" || status === "implied-correct-indirect") {
      group.appendChild(svgEl("rect", {
        class: "km-node-hash",
        width: String(layout.nodeWidth),
        height: String(layout.nodeHeight),
        rx: "8",
        fill: `url(#${hatchPatternForwardId})`
      }));
      group.appendChild(svgEl("rect", {
        class: "km-node-hash",
        width: String(layout.nodeWidth),
        height: String(layout.nodeHeight),
        rx: "8",
        fill: `url(#${hatchPatternBackwardId})`
      }));
    }
    group.appendChild(svgEl("title", {}, [nodeTooltip(node, km)]));
    const topicLines = wrapGraphLabel(`Q${node.id} ${node.topicName}`, 28, 3);
    topicLines.forEach((line, index) => {
      group.appendChild(svgEl("text", {
        class: "km-node-topic",
        x: "14",
        y: String(20 + (index * 15))
      }, [line]));
    });
    group.appendChild(svgEl("text", {
      class: "km-node-group-label",
      x: "14",
      y: String(layout.nodeHeight - 13)
    }, [truncate(node.curriculumGroup || "Ungrouped", 32)]));
    if (options.interactive !== false) {
      group.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        event.preventDefault();
      });
      group.addEventListener("click", (event) => {
        event.stopPropagation();
        const selecting = state.kmSelectedNodeId !== node.id;
        state.kmSelectedNodeId = selecting ? node.id : "";
        if (selecting) {
          state.kmSearchQuery = "";
          state.kmVisibleGroups = [];
          clearTrackerStatusFilters();
        }
        refreshGraphViews();
      });
    }
    nodeLayer.appendChild(group);
  });
  svg.appendChild(nodeLayer);
  svg.addEventListener("click", () => {
    if (svg.dataset.suppressClick === "true") return;
    if (state.kmSelectedNodeId) {
      state.kmSelectedNodeId = "";
      refreshGraphViews();
    }
  });

  enablePanZoom(svg, layout.width, layout.height);
  frame.replaceChildren(svg);
}

function immediateConnectedIds(id, km) {
  const ids = new Set();
  km.edges.forEach((edge) => {
    if (edge.source === id) ids.add(edge.target);
    if (edge.target === id) ids.add(edge.source);
  });
  return ids;
}

function immediateNeighbourIds(id, km) {
  const out = km.reachability?.outAdj?.[id] || km.edges.filter((edge) => edge.source === id).map((edge) => edge.target);
  const incoming = km.reachability?.inAdj?.[id] || km.edges.filter((edge) => edge.target === id).map((edge) => edge.source);
  return { in: incoming, out };
}

function edgeKey(source, target) {
  return `${source}->${target}`;
}

function nodeTooltip(node, km) {
  const neighbours = immediateNeighbourIds(node.id, km);
  return [
    `Topic name: ${node.topicName || "not available"}`,
    `Question name: ${node.questionName || "not available"}`,
    `Topic number: ${node.id || "not available"}`,
    `Curriculum group: ${node.curriculumGroup || "Ungrouped"}`,
    `In-nodes: ${neighbours.in.length}`,
    `Out-nodes: ${neighbours.out.length}`
  ].join("\n");
}

function wrapGraphLabel(value, maxLength = 28, maxLines = 3) {
  const words = String(value ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = `${line} ${word}`.trim();
    if (candidate.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = truncate(kept[maxLines - 1], Math.max(8, maxLength - 2));
  return kept;
}

function refreshGraphViews(options = {}) {
  const preserveScroll = options.preserveScroll !== false;
  const scrollTop = window.scrollY;
  const scrollLeft = window.scrollX;
  const trackerActive = document.getElementById("trackerTab")?.classList.contains("is-active");
  if (preserveScroll && trackerActive) {
    state.tracker.windowScrollY = scrollTop;
  }
  renderKnowledgeMap();
  if (trackerActive) {
    renderTracker();
  }
  const modal = document.getElementById("graphModal");
  if (!modal.hidden && state.km) {
    document.getElementById("graphModalHost").replaceChildren(graphBlock(state.km));
  }
  if (preserveScroll) restoreWindowScroll(scrollLeft, scrollTop);
}

function restoreWindowScroll(scrollLeft, scrollTop) {
  window.scrollTo({ top: scrollTop, left: scrollLeft });
  requestAnimationFrame(() => {
    window.scrollTo({ top: scrollTop, left: scrollLeft });
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollTop, left: scrollLeft });
    });
  });
}

function edgeGeometry(source, target, layout, sourcePad = KM_NODE_BORDER_WIDTH / 2, targetPad = KM_NODE_BORDER_WIDTH / 2) {
  const start = rectangleBoundaryPoint(source, target, layout.nodeWidth, layout.nodeHeight, sourcePad);
  const end = rectangleBoundaryPoint(target, source, layout.nodeWidth, layout.nodeHeight, targetPad);
  const startX = start.x;
  const startY = start.y;
  const endX = end.x;
  const endY = end.y;
  const forward = endX >= startX;
  const direction = forward ? 1 : -1;
  const curve = Math.max(45, Math.abs(endX - startX) * 0.38);
  const c1x = startX + direction * curve;
  const c1y = startY;
  const c2x = endX - direction * curve;
  const c2y = endY;
  return {
    startX,
    startY,
    c1x,
    c1y,
    c2x,
    c2y,
    endX,
    endY,
    path: `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`
  };
}

function edgePath(source, target, layout, sourcePad = KM_NODE_BORDER_WIDTH / 2, targetPad = KM_NODE_BORDER_WIDTH / 2) {
  return edgeGeometry(source, target, layout, sourcePad, targetPad).path;
}

function rectangleBoundaryPoint(from, to, nodeWidth, nodeHeight, pad = 0) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return { x: from.x, y: from.y };
  const halfWidth = (nodeWidth / 2) + pad;
  const halfHeight = (nodeHeight / 2) + pad;
  const xScale = dx === 0 ? Infinity : halfWidth / Math.abs(dx);
  const yScale = dy === 0 ? Infinity : halfHeight / Math.abs(dy);
  const scale = Math.min(xScale, yScale);
  return {
    x: from.x + dx * scale,
    y: from.y + dy * scale
  };
}

function arrowHeadPoints(geometry, length, width) {
  const beforeTip = cubicPoint(geometry, 0.985);
  const vx = geometry.endX - beforeTip.x;
  const vy = geometry.endY - beforeTip.y;
  const magnitude = Math.hypot(vx, vy) || 1;
  const ux = vx / magnitude;
  const uy = vy / magnitude;
  const px = -uy;
  const py = ux;
  const baseX = geometry.endX - ux * length;
  const baseY = geometry.endY - uy * length;
  const halfWidth = width / 2;
  return [
    `${round(geometry.endX, 2)},${round(geometry.endY, 2)}`,
    `${round(baseX + px * halfWidth, 2)},${round(baseY + py * halfWidth, 2)}`,
    `${round(baseX - px * halfWidth, 2)},${round(baseY - py * halfWidth, 2)}`
  ].join(" ");
}

function cubicPoint(geometry, t) {
  const mt = 1 - t;
  const x = (mt ** 3 * geometry.startX)
    + (3 * mt ** 2 * t * geometry.c1x)
    + (3 * mt * t ** 2 * geometry.c2x)
    + (t ** 3 * geometry.endX);
  const y = (mt ** 3 * geometry.startY)
    + (3 * mt ** 2 * t * geometry.c1y)
    + (3 * mt * t ** 2 * geometry.c2y)
    + (t ** 3 * geometry.endY);
  return { x, y };
}

function layoutGraph(nodes, edges, options = {}) {
  const mode = options.layoutMode || state.kmLayoutMode || "default";
  const metrics = graphLayoutMetrics(mode);
  const indegree = Object.fromEntries(nodes.map((node) => [node.id, 0]));
  const outgoing = Object.fromEntries(nodes.map((node) => [node.id, []]));
  const incoming = Object.fromEntries(nodes.map((node) => [node.id, []]));
  edges.forEach((edge) => {
    indegree[edge.target] = (indegree[edge.target] || 0) + 1;
    outgoing[edge.source].push(edge.target);
    incoming[edge.target].push(edge.source);
  });

  const queue = nodes.filter((node) => indegree[node.id] === 0).map((node) => node.id);
  const levels = Object.fromEntries(nodes.map((node) => [node.id, 0]));
  const seen = new Set();
  while (queue.length) {
    const id = queue.shift();
    seen.add(id);
    outgoing[id].forEach((target) => {
      levels[target] = Math.max(levels[target], levels[id] + 1);
      indegree[target] -= 1;
      if (indegree[target] === 0) queue.push(target);
    });
  }
  nodes.forEach((node, index) => {
    if (!seen.has(node.id)) levels[node.id] = index % 12;
  });

  const buckets = {};
  nodes.forEach((node) => {
    const level = levels[node.id] || 0;
    if (!buckets[level]) buckets[level] = [];
    buckets[level].push(node);
  });

  const maxLevel = Math.max(...Object.keys(buckets).map(Number), 0);
  const maxBucket = Math.max(...Object.values(buckets).map((bucket) => bucket.length), 1);
  const width = Math.max(metrics.minWidth, metrics.marginX * 2 + KM_NODE_WIDTH + (maxLevel * metrics.levelGap));
  const height = Math.max(metrics.minHeight, metrics.marginY * 2 + maxBucket * metrics.rowGap);
  const byId = {};
  const orderById = {};
  Object.entries(buckets)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([levelText, bucket]) => {
    const level = Number(levelText);
    bucket.sort((a, b) => {
      if (mode === "optimised") {
        const aScore = parentOrderScore(a.id, incoming, orderById);
        const bScore = parentOrderScore(b.id, incoming, orderById);
        if (aScore !== bScore) return aScore - bScore;
      }
      return a.topicName.localeCompare(b.topicName);
    });
    const gap = height / (bucket.length + 1);
    bucket.forEach((node, index) => {
      orderById[node.id] = index;
      byId[node.id] = {
        x: metrics.marginX + (KM_NODE_WIDTH / 2) + level * metrics.levelGap,
        y: Math.round(gap * (index + 1))
      };
    });
  });
  return { width, height, byId, nodeWidth: KM_NODE_WIDTH, nodeHeight: KM_NODE_HEIGHT, mode };
}

function graphLayoutMetrics(mode) {
  if (mode === "optimised") {
    return { levelGap: 350, rowGap: 112, marginX: 80, marginY: 64, minWidth: 1320, minHeight: 760 };
  }
  return { levelGap: 270, rowGap: 94, marginX: 72, marginY: 56, minWidth: 1160, minHeight: 660 };
}

function parentOrderScore(id, incoming, orderById) {
  const parents = (incoming[id] || []).filter((parentId) => orderById[parentId] !== undefined);
  if (!parents.length) return Number.MAX_SAFE_INTEGER;
  return parents.reduce((sum, parentId) => sum + orderById[parentId], 0) / parents.length;
}

function graphToolbar(km, options = {}) {
  const controls = [];
  if (options.searchable) controls.push(graphSearchControl(options));
  controls.push(graphLayoutToggle());
  if (options.trackerStatusControls) controls.push(trackerStatusFilterControls(options.trackerRow));
  return el("div", { class: "graph-toolbar" }, [
    graphLegend(km, options),
    el("div", { class: "graph-toolbar-controls" }, controls)
  ]);
}

function graphSearchControl(options = {}) {
  const node = input("search", state.kmSearchQuery || "", (value) => {
    state.kmSearchQuery = value;
    state.kmSelectedNodeId = "";
    state.kmVisibleGroups = [];
    clearTrackerStatusFilters();
    syncGraphSearchInputs(node);
    if (options.redrawCurrentOnly) {
      redrawGraphNearSearchInput(node, options);
    } else {
      redrawSearchableGraphFrames();
    }
  }, {
    class: "graph-search-input",
    placeholder: "Search topic or question",
    "aria-label": "Search topic or question"
  });
  return node;
}

function redrawGraphNearSearchInput(inputNode, options = {}) {
  const frame = inputNode.closest(".graph-shell")?.querySelector(".graph-frame");
  if (frame && state.km) drawGraph(frame, state.km, options);
}

function syncGraphSearchInputs(activeInput) {
  document.querySelectorAll(".graph-search-input").forEach((node) => {
    if (node !== activeInput && node.value !== state.kmSearchQuery) {
      node.value = state.kmSearchQuery || "";
    }
  });
}

function redrawSearchableGraphFrames() {
  if (!state.km) return;
  document.querySelectorAll(".graph-shell[data-searchable-km='true'] .graph-frame").forEach((frame) => {
    if (frame.closest("#trackerTab")) return;
    drawGraph(frame, state.km, { small: frame.classList.contains("small") });
  });
}

function graphLegend(km, options = {}) {
  const colour = groupColourMap(km.groups);
  const selectedGroups = selectedLegendGroups();
  const interactionLocked = graphInteractionLocked(options);
  const trackerOverrideActive = options.trackerStatusControls && selectedTrackerStatusFilters().size > 0;
  const allActive = selectedGroups.size === 0 && !interactionLocked && !trackerOverrideActive;
  const buttons = [
    legendButton("All", "#ffffff", allActive, () => {
      state.kmSelectedNodeId = "";
      state.kmSearchQuery = "";
      state.kmVisibleGroups = [];
      clearTrackerStatusFilters();
      refreshGraphViews();
    })
  ];
  km.groups.forEach((group) => {
    buttons.push(legendButton(group || "Ungrouped", colour[group], selectedGroups.has(group), () => {
      if (graphInteractionLocked(options)) return;
      state.kmSelectedNodeId = "";
      state.kmSearchQuery = "";
      clearTrackerStatusFilters();
      toggleVisibleGroup(group, km);
      refreshGraphViews();
    }, {
      disabled: interactionLocked,
      title: interactionLocked ? "Click All or Reset view before filtering by curriculum group." : ""
    }));
  });
  return el("div", { class: "legend" }, buttons);
}

function trackerStatusFilterControls(row) {
  const selected = selectedTrackerStatusFilters();
  const finalStatuses = row ? simulateTrackerFinalState(row).statusById : {};
  const counts = trackerStatusCounts({
    ...finalStatuses,
    ...notExaminedStatusMap(row)
  });
  const items = [
    ["direct-correct", "Direct correct", counts.directCorrect],
    ["direct-incorrect", "Direct incorrect", counts.directIncorrect],
    ["implied-correct", "Implied correct", counts.impliedCorrect],
    ["implied-incorrect", "Implied incorrect", counts.impliedIncorrect],
    ["not-examined", "Not examined", counts.notExamined]
  ];
  return el("div", { class: "tracker-status-filter-group", role: "group", "aria-label": "Attempt tracker status filters" }, items.map(([status, label, count]) => {
    const active = selected.has(status);
    const button = el("button", {
      class: `tracker-status-filter-button tracker-key-item ${status} ${active ? "is-active" : ""}`,
      type: "button",
      "aria-pressed": active ? "true" : "false",
      title: `${label}: ${count}`
    }, [
      el("span", { class: "tracker-key-swatch" }),
      el("span", {}, label)
    ]);
    button.addEventListener("click", () => toggleTrackerStatusFilter(status));
    return button;
  }));
}

function notExaminedStatusMap(row) {
  const statusById = {};
  if (!row) return statusById;
  const directScores = row.directScores || [];
  const impliedScores = row.impliedScores || [];
  const questionCount = state.km?.nodes?.length || Math.max(directScores.length, impliedScores.length);
  for (let index = 0; index < questionCount; index += 1) {
    if (!hasDirectScore(directScores[index]) && !hasDirectScore(impliedScores[index])) {
      statusById[String(index + 1)] = "not-examined";
    }
  }
  return statusById;
}

function graphInteractionLocked(options = {}) {
  return Boolean(state.kmSelectedNodeId || normaliseGraphSearch(state.kmSearchQuery) || options.activeId);
}

function graphLayoutToggle() {
  return el("div", { class: "layout-toggle", role: "group", "aria-label": "Knowledge map spacing" }, [
    layoutToggleButton("Default spacing", "default"),
    layoutToggleButton("Optimised spacing", "optimised"),
    graphResetButton()
  ]);
}

function layoutToggleButton(label, mode) {
  const active = (state.kmLayoutMode || "default") === mode;
  const button = el("button", {
    class: active ? "layout-toggle-button is-active" : "layout-toggle-button",
    type: "button",
    "aria-pressed": active ? "true" : "false"
  }, label);
  button.addEventListener("click", () => {
    state.kmLayoutMode = mode;
    refreshGraphViews();
  });
  return button;
}

function graphResetButton() {
  const button = el("button", {
    class: "layout-toggle-button reset-view-button",
    type: "button"
  }, "Reset view");
  button.addEventListener("click", () => {
    state.kmSelectedNodeId = "";
    state.kmSearchQuery = "";
    state.kmVisibleGroups = [];
    state.kmLayoutMode = "default";
    state.tracker.step = 0;
    state.tracker.finalState = false;
    clearTrackerStatusFilters();
    refreshGraphViews();
  });
  return button;
}

function visibleGroupSet(km) {
  const selected = selectedLegendGroups();
  return new Set(selected.size === 0 ? km.groups : [...selected]);
}

function selectedLegendGroups() {
  return new Set(Array.isArray(state.kmVisibleGroups) ? state.kmVisibleGroups : []);
}

function toggleVisibleGroup(group, km) {
  const selected = selectedLegendGroups();
  if (selected.has(group)) selected.delete(group);
  else selected.add(group);
  state.kmVisibleGroups = [...selected];
}

function normaliseGraphSearch(value) {
  return cleanLabel(value).toLowerCase();
}

function matchingGraphNodeIds(km, query) {
  const ids = new Set();
  km.nodes.forEach((node) => {
    const haystack = [
      node.topicName,
      node.questionName,
      node.id,
      `q${node.id}`
    ].map(normaliseGraphSearch).join(" ");
    if (haystack.includes(query)) ids.add(node.id);
  });
  return ids;
}

function legendButton(label, colour, active, onClick, options = {}) {
  const button = el("button", {
    class: [
      "legend-item legend-button",
      active ? "is-active" : "",
      options.disabled ? "is-disabled" : ""
    ].filter(Boolean).join(" "),
    type: "button",
    disabled: Boolean(options.disabled),
    title: options.title || ""
  }, [
    el("span", { class: "swatch", style: `background:${colour}` }),
    label
  ]);
  if (!options.disabled) button.addEventListener("click", onClick);
  return button;
}

function enablePanZoom(svg, width, height) {
  let viewBox = { x: 0, y: 0, width, height };
  let dragging = false;
  let moved = false;
  let start = null;
  const apply = () => svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
  const reset = () => {
    viewBox = { x: 0, y: 0, width, height };
    apply();
  };
  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    const scale = event.deltaY > 0 ? 1.12 : 0.88;
    const rect = svg.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const newWidth = Math.max(420, Math.min(width * 1.2, viewBox.width * scale));
    const newHeight = Math.max(280, Math.min(height * 1.2, viewBox.height * scale));
    viewBox.x += (viewBox.width - newWidth) * px;
    viewBox.y += (viewBox.height - newHeight) * py;
    viewBox.width = newWidth;
    viewBox.height = newHeight;
    apply();
  }, { passive: false });
  svg.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dragging = true;
    moved = false;
    start = { x: event.clientX, y: event.clientY, box: { ...viewBox } };
    svg.setPointerCapture(event.pointerId);
    svg.classList.add("is-dragging");
  });
  svg.addEventListener("pointermove", (event) => {
    if (!dragging || !start) return;
    const rect = svg.getBoundingClientRect();
    const dx = (event.clientX - start.x) * (viewBox.width / rect.width);
    const dy = (event.clientY - start.y) * (viewBox.height / rect.height);
    if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 4) moved = true;
    viewBox.x = start.box.x - dx;
    viewBox.y = start.box.y - dy;
    apply();
  });
  svg.addEventListener("pointerup", (event) => {
    if (moved) {
      svg.dataset.suppressClick = "true";
      setTimeout(() => {
        delete svg.dataset.suppressClick;
      }, 80);
    }
    dragging = false;
    svg.classList.remove("is-dragging");
    if (svg.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  });
  svg.addEventListener("pointercancel", () => {
    dragging = false;
    svg.classList.remove("is-dragging");
  });
  return reset;
}

function openGraphModal(title, km, options = {}) {
  const modal = document.getElementById("graphModal");
  document.getElementById("graphModalTitle").textContent = title;
  const host = document.getElementById("graphModalHost");
  host.replaceChildren(graphBlock(km, options));
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeGraphModal() {
  document.getElementById("graphModal").hidden = true;
  document.body.style.overflow = "";
}

function showDictionary() {
  if (!state.km) return;
  showTablePreview("KM Dictionary", state.km.dictionary, Object.keys(state.km.dictionary[0] || {}), {
    dictionaryActions: true
  });
}

function showMatrixPreview(title, matrix) {
  const rows = matrixRows(matrix);
  showTablePreview(title, rows, rows[0] ? Object.keys(rows[0]) : matrix.columns);
}

function showTablePreview(title, rows, columns, options = {}) {
  showFloatingContent(title, createTable(rows, columns), {
    fullscreen: options.fullscreen !== false,
    dictionaryActions: Boolean(options.dictionaryActions)
  });
}

function showFloatingContent(title, contentNode, options = {}) {
  const panelNode = document.getElementById("floatingDictionary");
  const titleNode = panelNode.querySelector(".floating-titlebar strong");
  if (titleNode) titleNode.textContent = title;
  document.getElementById("dictionaryTableHost").replaceChildren(contentNode);
  document.getElementById("downloadDictionaryCsvButton").hidden = !options.dictionaryActions;
  document.getElementById("downloadDictionaryJsonButton").hidden = !options.dictionaryActions;
  const fullscreen = options.fullscreen !== false;
  panelNode.classList.toggle("is-fullscreen", fullscreen);
  panelNode.classList.toggle("is-dictionary-preview", Boolean(options.dictionaryActions));
  if (fullscreen) {
    panelNode.style.left = "";
    panelNode.style.top = "";
    panelNode.style.right = "";
    panelNode.style.bottom = "";
    panelNode.style.width = "";
    panelNode.style.height = "";
  } else {
    panelNode.style.left = options.left || "";
    panelNode.style.top = options.top || "";
    panelNode.style.right = options.right || "22px";
    panelNode.style.bottom = options.bottom || "22px";
    panelNode.style.width = options.width || "520px";
    panelNode.style.height = options.height || "390px";
  }
  panelNode.hidden = false;
}

function closeFloatingContent(options = {}) {
  const panelNode = document.getElementById("floatingDictionary");
  if (!panelNode) return;
  panelNode.hidden = true;
  if (options.clear !== false) {
    requestAnimationFrame(() => {
      if (panelNode.hidden) document.getElementById("dictionaryTableHost")?.replaceChildren();
    });
  }
}

function closeTransientVisuals() {
  closeFloatingContent();
  const graphModal = document.getElementById("graphModal");
  if (graphModal) graphModal.hidden = true;
  document.getElementById("graphModalHost")?.replaceChildren();
}

function matrixRows(matrix) {
  if (!matrix || !Array.isArray(matrix.rows)) return [];
  return matrix.rows.map((row, rowIndex) => Object.fromEntries(
    ["ROW"].concat(matrix.columns || []).map((column, index) => (
      index === 0 ? [column, rowIndex + 1] : [column, row[index - 1]]
    ))
  ));
}

function makeFloatingPanelDraggable() {
  const panelNode = document.getElementById("floatingDictionary");
  const handle = panelNode.querySelector(".floating-titlebar");
  let dragging = false;
  let start = null;
  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    dragging = true;
    const rect = panelNode.getBoundingClientRect();
    start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("pointermove", (event) => {
    if (!dragging || !start) return;
    panelNode.style.left = `${Math.max(0, start.left + event.clientX - start.x)}px`;
    panelNode.style.top = `${Math.max(0, start.top + event.clientY - start.y)}px`;
    panelNode.style.right = "auto";
    panelNode.style.bottom = "auto";
  });
  handle.addEventListener("pointerup", () => {
    dragging = false;
  });
}

function attemptsForRow(row) {
  return row.sequence
    .map((seq, index) => ({ seq, index }))
    .filter((item) => item.seq !== null && row.directScores[item.index] !== null)
    .sort((a, b) => Number(a.seq) - Number(b.seq))
    .map((item, index) => ({
      step: index + 1,
      questionIndex: item.index,
      questionNumber: item.index + 1,
      topic: state.km.nodes[item.index].topicName,
      score: row.directScores[item.index],
      sequence: item.seq
    }));
}

function simulateTracker(row, step, options = {}) {
  const statusById = {};
  const edgeStatusByKey = {};
  const attempts = attemptsForRow(row).filter((attempt) => attempt.step <= step);
  const categorySets = {
    directCorrect: new Set(),
    directIncorrect: new Set(),
    impliedCorrect: new Set(),
    impliedIncorrect: new Set()
  };
  const statusRank = {
    "implied-correct-indirect": 1,
    "implied-incorrect-indirect": 1,
    "implied-correct": 2,
    "implied-incorrect": 2,
    "direct-correct": 3,
    "direct-incorrect": 3
  };
  const edgeRank = {
    "tracker-indirect-correct": 1,
    "tracker-indirect-incorrect": 1,
    "tracker-direct-correct": 2,
    "tracker-direct-incorrect": 2
  };
  const setNodeStatus = (id, status) => {
    const existing = statusById[id];
    if (!existing || (statusRank[status] || 0) > (statusRank[existing] || 0)) {
      statusById[id] = status;
    }
  };
  const setEdgeStatus = (source, target, status) => {
    const key = edgeKey(source, target);
    const existing = edgeStatusByKey[key];
    if (!existing || (edgeRank[status] || 0) > (edgeRank[existing] || 0)) {
      edgeStatusByKey[key] = status;
    }
  };
  let activeId = "";
  attempts.forEach((attempt) => {
    const id = String(attempt.questionNumber);
    activeId = id;
    const directStatus = attempt.score === 1 ? "direct-correct" : "direct-incorrect";
    const impliedStatus = attempt.score === 1 ? "implied-correct" : "implied-incorrect";
    const indirectStatus = `${impliedStatus}-indirect`;
    const affected = normaliseIdList(attempt.score === 1 ? state.km.reachability.in?.[id] : state.km.reachability.out?.[id]).map(String);
    const immediate = new Set(normaliseIdList(attempt.score === 1 ? state.km.reachability.inAdj?.[id] : state.km.reachability.outAdj?.[id]).map(String));
    const affectedSet = new Set(affected);
    setNodeStatus(id, directStatus);
    categorySets[attempt.score === 1 ? "directCorrect" : "directIncorrect"].add(id);
    affected.forEach((affectedId) => {
      categorySets[attempt.score === 1 ? "impliedCorrect" : "impliedIncorrect"].add(affectedId);
      setNodeStatus(affectedId, immediate.has(affectedId) ? impliedStatus : indirectStatus);
    });
    state.km.edges.forEach((edge) => {
      if (attempt.score === 1) {
        if (edge.target === id && immediate.has(edge.source)) {
          setEdgeStatus(edge.source, edge.target, "tracker-direct-correct");
        } else if (affectedSet.has(edge.source) && (affectedSet.has(edge.target) || edge.target === id)) {
          setEdgeStatus(edge.source, edge.target, "tracker-indirect-correct");
        }
      } else if (edge.source === id && immediate.has(edge.target)) {
        setEdgeStatus(edge.source, edge.target, "tracker-direct-incorrect");
      } else if ((affectedSet.has(edge.source) || edge.source === id) && affectedSet.has(edge.target)) {
        setEdgeStatus(edge.source, edge.target, "tracker-indirect-incorrect");
      }
    });
  });
  const counts = trackerStatusCounts(statusById);
  return {
    statusById,
    edgeStatusByKey,
    activeId: options.finalState ? "" : activeId,
    counts
  };
}

function simulateTrackerFinalState(row) {
  const statusById = {};
  const directScores = row.directScores || [];
  const impliedScores = row.impliedScores || [];
  impliedScores.forEach((score, index) => {
    const id = String(index + 1);
    if (directScores[index] === 1) statusById[id] = "direct-correct";
    else if (directScores[index] === 0) statusById[id] = "direct-incorrect";
    else if (score === 1) statusById[id] = "implied-correct";
    else if (score === 0) statusById[id] = "implied-incorrect";
  });
  return {
    statusById,
    edgeStatusByKey: {},
    activeId: "",
    counts: trackerStatusCounts(statusById)
  };
}

function simulateTrackerStatusFilter(row, selectedStatuses) {
  const statusById = {};
  const directScores = row.directScores || [];
  const impliedScores = row.impliedScores || [];
  const questionCount = state.km?.nodes?.length || Math.max(directScores.length, impliedScores.length);
  for (let index = 0; index < questionCount; index += 1) {
    const id = String(index + 1);
    let status = "";
    if (directScores[index] === 1) status = "direct-correct";
    else if (directScores[index] === 0) status = "direct-incorrect";
    else if (impliedScores[index] === 1) status = "implied-correct";
    else if (impliedScores[index] === 0) status = "implied-incorrect";
    else status = "not-examined";
    if (selectedStatuses.has(status)) statusById[id] = status;
  }
  return {
    statusById,
    edgeStatusByKey: {},
    activeId: "",
    counts: trackerStatusCounts(statusById)
  };
}

function selectedTrackerStatusFilters() {
  return new Set(Array.isArray(state.tracker.statusFilters) ? state.tracker.statusFilters : []);
}

function toggleTrackerStatusFilter(status) {
  const selected = selectedTrackerStatusFilters();
  if (selected.has(status)) selected.delete(status);
  else selected.add(status);
  state.tracker.statusFilters = [...selected];
  state.tracker.step = 0;
  state.tracker.finalState = false;
  state.kmSelectedNodeId = "";
  state.kmSearchQuery = "";
  state.kmVisibleGroups = [];
  refreshGraphViews();
}

function trackerStatusCounts(statusById) {
  const counts = {
    directCorrect: 0,
    directIncorrect: 0,
    impliedCorrect: 0,
    impliedIncorrect: 0,
    notExamined: 0
  };
  Object.values(statusById || {}).forEach((status) => {
    if (status === "direct-correct") counts.directCorrect += 1;
    if (status === "direct-incorrect") counts.directIncorrect += 1;
    if (status === "implied-correct" || status === "implied-correct-indirect") counts.impliedCorrect += 1;
    if (status === "implied-incorrect" || status === "implied-incorrect-indirect") counts.impliedIncorrect += 1;
    if (status === "not-examined") counts.notExamined += 1;
  });
  return counts;
}

function trackerStudentLabel(row) {
  return `${row.rowKey} | ${row.username || "no username"} | ${row.numDirectScoreQuestions} direct`;
}

function trackerStatusKey(simulation) {
  const counts = simulation?.counts || {};
  return el("div", { class: "tracker-key", "aria-label": "Attempt tracker legend" }, [
    trackerKeyItem("Direct correct", counts.directCorrect || 0, "direct-correct"),
    trackerKeyItem("Direct incorrect", counts.directIncorrect || 0, "direct-incorrect"),
    trackerKeyItem("Implied correct", counts.impliedCorrect || 0, "implied-correct"),
    trackerKeyItem("Implied incorrect", counts.impliedIncorrect || 0, "implied-incorrect")
  ]);
}

function trackerKeyItem(label, count, status) {
  return el("div", { class: `tracker-key-item ${status}` }, [
    el("span", { class: "tracker-key-swatch" }),
    el("span", {}, label),
    el("strong", {}, valueText(count))
  ]);
}

function showTrackerStepInfo(active) {
  const id = String(active.questionNumber);
  const row = state.implied?.rows?.find((item) => item.rowKey === state.tracker.rowKey);
  const priorStatus = row && active.step > 1 ? simulateTracker(row, active.step - 1).statusById[id] : "";
  const affected = normaliseIdList(active.score === 1 ? state.km.reachability.in?.[id] : state.km.reachability.out?.[id]).map(String);
  const affectedRows = affected.map((affectedId) => ({
    QuestionNumber: affectedId,
    TopicName: state.km.nodes[Number(affectedId) - 1]?.topicName || "",
    QuestionName: state.km.nodes[Number(affectedId) - 1]?.questionName || "",
    CurriculumGroup: state.km.nodes[Number(affectedId) - 1]?.curriculumGroup || ""
  }));
  const content = el("article", { class: "tracker-step-preview" }, [
    el("h3", {}, `S${active.step}: Q${active.questionNumber}`),
    el("p", { class: "muted" }, active.topic),
    el("div", { class: "pill-row" }, [
      pill(active.score === 1 ? "direct correct" : "direct incorrect"),
      priorStatus ? pill(`previously ${priorStatus.replace("-", " ")}`) : "",
      pill(active.score === 1 ? "all upstream prerequisites affected" : "all downstream dependents affected"),
      pill(`${affected.length} affected topics`)
    ]),
    createTable(affectedRows, ["QuestionNumber", "TopicName", "QuestionName", "CurriculumGroup"])
  ]);
  showFloatingContent("Attempt Step Details", content, {
    fullscreen: false,
    width: "560px",
    height: "430px"
  });
}

function raschSummaryRows() {
  const summary = state.rasch?.summary || {};
  return ["raw", "implied"].map((key) => ({
    matrix: key,
    rows: summary[key]?.rows ?? "",
    columns: summary[key]?.columns ?? "",
    removed_zero_or_na_columns: Array.isArray(summary[key]?.removed_zero_or_na_columns)
      ? summary[key].removed_zero_or_na_columns.length
      : "",
    deviance: summary[key]?.deviance ?? ""
  }));
}

function raschOutputBrowser(files = []) {
  if (!files.length) return el("p", { class: "muted" }, "No output files were listed.");
  const visibleFiles = files.filter((file) => file.name !== "run_rasch.R");
  const groups = raschOutputGroups(visibleFiles);
  return el("div", { class: "rasch-output-groups" }, groups.map((group) => (
    el("section", { class: "rasch-output-group" }, [
      el("h4", {}, group.label),
      el("div", { class: "rasch-output-subgroups" }, group.subgroups.map((subgroup) => (
        el("article", { class: "rasch-output-subgroup" }, [
          el("h5", {}, subgroup.label),
          subgroup.files.length
            ? el("div", { class: "rasch-output-list" }, subgroup.files.map(raschOutputRow))
            : el("p", { class: "muted" }, "No files generated.")
        ])
      )))
    ])
  )));
}

function raschOutputGroups(files) {
  const byName = Object.fromEntries(files.map((file) => [file.name, file]));
  const pick = (...names) => names.map((name) => byName[name]).filter(Boolean);
  return [
    {
      label: "Model Summaries",
      subgroups: [
        { label: "Raw", files: pick("raw_model_summary.txt") },
        { label: "Implied", files: pick("implied_model_summary.txt") },
        { label: "Run", files: pick("rasch_summary.json") }
      ]
    },
    {
      label: "Wright Maps",
      subgroups: [
        { label: "Raw", files: pick("raw_wright_map.png") },
        { label: "Implied", files: pick("implied_wright_map.png") }
      ]
    },
    {
      label: "Item",
      subgroups: [
        { label: "Raw", files: pick("raw_item.csv", "raw_item_fit_using_simulation.csv", "raw_item_fit_with_no_simulation.csv") },
        { label: "Implied", files: pick("implied_item.csv", "implied_item_fit_using_simulation.csv", "implied_item_fit_with_no_simulation.csv") }
      ]
    },
    {
      label: "Person",
      subgroups: [
        { label: "Raw", files: pick("raw_person_EAP.csv", "raw_person_statistics_WLE_error.csv", "raw_person_statistics_WLE_theta.csv") },
        { label: "Implied", files: pick("implied_person_EAP.csv", "implied_person_statistics_WLE_error.csv", "implied_person_statistics_WLE_theta.csv") }
      ]
    },
    {
      label: "Scores",
      subgroups: [
        { label: "Raw", files: pick("raw_scores.csv") },
        { label: "Implied", files: pick("implied_scores.csv") }
      ]
    }
  ];
}

function raschOutputRow(file) {
  return el("div", { class: "rasch-output-row" }, [
    el("div", { class: "rasch-output-meta" }, [
      el("strong", {}, file.name),
      el("span", {}, `${raschFileKind(file.name)} · ${formatBytes(file.bytes)}`)
    ]),
    el("div", { class: "rasch-output-actions" }, [
      actionButton("Preview", () => previewRaschOutputFile(file), false, "tiny-button"),
      el("a", { class: "tiny-button rasch-download-link", href: file.url, download: file.name }, "Download")
    ])
  ]);
}

function raschFileKind(name) {
  const ext = fileExtension(name);
  if (ext === "csv") return "CSV table";
  if (ext === "png") return "Image";
  if (ext === "json") return "JSON";
  if (ext === "txt") return "Text";
  if (ext === "r") return "R script";
  return "File";
}

function raschHasItemOutputs() {
  return Boolean(raschFileByName("raw_item.csv") && raschFileByName("implied_item.csv"));
}

function raschFileByName(name) {
  return (state.rasch?.files || []).find((file) => file.name === name) || null;
}

async function compareRaschItemDifficulties() {
  const rawFile = raschFileByName("raw_item.csv");
  const impliedFile = raschFileByName("implied_item.csv");
  if (!rawFile || !impliedFile) {
    throw new Error("Run Rasch Analysis first so raw_item.csv and implied_item.csv are available.");
  }
  await withLoading("Comparing item difficulties", async () => {
    const [rawParsed, impliedParsed] = await Promise.all([
      fetchText(rawFile.url).then(parseCsv),
      fetchText(impliedFile.url).then(parseCsv)
    ]);
    const rows = itemDifficultyComparisonRows(rawParsed.rows, impliedParsed.rows);
    showTablePreview("Raw vs Implied Item Difficulty", rows, [
      "ITEM",
      "RAW_ITEM",
      "RAW_N",
      "RAW_M",
      "RAW_XSI_ITEM",
      "IMPLIED_ITEM",
      "IMPLIED_N",
      "IMPLIED_M",
      "IMPLIED_XSI_ITEM",
      "IMPLIED_MINUS_RAW_XSI_ITEM",
      "ABS_IMPLIED_MINUS_RAW_XSI_ITEM"
    ]);
  }, "Loading raw_item.csv and implied_item.csv.");
}

function itemDifficultyComparisonRows(rawRows, impliedRows) {
  const rawByItem = itemRowsByQuestion(rawRows);
  const impliedByItem = itemRowsByQuestion(impliedRows);
  const ids = uniqueStrings(Object.keys(rawByItem).concat(Object.keys(impliedByItem)))
    .sort((a, b) => Number(a) - Number(b));
  return ids.map((id) => {
    const raw = rawByItem[id] || {};
    const implied = impliedByItem[id] || {};
    const rawDifficulty = numericCsvValue(raw["xsi.item"]);
    const impliedDifficulty = numericCsvValue(implied["xsi.item"]);
    const delta = Number.isFinite(rawDifficulty) && Number.isFinite(impliedDifficulty)
      ? impliedDifficulty - rawDifficulty
      : NaN;
    return {
      ITEM: paddedQuestionLabel(id),
      RAW_ITEM: raschScoreItemLabel(raw.item, "raw", id),
      RAW_N: numericCsvValue(raw.N),
      RAW_M: numericCsvValue(raw.M),
      RAW_XSI_ITEM: rawDifficulty,
      IMPLIED_ITEM: raschScoreItemLabel(implied.item, "implied", id),
      IMPLIED_N: numericCsvValue(implied.N),
      IMPLIED_M: numericCsvValue(implied.M),
      IMPLIED_XSI_ITEM: impliedDifficulty,
      IMPLIED_MINUS_RAW_XSI_ITEM: Number.isFinite(delta) ? round(delta, 4) : "",
      ABS_IMPLIED_MINUS_RAW_XSI_ITEM: Number.isFinite(delta) ? round(Math.abs(delta), 4) : ""
    };
  });
}

function raschScoreItemLabel(value, kind, fallbackId) {
  const id = questionNumberFromColumn(value);
  const number = Number.isFinite(id) ? id : Number(fallbackId);
  if (!Number.isFinite(number)) return cleanLabel(value);
  return `${paddedQuestionLabel(number)}_${kind}_score`;
}

function itemRowsByQuestion(rows) {
  const out = {};
  (rows || []).forEach((row) => {
    const id = wrightItemShortLabel(row.item || row.Item || "");
    if (id) out[id] = row;
  });
  return out;
}

function numericCsvValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? round(number, 4) : "";
}

async function previewRaschOutputFile(file) {
  await withLoading("Loading Rasch output", async () => {
    const ext = fileExtension(file.name);
    if (ext === "png") {
      if (/wright_map/i.test(file.name)) {
        await previewInteractiveWrightMap(file);
        return;
      }
      showFloatingContent(file.name, el("div", { class: "file-preview-image-wrap" }, [
        el("img", { class: "file-preview-image", src: file.url, alt: file.name })
      ]), { fullscreen: true });
      return;
    }

    const text = await fetchText(file.url);
    if (ext === "csv") {
      const parsed = parseCsv(text);
      showTablePreview(file.name, parsed.rows, parsed.columns);
      return;
    }

    const displayText = ext === "json" ? prettifyJsonText(text) : text;
    showFloatingContent(file.name, el("pre", { class: "file-preview-text" }, displayText), { fullscreen: true });
  }, `Fetching ${file.name}.`);
}

async function previewInteractiveWrightMap(file) {
  const kind = String(file.name || "").startsWith("implied") ? "implied" : "raw";
  const itemFile = raschFileByName(`${kind}_item.csv`);
  const personFile = raschFileByName(`${kind}_person_EAP.csv`) || raschFileByName(`${kind}_person_statistics_WLE_theta.csv`);
  const [itemText, personText] = await Promise.all([
    itemFile ? fetchText(itemFile.url) : Promise.reject(new Error(`${kind}_item.csv is not available.`)),
    personFile ? fetchText(personFile.url) : Promise.reject(new Error(`${kind}_person_EAP.csv is not available.`))
  ]);
  const items = parseCsv(itemText).rows
    .map((row) => {
      const label = row.item || row.Item || row.item_id || "";
      return {
        label,
        value: firstNumericValue(row, ["xsi.item", "AXsi_.Cat1", "xsi", "difficulty", "b"]),
        ...wrightItemMetadata(label)
      };
    })
    .filter((row) => Number.isFinite(row.value));
  const persons = parseCsv(personText).rows
    .map((row) => firstNumericValue(row, ["EAP", "theta", "WLE", "x"]))
    .filter((value) => Number.isFinite(value));
  showFloatingContent(`${kindLabel(kind)} Interactive Wright Map`, wrightMapPreview(kind, items, persons, file), { fullscreen: true });
}

function firstNumericValue(row, preferredColumns = []) {
  for (const column of preferredColumns) {
    const value = Number(row[column]);
    if (Number.isFinite(value)) return value;
  }
  for (const value of Object.values(row || {})) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return NaN;
}

function kindLabel(kind) {
  return String(kind || "").replace(/^\w/, (letter) => letter.toUpperCase());
}

function wrightMapPreview(kind, items, persons, sourceFile) {
  if (!items.length || !persons.length) {
    return el("article", { class: "card notice issue" }, [
      el("h3", {}, "Wright map unavailable"),
      el("p", { class: "muted" }, "The Rasch item/person CSV files did not contain readable item difficulties and person estimates."),
      el("a", { class: "tiny-button rasch-download-link", href: sourceFile.url, download: sourceFile.name }, "Download original PNG")
    ]);
  }

  let orderMode = "number";
  let resetView = () => {};
  let activeTooltipKey = "";
  let activeTooltipPoint = null;
  const plotHost = el("div", { class: "wright-map-plot-host" });
  const tooltip = el("div", { class: "wright-html-tooltip", hidden: true });
  const hideTooltip = () => {
    activeTooltipKey = "";
    if (activeTooltipPoint) activeTooltipPoint.classList.remove("is-active");
    activeTooltipPoint = null;
    tooltip.hidden = true;
    tooltip.replaceChildren();
  };
  const showTooltip = (event, pointNode, item) => {
    const key = `${item.label}:${item.value}`;
    if (activeTooltipKey === key) {
      hideTooltip();
      return;
    }
    hideTooltip();
    activeTooltipKey = key;
    activeTooltipPoint = pointNode;
    pointNode.classList.add("is-active");
    const qNumber = wrightItemNumber(item.label);
    const qLabel = Number.isFinite(qNumber) ? `Q${qNumber}` : `Q${wrightItemShortLabel(item.label)}`;
    tooltip.replaceChildren(
      el("div", { class: "wright-tooltip-line" }, [
        el("strong", {}, `${qLabel} difficulty:`),
        ` ${round(item.value, 3)} logits`
      ]),
      el("div", { class: "wright-tooltip-line" }, [
        el("strong", {}, "Topic:"),
        ` ${item.topicName || "not available"}`
      ]),
      el("div", { class: "wright-tooltip-line" }, [
        el("strong", {}, "Question:"),
        ` ${item.questionName || "not available"}`
      ])
    );
    tooltip.hidden = false;
    const hostRect = plotHost.getBoundingClientRect();
    const rawLeft = event.clientX - hostRect.left + 14;
    const rawTop = event.clientY - hostRect.top - 38;
    const left = Math.max(8, Math.min(hostRect.width - tooltip.offsetWidth - 8, rawLeft));
    const top = Math.max(8, Math.min(hostRect.height - tooltip.offsetHeight - 8, rawTop));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  const orderButton = actionButton("Order by difficulty", () => {
    orderMode = orderMode === "number" ? "difficulty" : "number";
    orderButton.textContent = orderMode === "number" ? "Order by difficulty" : "Order by item number";
    renderPlot();
  }, false, "secondary-action tiny-button");
  const resetButton = actionButton("Reset view", () => {
    hideTooltip();
    resetView();
  }, false, "secondary-action tiny-button");
  const renderPlot = () => {
    hideTooltip();
    const svg = wrightMapSvg(kind, items, persons, orderMode, {
      onItemClick: ({ event, pointNode, item }) => showTooltip(event, pointNode, item),
      onClear: hideTooltip
    });
    resetView = enablePanZoom(svg, Number(svg.dataset.width), Number(svg.dataset.height));
    plotHost.replaceChildren(svg, tooltip);
  };
  const container = el("div", { class: "wright-map-preview" }, [
    el("div", { class: "button-row wright-map-actions" }, [
      orderButton,
      resetButton,
      el("a", { class: "tiny-button rasch-download-link", href: sourceFile.url, download: sourceFile.name }, "Download original PNG")
    ]),
    plotHost
  ]);
  renderPlot();
  return container;
}

function wrightMapSvg(kind, items, persons, orderMode, options = {}) {
  const values = items.map((item) => item.value).concat(persons);
  const min = Math.floor(Math.min(...values) - 0.5);
  const max = Math.ceil(Math.max(...values) + 0.5);
  const width = Math.max(1320, items.length * 13 + 470);
  const height = 720;
  const margin = { top: 70, right: 42, bottom: 48, left: 58 };
  const plotTop = margin.top;
  const plotBottom = height - margin.bottom;
  const y = (value) => plotBottom - ((value - min) / Math.max(1, max - min)) * (plotBottom - plotTop);
  const bins = histogramBins(persons, min, max, 28);
  const maxBin = Math.max(1, ...bins.map((bin) => bin.count));
  const histLeft = 95;
  const histRight = 355;
  const itemLeft = 470;
  const itemRight = width - 42;
  const orderedItems = items.slice().sort((a, b) => {
    if (orderMode === "difficulty") return a.value - b.value || wrightItemNumber(a.label) - wrightItemNumber(b.label);
    const aNumber = wrightItemNumber(a.label);
    const bNumber = wrightItemNumber(b.label);
    if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
    return String(a.label || "").localeCompare(String(b.label || ""));
  });
  const x = (index) => itemLeft + (orderedItems.length <= 1 ? 0 : (index / (orderedItems.length - 1)) * (itemRight - itemLeft));
  const svg = svgEl("svg", {
    class: "wright-map-svg",
    viewBox: `0 0 ${width} ${height}`,
    "data-width": String(width),
    "data-height": String(height),
    role: "img",
    "aria-label": `${kindLabel(kind)} interactive Wright map`
  });

  svg.appendChild(svgEl("text", { class: "wright-title", x: String(width / 2), y: "34", "text-anchor": "middle" }, [`${kindLabel(kind)} Wright Map`]));
  svg.appendChild(svgEl("text", { class: "wright-axis-title", x: "215", y: String(height - 15), "text-anchor": "middle" }, ["Respondents"]));
  svg.appendChild(svgEl("text", { class: "wright-axis-title", x: String((itemLeft + itemRight) / 2), y: String(height - 15), "text-anchor": "middle" }, [
    orderMode === "difficulty" ? "Items ordered by difficulty" : "Items ordered by question number"
  ]));

  const axisX = 420;
  svg.appendChild(svgEl("line", { class: "wright-axis", x1: String(axisX), y1: String(plotTop), x2: String(axisX), y2: String(plotBottom) }));
  for (let tick = min; tick <= max; tick += 1) {
    const ty = y(tick);
    svg.appendChild(svgEl("line", { class: "wright-grid", x1: String(histLeft), y1: String(ty), x2: String(width - margin.right), y2: String(ty) }));
    svg.appendChild(svgEl("text", { class: "wright-tick", x: String(axisX - 12), y: String(ty + 4), "text-anchor": "end" }, [String(tick)]));
  }
  svg.appendChild(svgEl("text", { class: "wright-logit-label", x: String(axisX - 42), y: String(plotTop - 12), "text-anchor": "middle" }, ["Logits"]));

  bins.forEach((bin) => {
    const yTop = y(bin.high);
    const yBottom = y(bin.low);
    const barWidth = ((histRight - histLeft) * bin.count) / maxBin;
    svg.appendChild(svgEl("rect", {
      class: "wright-person-bin",
      x: String(histRight - barWidth),
      y: String(yTop),
      width: String(barWidth),
      height: String(Math.max(1, yBottom - yTop))
    }));
  });

  orderedItems.forEach((item, index) => {
    const itemY = y(item.value);
    const itemX = x(index);
    const group = svgEl("g", { class: "wright-item-hit" });
    const hitTarget = svgEl("circle", {
      class: "wright-item-hit-target",
      cx: String(itemX),
      cy: String(itemY),
      r: "13"
    });
    const point = svgEl("polygon", {
      class: "wright-item-point",
      points: `${itemX},${itemY - 7} ${itemX + 7},${itemY} ${itemX},${itemY + 7} ${itemX - 7},${itemY}`
    });
    const activate = (event) => {
      event.stopPropagation();
      event.preventDefault();
      options.onItemClick?.({ event, pointNode: point, item, itemX, itemY });
    };
    group.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    group.addEventListener("pointerup", activate);
    group.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    group.append(hitTarget, point);
    svg.appendChild(group);
    svg.appendChild(svgEl("text", {
      class: "wright-item-label",
      x: String(itemX),
      y: String(itemY + 14),
      "text-anchor": "middle"
    }, [wrightItemShortLabel(item.label)]));
  });
  svg.addEventListener("click", () => {
    if (svg.dataset.suppressClick === "true") return;
    options.onClear?.();
  });

  return svg;
}

function wrightItemMetadata(label) {
  const number = wrightItemNumber(label);
  const node = Number.isFinite(number) ? state.km?.nodes?.[number - 1] : null;
  return {
    questionNumber: Number.isFinite(number) ? number : null,
    topicName: node?.topicName || "",
    questionName: node?.questionName || ""
  };
}

function wrightItemNumber(label) {
  const match = String(label || "").match(/Q(\d+)/i);
  return match ? Number(match[1]) : NaN;
}

function wrightItemShortLabel(label) {
  const match = String(label || "").match(/Q(\d+)/i);
  return match ? match[1] : String(label || "").replace(/_(raw|implied)_score.*$/i, "");
}

function histogramBins(values, min, max, count) {
  const span = Math.max(1, max - min);
  const width = span / count;
  const bins = Array.from({ length: count }, (_, index) => ({
    low: min + index * width,
    high: min + (index + 1) * width,
    count: 0
  }));
  values.forEach((value) => {
    const index = Math.max(0, Math.min(count - 1, Math.floor(((value - min) / span) * count)));
    bins[index].count += 1;
  });
  return bins;
}

function spreadLabelPositions(positions, minGap, minY, maxY) {
  const out = positions.slice();
  for (let index = 1; index < out.length; index += 1) {
    if (out[index] < out[index - 1] + minGap) out[index] = out[index - 1] + minGap;
  }
  const overflow = out.length ? out[out.length - 1] - maxY : 0;
  if (overflow > 0) {
    for (let index = 0; index < out.length; index += 1) out[index] -= overflow;
  }
  for (let index = out.length - 2; index >= 0; index -= 1) {
    if (out[index] > out[index + 1] - minGap) out[index] = out[index + 1] - minGap;
  }
  return out.map((value) => Math.max(minY, Math.min(maxY, value)));
}

function fileExtension(name) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return response.text();
}

function prettifyJsonText(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch (error) {
    return text;
  }
}

function parseCsv(text) {
  const records = parseCsvRecords(text);
  if (!records.length) return { columns: [], rows: [] };
  const columns = records[0].map((column, index) => column || `column_${index + 1}`);
  const rows = records.slice(1)
    .filter((record) => record.some((value) => String(value).trim() !== ""))
    .map((record) => Object.fromEntries(columns.map((column, index) => [column, record[index] ?? ""])));
  return { columns, rows };
}

function parseCsvRecords(text) {
  const records = [];
  let record = [];
  let value = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (quoted) {
      if (char === "\"" && next === "\"") {
        value += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      record.push(value);
      value = "";
    } else if (char === "\n") {
      record.push(value.replace(/\r$/, ""));
      records.push(record);
      record = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value !== "" || record.length) {
    record.push(value.replace(/\r$/, ""));
    records.push(record);
  }
  return records;
}

function setupPayload(options = {}) {
  const configuredAttemptPaths = splitPathLines(state.config.filePaths.attemptData).filter(isUsableFilePath);
  const stagedAttempts = state.stagedSources.attempts || [];
  const sourceAttempts = stagedAttempts.length ? stagedAttempts : state.attemptSources;
  const examPath = [state.config.filePaths.exam, state.stagedSources.exam?.windowsPath, state.stagedSources.exam?.path, state.exam?.path].find(isUsableFilePath) || "";
  const gexfPath = [state.config.filePaths.gexf, state.stagedSources.gexf?.windowsPath, state.stagedSources.gexf?.path, state.gexf?.path].find(isUsableFilePath) || "";
  const attemptCount = Math.max(sourceAttempts.length, configuredAttemptPaths.length);
  const attemptFiles = Array.from({ length: attemptCount }, (_, index) => {
    const source = sourceAttempts[index] || {};
    const path = [configuredAttemptPaths[index], source.windowsPath, source.path].find(isUsableFilePath) || "";
    return {
      label: source.label || `data_source_${index + 1}`,
      fileName: source.fileName || fileNameFromPath(path),
      path,
      windowsPath: setupWindowsPathFor(path, source.windowsPath)
    };
  });
  const payload = {
    type: "nwg-diagnostic-tool-setup",
    version: 1,
    savedAt: new Date().toISOString(),
    config: {
      questionThreshold: state.config.questionThreshold,
      setNumOfAttempts: state.config.setNumOfAttempts,
      minimumNumberOfImpliedScores: state.config.minimumNumberOfImpliedScores,
      excludePreviewUsers: state.config.excludePreviewUsers
    },
    filePaths: {
      attemptData: attemptFiles.map((source) => source.path).filter(isUsableFilePath),
      exam: examPath,
      gexf: gexfPath
    },
    windowsFilePaths: {
      attemptData: attemptFiles.map((source) => source.windowsPath).filter(isUsableFilePath),
      exam: setupWindowsPathFor(examPath, state.stagedSources.exam?.windowsPath),
      gexf: setupWindowsPathFor(gexfPath, state.stagedSources.gexf?.windowsPath)
    },
    files: {
      examFileName: state.stagedSources.exam?.fileName || state.exam?.name || fileNameFromPath(examPath),
      gexfFileName: state.stagedSources.gexf?.fileName || state.gexf?.name || fileNameFromPath(gexfPath),
      attemptFiles: attemptFiles.map((source) => ({
        ...source,
        windowsPath: source.windowsPath || setupWindowsPathFor(source.path)
      }))
    }
  };
  return payload;
}

function analysisParamsPayload() {
  return {
    questionThreshold: state.config.questionThreshold,
    setNumOfAttempts: state.config.setNumOfAttempts,
    minimumNumberOfImpliedScores: state.config.minimumNumberOfImpliedScores,
    excludePreviewUsers: state.config.excludePreviewUsers
  };
}

async function runRSourceAnalysis(step, options = {}) {
  return runBrowserAnalysis(step, options);
}

async function runBrowserAnalysis(step, options = {}) {
  const progress = (percent, phase, message) => {
    if (typeof options.onProgress === "function") {
      options.onProgress({ percent, reportedPercent: percent, phase, message, state: "running", detail: `${phase}: ${message} (${percent}%)` });
    }
    updateLoadingDetail(`${phase}: ${message} (${percent}%)`);
  };

  await nextFrame();
  const result = {};

  if (step === "km" || step === "datasets" || step === "implied" || step === "curriculum" || step === "pipeline") {
    progress(18, "Knowledge Map", "Parsing Numbas exam knowledge graph");
    result.km = state.km || buildKnowledgeMapFromExam(requiredExamData());
    state.km = normaliseRKnowledgeMap(result.km);
    normaliseAttemptSources();
  }

  if (step === "datasets" || step === "implied" || step === "curriculum" || step === "pipeline") {
    progress(45, "Datasets", "Building Attempt Dataset in JavaScript");
    result.datasets = buildBrowserDatasets(state.attemptSources, state.km, analysisParamsPayload());
    state.datasets = normaliseRDatasets(result.datasets);
  }

  if (step === "implied" || step === "curriculum" || step === "pipeline") {
    progress(70, "Implied Scoring", "Applying graph reachability scoring");
    const datasets = result.datasets || state.datasets;
    result.implied = applyBrowserImpliedScoring(datasets, state.km, analysisParamsPayload());
    state.implied = normaliseRImplied(result.implied);
  }

  if (step === "curriculum" || step === "pipeline") {
    progress(84, "Curriculum Groups", "Summarising curriculum groups");
    const implied = result.implied || state.implied;
    result.curriculum = buildBrowserCurriculumGroups(implied, state.km);
    state.curriculum = result.curriculum;
  }

  progress(100, "Browser Output", "Analysis complete");
  await nextFrame();
  return result;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function requiredExamData() {
  if (!state.exam?.data) throw new Error("Import the Numbas diagnostic .exam file first.");
  return state.exam.data;
}

function buildBrowserDatasets(attemptSources, km, params) {
  if (!km) throw new Error("Build the knowledge map before building datasets.");
  const threshold = numericOrNull(params.questionThreshold) ?? 0.5;
  const rows = [];
  let allRows = 0;
  let previewRows = 0;
  let removedEmptyFirstQuestion = 0;
  const mappingErrors = [];

  attemptSources.forEach((source) => {
    const attempts = Array.isArray(source.raw?.attempts) ? source.raw.attempts : [];
    allRows += attempts.length;
    attempts.forEach((attempt, index) => {
      const row = normaliseAttempt(attempt, source.label || "data_source", index + 1);
      if (params.excludePreviewUsers && /previewuser/i.test(row.username || "")) {
        previewRows += 1;
        return;
      }
      if (row.mappingErrors?.length) {
        mappingErrors.push({ row, errors: row.mappingErrors });
        return;
      }
      if (!Number.isInteger(row.firstQuestionNumber)) {
        removedEmptyFirstQuestion += 1;
        return;
      }
      const directScores = row.directScoresRaw.map((score) => score === null || score === undefined ? null : (Number(score) >= threshold ? 1 : 0));
      const directAttempts = countNonNull(directScores);
      rows.push({
        rowKey: "",
        attempt_id: row.attempt_id,
        data_source: row.data_source,
        source_index: row.source_index,
        username: row.username,
        first_name: row.first_name,
        last_name: row.last_name,
        start_time: row.start_time,
        end_time: row.end_time,
        firstQuestionNumber: row.firstQuestionNumber,
        directScores,
        sequence: row.sequence,
        directAttempts,
        numDirectScoreQuestions: directAttempts,
        impliedScores: Array(km.nodes.length).fill(null)
      });
    });
  });

  if (mappingErrors.length) {
    const first = mappingErrors[0];
    const details = first.errors.map((error) => `${error.questionName || "(blank question name)"} at step ${error.step}`).join("; ");
    throw new Error(`Could not map Numbas question name(s) to diagnostic topics for username ${first.row.username}. ${details}`);
  }

  const width = Math.max(2, String(rows.length).length);
  rows.forEach((row, index) => {
    row.rowKey = `R${String(index + 1).padStart(width, "0")}`;
  });

  const attemptedQuestionCounts = km.nodes.map((node, index) => {
    const values = rows.map((row) => row.directScores[index]).filter((value) => value !== null && value !== undefined);
    return {
      QuestionNumber: index + 1,
      TopicName: node.topicName,
      AttemptCounts: values.length,
      AverageScore: values.length ? round(mean(values), 4) : ""
    };
  }).sort((a, b) => b.AttemptCounts - a.AttemptCounts || a.QuestionNumber - b.QuestionNumber);

  const setNumOfAttempts = Number(params.setNumOfAttempts || 0);
  return {
    allRows,
    rows,
    removedEmptyFirstQuestion,
    previewRows,
    attemptedQuestionCounts,
    attemptedQuestionCountsSelected: attemptedQuestionCounts.filter((row) => row.AttemptCounts > setNumOfAttempts)
  };
}

function applyBrowserImpliedScoring(datasets, km, params) {
  const rows = (datasets.rows || []).map((row) => ({
    ...row,
    directScores: [...(row.directScores || [])],
    sequence: [...(row.sequence || [])],
    impliedScores: Array(km.nodes.length).fill(null)
  }));

  rows.forEach((row) => {
    const order = row.sequence
      .map((step, index) => ({ step, index }))
      .filter((item) => item.step !== null && item.step !== undefined && Number.isFinite(Number(item.step)))
      .sort((a, b) => Number(a.step) - Number(b.step));
    order.forEach(({ index }) => {
      const direct = row.directScores[index];
      if (direct === null || direct === undefined) return;
      const score = Number(direct) < 1 ? 0 : 1;
      row.impliedScores[index] = score;
      const affected = score === 0 ? normaliseIdList(km.reachability?.out?.[String(index + 1)]) : normaliseIdList(km.reachability?.in?.[String(index + 1)]);
      affected.map((id) => Number(id) - 1).forEach((affectedIndex) => {
        if (!Number.isInteger(affectedIndex) || affectedIndex < 0 || affectedIndex >= row.impliedScores.length) return;
        if (row.impliedScores[affectedIndex] === null || row.impliedScores[affectedIndex] === undefined) {
          row.impliedScores[affectedIndex] = score;
        }
      });
    });
    row.numImpliedScoreQuestions = countNonNull(row.impliedScores);
    row.numDirectScoreQuestions = countNonNull(row.directScores);
  });

  const minimumImpliedScores = Number(params.minimumNumberOfImpliedScores || 0);
  const filteredRows = rows.filter((row) => row.numImpliedScoreQuestions >= minimumImpliedScores);
  const rawMatrix = matrixFromRows(filteredRows, "directScores", "_raw_score");
  const impliedMatrix = matrixFromRows(filteredRows, "impliedScores", "_implied_score");
  return {
    allRows: rows,
    rows: filteredRows,
    fullyImpliedRows: filteredRows,
    df4: filteredRows,
    filteredOutRows: rows.length - filteredRows.length,
    minimumNumberOfImpliedScores: minimumImpliedScores,
    rawMatrix: rawMatrix.kept,
    impliedMatrix: impliedMatrix.kept,
    rawRemovedColumns: rawMatrix.removedColumns,
    impliedRemovedColumns: impliedMatrix.removedColumns,
    impliedColumnRows: {
      raw: rawMatrix.columnRows,
      implied: impliedMatrix.columnRows
    }
  };
}

function matrixFromRows(rows, valueKey, suffix) {
  const questionCount = state.km?.nodes?.length || 0;
  const allColumns = Array.from({ length: questionCount }, (_, index) => `Q${String(index + 1).padStart(3, "0")}${suffix}`);
  const allRows = rows.map((row) => (row[valueKey] || []).map((value) => value === undefined ? null : value));
  const keep = allColumns.map((column, index) => allRows.some((row) => row[index] !== null && row[index] !== undefined && row[index] !== 0));
  const columns = allColumns.filter((column, index) => keep[index]);
  const matrixRows = allRows.map((row) => row.filter((value, index) => keep[index]));
  const columnRows = allColumns.map((column, index) => {
    const values = allRows.map((row) => row[index]).filter((value) => value !== null && value !== undefined);
    return {
      column,
      kept: keep[index],
      nonMissing: values.length,
      sum: values.reduce((total, value) => total + Number(value || 0), 0)
    };
  });
  return {
    kept: { columns, rows: matrixRows, rowCount: matrixRows.length },
    removedColumns: allColumns.filter((column, index) => !keep[index]),
    columnRows
  };
}

function buildBrowserCurriculumGroups(implied, km) {
  const groups = [...new Set(km.nodes.map((node) => node.curriculumGroup || "Ungrouped"))].sort();
  const indexesByGroup = Object.fromEntries(groups.map((group) => [group, []]));
  km.nodes.forEach((node, index) => {
    indexesByGroup[node.curriculumGroup || "Ungrouped"].push(index);
  });
  const studentRows = (implied.rows || []).map((row) => {
    const out = {
      rowKey: row.rowKey,
      username: row.username,
      numDirectScoreQuestions: row.numDirectScoreQuestions,
      numImpliedScoreQuestions: row.numImpliedScoreQuestions,
      TOTAL_CORRECT: row.impliedScores.filter((score) => score === 1).length
    };
    groups.forEach((group) => {
      const indexes = indexesByGroup[group];
      const observed = indexes.filter((index) => row.impliedScores[index] !== null && row.impliedScores[index] !== undefined);
      const correct = indexes.filter((index) => row.impliedScores[index] === 1).length;
      out[`${group}_TOTAL`] = indexes.length;
      out[`${group}_NA`] = indexes.length - observed.length;
      out[`${group}_CORRECT`] = correct;
      out[`${group}_PROP_CORRECT`] = observed.length ? round(correct / indexes.length, 4) : null;
    });
    return out;
  });
  const groupRows = groups.map((group) => {
    const pctKey = `${group}_PROP_CORRECT`;
    const correctKey = `${group}_CORRECT`;
    const pcts = studentRows.map((row) => row[pctKey]).filter((value) => value !== null && value !== undefined);
    const correctCounts = studentRows.map((row) => row[correctKey]).filter((value) => value !== null && value !== undefined);
    return {
      group,
      question_count: indexesByGroup[group].length,
      students_with_data: pcts.length,
      mean_percent_correct: pcts.length ? round(mean(pcts), 4) : "",
      mean_correct_count: correctCounts.length ? round(mean(correctCounts), 3) : ""
    };
  });
  const pctValues = groupRows.map((row) => row.mean_percent_correct).filter((value) => value !== "");
  return {
    groups,
    groupRows,
    studentRows,
    studentColumns: ["rowKey", "username", "numDirectScoreQuestions", "numImpliedScoreQuestions", "TOTAL_CORRECT"].concat(groups.map((group) => `${group}_PROP_CORRECT`)),
    overallMean: pctValues.length ? round(mean(pctValues.map(Number)), 4) : 0,
    totalCorrectMean: studentRows.length ? round(mean(studentRows.map((row) => row.TOTAL_CORRECT)), 3) : 0
  };
}

async function readJsonResponse(response, context = "The local server") {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    const detail = htmlToPlainText(text).slice(0, 700) || response.statusText || "No response body was returned.";
    throw new Error(`${context} returned a non-JSON response. ${detail}`);
  }
}

function htmlToPlainText(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const node = document.createElement("div");
  node.innerHTML = raw;
  return (node.textContent || node.innerText || raw).replace(/\s+/g, " ").trim();
}

async function pollAnalysisJob(jobId, options = {}) {
  throw new Error("Background server jobs are not used in the JavaScript-only app.");
}

function applyAnalysisResult(result) {
  if (result.km) {
    state.km = normaliseRKnowledgeMap(result.km);
    state.kmVisibleGroups = null;
    state.validation = state.gexf ? compareKnowledgeMaps(state.km, state.gexf) : null;
  }
  if (result.datasets) {
    state.datasets = normaliseRDatasets(result.datasets);
  }
  if (result.implied) {
    state.implied = normaliseRImplied(result.implied);
  }
  if (result.curriculum) {
    state.curriculum = result.curriculum;
  }
}

function normaliseRKnowledgeMap(km) {
  const nodes = Array.isArray(km.nodes) ? km.nodes : [];
  const edges = Array.isArray(km.edges) ? km.edges : [];
  const reachability = km.reachability || buildReachability(nodes, edges);
  const normalised = {
    ...km,
    nodes,
    edges,
    groups: Array.isArray(km.groups) ? km.groups : [...new Set(nodes.map((node) => node.curriculumGroup || "Ungrouped"))].sort(),
    reachability,
    validation: km.validation || {
      questionNamesJSON: nodes.length,
      questionNumbersJSON: nodes.length,
      topicNumbersDiagnosticTool: nodes.length,
      mismatches: []
    }
  };
  normalised.dictionary = knowledgeMapDictionaryRows(normalised, Array.isArray(km.dictionary) ? km.dictionary : []);
  return normalised;
}

function knowledgeMapDictionaryRows(km, sourceRows = []) {
  const rowsByTopicNumber = new Map();
  sourceRows.forEach((row) => {
    const number = Number(row.TopicNumbersDiagnosticTool ?? row.topic_number ?? row.id);
    if (Number.isFinite(number)) rowsByTopicNumber.set(number, row);
  });
  return km.nodes.map((node) => {
    const topicNumber = Number(node.id);
    const row = rowsByTopicNumber.get(topicNumber) || sourceRows[topicNumber - 1] || {};
    return {
      TopicName: row.TopicName || node.topicName || "",
      QuestionNamesJSON: row.QuestionNamesJSON || node.questionName || "",
      TopicNumbersDiagnosticTool: Number.isFinite(topicNumber) ? topicNumber : row.TopicNumbersDiagnosticTool,
      ImmediateInNodes: nodeIdListText(km.reachability?.inAdj?.[node.id]),
      ImmediateOutNodes: nodeIdListText(km.reachability?.outAdj?.[node.id]),
      AllInNodes: nodeIdListText(km.reachability?.in?.[node.id]),
      AllOutNodes: nodeIdListText(km.reachability?.out?.[node.id]),
      curriculumGroup: row.curriculumGroup || node.curriculumGroup || "Ungrouped"
    };
  });
}

function normaliseRDatasets(datasets) {
  return {
    allRows: Number(datasets.allRows || 0),
    rows: Array.isArray(datasets.rows) ? datasets.rows : [],
    removedEmptyFirstQuestion: Number(datasets.removedEmptyFirstQuestion || 0),
    previewRows: Number(datasets.previewRows || 0),
    attemptedQuestionCounts: Array.isArray(datasets.attemptedQuestionCounts) ? datasets.attemptedQuestionCounts : [],
    attemptedQuestionCountsSelected: Array.isArray(datasets.attemptedQuestionCountsSelected) ? datasets.attemptedQuestionCountsSelected : []
  };
}

function normaliseRImplied(implied) {
  const columnRows = implied.impliedColumnRows || {};
  const fullyImpliedRows = Array.isArray(implied.fullyImpliedRows)
    ? implied.fullyImpliedRows
    : Array.from({ length: Number(implied.fullyImpliedRowCount || 0) });
  const rawMatrix = normaliseMatrixPayload(implied.rawMatrix);
  const impliedMatrix = normaliseMatrixPayload(implied.impliedMatrix);
  const rows = Array.isArray(implied.rows) ? implied.rows : [];
  return {
    ...implied,
    allRows: Array.isArray(implied.allRows) ? implied.allRows : rows,
    rows,
    fullyImpliedRows,
    df4: Array.isArray(implied.df4) ? implied.df4 : [],
    impliedMatrix,
    rawMatrix,
    impliedRemovedColumns: Array.isArray(implied.impliedRemovedColumns) ? implied.impliedRemovedColumns : [],
    rawRemovedColumns: Array.isArray(implied.rawRemovedColumns) ? implied.rawRemovedColumns : [],
    impliedColumnRows: (kind) => kind === "raw" ? (columnRows.raw || []) : (columnRows.implied || [])
  };
}

function normaliseMatrixPayload(matrix) {
  const rows = Array.isArray(matrix?.rows) ? matrix.rows : [];
  const columns = Array.isArray(matrix?.columns) ? matrix.columns : [];
  const rowCount = Number.isFinite(Number(matrix?.rowCount)) ? Number(matrix.rowCount) : rows.length;
  return { ...(matrix || {}), columns, rows, rowCount };
}

function matrixRowCount(matrix) {
  return Number.isFinite(Number(matrix?.rowCount)) ? Number(matrix.rowCount) : (matrix?.rows?.length || 0);
}

function matrixHasRows(matrix) {
  return Array.isArray(matrix?.rows) && matrix.rows.length > 0;
}

function attemptInputsForR() {
  const setup = setupPayload({ embedFiles: false });
  const paths = splitPathLines(setup.filePaths?.attemptData || []);
  const embeddedCount = state.attemptSources.filter((source) => source.text || source.raw).length;
  const stagedCount = (state.stagedSources.attempts || []).length;
  const metadataCount = Array.isArray(setup.files?.attemptFiles) ? setup.files.attemptFiles.length : 0;
  return {
    paths,
    count: Math.max(paths.length, embeddedCount, stagedCount, metadataCount)
  };
}

function hasAttemptInputsForR() {
  return attemptInputsForR().count > 0;
}

function countAttemptInputsForR() {
  return attemptInputsForR().count;
}

async function saveSetup() {
  await withLoading("Saving setup", async () => {
    const payload = compactSetupPayload(setupPayload({ embedFiles: false }));
    localStorage.setItem(SETUP_CACHE_KEY, JSON.stringify(payload));
    markSetupClean();
  }, "Saving setup metadata only.");
}

async function downloadSetup() {
  await withLoading("Preparing setup download", async () => {
    const payload = compactSetupPayload(setupPayload({ embedFiles: false }));
    localStorage.setItem(SETUP_CACHE_KEY, JSON.stringify(payload));
    downloadFile("diagnostic_tool_setup.json", "application/json", setupDownloadContent(payload));
  }, "Creating setup JSON from full source paths and parameters.");
}

function sourcePathUsable(source) {
  return Boolean(source && (isUsableFilePath(source.path) || isUsableFilePath(source.windowsPath)));
}

function setupWindowsPathFor(path, windowsPath = "") {
  const cleanWindowsPath = String(windowsPath || "").trim();
  if (isUsableFilePath(cleanWindowsPath)) return cleanWindowsPath;
  const cleanPath = String(path || "").trim();
  if (!isUsableFilePath(cleanPath)) return "";
  const wslPath = linuxPathToWslUnc(cleanPath);
  if (wslPath) return wslPath;
  if (/^[A-Za-z]:[\\/]/.test(cleanPath) || isWslUncPath(cleanPath)) return cleanPath;
  return "";
}

function setupDownloadContent(payload) {
  return JSON.stringify(payload, null, 2);
}

function embeddedItemText(item) {
  if (!item) return "";
  if (typeof item.text === "string") return item.text;
  if (item.json !== undefined) return JSON.stringify(item.json);
  return "";
}

async function setupPayloadWithResolvedPaths(payload, options = {}) {
  const preferState = options.preferState !== false;
  const includeEmbedded = Boolean(options.includeEmbedded);
  applySetupPathsToState(payload);
  return preferState && currentSetupHasFileIdentity() ? setupPayload({ embedFiles: includeEmbedded }) : compactSetupPayload(payload);
}

function compactSetupPayload(payload) {
  const copy = JSON.parse(JSON.stringify(payload || {}));
  delete copy.pathResolution;
  if (copy.files && Array.isArray(copy.files.attemptFiles)) {
    copy.files.attemptFiles = copy.files.attemptFiles.map((file) => ({
      label: file.label || "",
      fileName: file.fileName || "",
      path: file.path || "",
      windowsPath: file.windowsPath || linuxPathToWslUnc(file.path)
    }));
  }
  const filePaths = copy.filePaths || {};
  const windowsAttemptPaths = splitPathLines(copy.windowsFilePaths?.attemptData || [])
    .concat(splitPathLines(filePaths.attemptData || []).map(linuxPathToWslUnc))
    .filter(Boolean);
  copy.windowsFilePaths = {
    attemptData: uniqueStrings(windowsAttemptPaths),
    exam: copy.windowsFilePaths?.exam || linuxPathToWslUnc(filePaths.exam),
    gexf: copy.windowsFilePaths?.gexf || linuxPathToWslUnc(filePaths.gexf)
  };
  return copy;
}

function currentSetupHasFileIdentity() {
  return Boolean(
    state.stagedSources.exam ||
    state.stagedSources.gexf ||
    state.stagedSources.attempts.length ||
    state.exam ||
    state.gexf ||
    state.attemptSources.length ||
    splitPathLines(state.config.filePaths.attemptData).length ||
    state.config.filePaths.exam ||
    state.config.filePaths.gexf
  );
}

function currentSetupHasLoadedFileContents() {
  return Boolean(
    state.exam?.text ||
    state.exam?.data ||
    state.gexf?.text ||
    state.attemptSources.some((source) => source.text || source.raw)
  );
}

function setupHasResolvablePathGaps(payload) {
  const filePaths = payload.filePaths || {};
  const windowsFilePaths = payload.windowsFilePaths || {};
  const files = payload.files || {};
  const attemptPaths = splitPathLines(filePaths.attemptData || windowsFilePaths.attemptData || []);
  const attemptFiles = Array.isArray(files.attemptFiles) ? files.attemptFiles : [];
  const missingAttempts = attemptFiles.some((file, index) => {
    const hasFileIdentity = cleanLabel(file.fileName || file.path || file.windowsPath || attemptPaths[index]) !== "";
    const hasPath = isUsableFilePath(cleanLabel(file.path || file.windowsPath || attemptPaths[index]));
    return hasFileIdentity && !hasPath;
  });
  return Boolean(
    missingAttempts ||
    (files.examFileName && !isUsableFilePath(filePaths.exam || windowsFilePaths.exam)) ||
    (files.gexfFileName && !isUsableFilePath(filePaths.gexf || windowsFilePaths.gexf))
  );
}

async function resolveSetupPaths(payload) {
  return { ok: true, setup: payload };
}

function applySetupPathsToState(setup) {
  const filePaths = setup.filePaths || {};
  const windowsFilePaths = setup.windowsFilePaths || {};
  const attemptPaths = splitPathLines(filePaths.attemptData || windowsFilePaths.attemptData || []).filter(isUsableFilePath);
  const attemptFiles = Array.isArray(setup.files?.attemptFiles) ? setup.files.attemptFiles : [];
  const examPath = isUsableFilePath(filePaths.exam) ? filePaths.exam : (isUsableFilePath(windowsFilePaths.exam) ? windowsFilePaths.exam : "");
  const gexfPath = isUsableFilePath(filePaths.gexf) ? filePaths.gexf : (isUsableFilePath(windowsFilePaths.gexf) ? windowsFilePaths.gexf : "");

  state.config.filePaths = {
    ...state.config.filePaths,
    attemptData: pathLinesFromSetup(attemptPaths),
    exam: examPath || state.config.filePaths.exam || "",
    gexf: gexfPath || state.config.filePaths.gexf || ""
  };

  if (state.exam && examPath) {
    state.exam.path = examPath;
  }
  if (state.gexf && gexfPath) {
    state.gexf.path = gexfPath;
  }

  state.attemptSources.forEach((source, index) => {
    const matchingFile = attemptFiles.find((file) => (
      (file.label && file.label === source.label) ||
      (file.fileName && file.fileName === source.fileName)
    ));
    const path = matchingFile?.path || matchingFile?.windowsPath || attemptPaths[index] || source.path || "";
    if (path) source.path = path;
  });
}

async function uploadSetup(file) {
  try {
    const setup = JSON.parse(await readFileText(file, "Reading setup file", 1, 1));
    setLoading("");
    state.pendingSetupUpload = setup;
    showSetupPreview(setup);
  } catch (error) {
    setLoading("");
    alert(`Could not upload setup: ${error.message}`);
  }
}

async function confirmSetupUpload() {
  const setup = state.pendingSetupUpload;
  if (!setup) return;
  closeSetupPreview();
  try {
    await withLoading("Staging setup", async () => {
      const setupToLoad = setup;
      resetImportedSourceData();
      applySetupConfig(setupToLoad);
      stageSourcesFromSetup(setupToLoad);
      const setupMessage = "Setup paths and parameters staged. Click Import Sources to load the staged source paths, then choose an enabled build button.";
      resetImportStatus(setupMessage);
      localStorage.setItem(SETUP_CACHE_KEY, JSON.stringify(setupPayload({ embedFiles: false })));
      markSetupClean();
      renderAll();
    }, "Staging filenames, paths, and analysis parameters from the uploaded setup JSON.");
  } catch (error) {
    alert(`Could not stage setup: ${error.message}`);
  }
}

function stageSourcesFromSetup(setup) {
  const filePaths = setup.filePaths || {};
  const windowsFilePaths = setup.windowsFilePaths || {};
  const files = setup.files || {};
  const attemptPaths = splitPathLines(filePaths.attemptData || windowsFilePaths.attemptData || []);
  const windowsAttemptPaths = splitPathLines(windowsFilePaths.attemptData || []);
  const attemptFiles = Array.isArray(files.attemptFiles) ? files.attemptFiles : [];
  const attemptCount = Math.max(attemptPaths.length, windowsAttemptPaths.length, attemptFiles.length);
  state.stagedSources = {
    exam: stageFileReference(files.examFileName, filePaths.exam, windowsFilePaths.exam),
    gexf: stageFileReference(files.gexfFileName, filePaths.gexf, windowsFilePaths.gexf),
    attempts: Array.from({ length: attemptCount }, (_, index) => {
      const file = attemptFiles[index] || {};
      const path = attemptPaths[index] || file.path || "";
      const windowsPath = file.windowsPath || windowsAttemptPaths[index] || linuxPathToWslUnc(path);
      return {
        label: file.label || `data_source_${index + 1}`,
        fileName: file.fileName || fileNameFromPath(windowsPath || path),
        path,
        windowsPath
      };
    }),
    embeddedSetup: null
  };
}

function markSetupReferenceNeedsReselect(source, setup) {
  return source ? { ...source, needsReselect: !setupHasEmbeddedFiles(setup) } : null;
}

function stageFileReference(fileName, path, windowsPath = "") {
  const cleanPath = String(path || windowsPath || "").trim();
  const cleanWindowsPath = windowsPath || linuxPathToWslUnc(cleanPath);
  const cleanName = fileName || fileNameFromPath(cleanWindowsPath || cleanPath);
  return cleanName || cleanPath || cleanWindowsPath ? { fileName: cleanName, path: cleanPath, windowsPath: cleanWindowsPath } : null;
}

function closeSetupPreview() {
  state.pendingSetupUpload = null;
  document.getElementById("setupPreviewModal").hidden = true;
  document.getElementById("setupPreviewHost").replaceChildren();
  setSetupPreviewMode("upload");
}

function showSetupPreview(setup) {
  setSetupPreviewMode("upload");
  const host = document.getElementById("setupPreviewHost");
  host.replaceChildren(
    panel("Setup Preview", "Review the setup file before loading its paths and parameters.", [
      createTable(setupPreviewRows(setup), ["field", "value"]),
      el("article", { class: "card notice warn" }, [
        el("h3", {}, "Files to load"),
        createTable(setupFilePreviewRows(setup), ["kind", "path"])
      ])
    ])
  );
  document.getElementById("setupPreviewModal").hidden = false;
}

function showStagedSourcePreview(kind) {
  setSetupPreviewMode("staged");
  const host = document.getElementById("setupPreviewHost");
  const rows = stagedPreviewRows(kind);
  host.replaceChildren(
    panel(stagedPreviewTitle(kind), "Currently staged source metadata. Source contents are not stored in setup JSON.", [
      rows.length ? createTable(rows, ["kind", "fileName", "path", "status"]) : el("p", { class: "muted" }, "No source is staged for this input.")
    ])
  );
  document.getElementById("setupPreviewModal").hidden = false;
}

function setSetupPreviewMode(mode) {
  const confirmButton = document.getElementById("confirmUploadSetupButton");
  const cancelButton = document.getElementById("cancelUploadSetupButton");
  const title = document.querySelector("#setupPreviewModal .modal-bar strong");
  if (title) title.textContent = mode === "staged" ? "Staged Source Preview" : "Upload Setup Preview";
  if (confirmButton) {
    confirmButton.hidden = mode === "staged";
    confirmButton.disabled = false;
    confirmButton.textContent = "Stage Setup";
  }
  if (cancelButton) cancelButton.textContent = mode === "staged" ? "Close" : "Cancel";
}

function stagedPreviewTitle(kind) {
  return {
    attempts: "Attempt Data Sources",
    exam: "Numbas Diagnostic Exam",
    gexf: "Optional GEXF Knowledge Map"
  }[kind] || "Staged Sources";
}

function stagedPreviewRows(kind) {
  if (kind === "attempts") {
    const staged = state.stagedSources.attempts.length ? state.stagedSources.attempts : state.attemptSources;
    return staged.map((source, index) => ({
      kind: `Attempt data ${index + 1}`,
      fileName: source.fileName || "",
      path: stagedSourcePathText(source),
      status: source.raw ? "imported" : (source.error || "path staged")
    }));
  }
  const source = kind === "exam" ? (state.stagedSources.exam || state.exam) : (state.stagedSources.gexf || state.gexf);
  if (!source) return [];
  return [{
    kind: kind === "exam" ? "Numbas exam" : "GEXF knowledge map",
    fileName: source.fileName || source.name || "",
    path: stagedSourcePathText(source),
    status: source.data || source.nodes ? "imported" : "path staged"
  }];
}

function stagedSourcePathText(source) {
  if (source?.file) return "Browser-selected file (current session only)";
  return source?.path
    || source?.windowsPath
    || (source?.fileName ? "No path provided" : "");
}

function setupPreviewRows(setup) {
  const config = setup.config || {};
  return [
    { field: "Score threshold", value: config.questionThreshold ?? "" },
    { field: "setNumOfAttempts", value: config.setNumOfAttempts ?? "" },
    { field: "Minimum implied scores", value: config.minimumNumberOfImpliedScores ?? "" },
    { field: "Exclude previewuser rows", value: config.excludePreviewUsers ? "yes" : "no" }
  ];
}

function setupFilePreviewRows(setup) {
  const filePaths = setup.filePaths || {};
  const windowsFilePaths = setup.windowsFilePaths || {};
  const embedded = setup.embeddedFiles || {};
  const rows = [];
  const attemptPaths = splitPathLines(filePaths.attemptData || setup.attemptDataPaths || []);
  const windowsAttemptPaths = splitPathLines(windowsFilePaths.attemptData || []);
  const attemptFiles = Array.isArray(setup.files?.attemptFiles) ? setup.files.attemptFiles : [];
  const attemptCount = Math.max(attemptPaths.length, windowsAttemptPaths.length, attemptFiles.length);
  Array.from({ length: attemptCount }, (_, index) => {
    const file = attemptFiles[index] || {};
    rows.push({ kind: `Attempt data ${index + 1}`, path: file.path || attemptPaths[index] || file.windowsPath || windowsAttemptPaths[index] || file.fileName || "" });
  });
  (embedded.attemptData || []).forEach((item, index) => {
    if (!rows.some((row) => row.kind === `Attempt data ${index + 1}`)) {
      rows.push({ kind: `Attempt data ${index + 1}`, path: item.path || item.windowsPath || `${item.fileName || "embedded attempt data"} (embedded)` });
    }
  });
  rows.push({ kind: "Numbas exam", path: filePaths.exam || setup.examPath || windowsFilePaths.exam || "" });
  rows.push({ kind: "GEXF knowledge map", path: filePaths.gexf || setup.gexfPath || windowsFilePaths.gexf || "" });
  if ((embedded.exam?.text || embedded.exam?.json !== undefined) && !rows.some((row) => row.kind === "Numbas exam" && row.path)) {
    rows.push({ kind: "Numbas exam", path: `${embedded.exam.fileName || "embedded exam"} (embedded)` });
  }
  if (embedded.gexf?.text && !rows.some((row) => row.kind === "GEXF knowledge map" && row.path)) {
    rows.push({ kind: "GEXF knowledge map", path: `${embedded.gexf.fileName || "embedded GEXF"} (embedded)` });
  }
  return rows.filter((row) => row.path !== "");
}

function applySetupConfig(setup) {
  const config = setup.config || {};
  const {
    questionScoreStart,
    firstQuestionNumber,
    rawColumnStart,
    rawColumnEnd,
    ...supportedConfig
  } = config;
  const filePaths = setup.filePaths || {};
  const windowsFilePaths = setup.windowsFilePaths || {};
  state.config = {
    ...state.config,
    ...supportedConfig,
    filePaths: {
      attemptData: pathLinesFromSetup(filePaths.attemptData ?? setup.attemptDataPaths ?? windowsFilePaths.attemptData ?? ""),
      exam: filePaths.exam ?? setup.examPath ?? windowsFilePaths.exam ?? state.config.filePaths.exam ?? "",
      gexf: filePaths.gexf ?? setup.gexfPath ?? windowsFilePaths.gexf ?? state.config.filePaths.gexf ?? ""
    }
  };
  saveConfig();
}

async function loadFilesFromCurrentSetup() {
  await loadFilesFromSetup(setupPayload(), { includeAttemptText: false });
}

async function loadFilesFromSetup(setup, options = {}) {
  if (setupHasEmbeddedFiles(setup)) {
    applyEmbeddedSetupFiles(setup);
    return;
  }
  throw new Error("Setup files restore source paths and parameters. Click Import Sources to load the staged paths, then choose an enabled build button.");
}

function setupHasEmbeddedFiles(setup) {
  const embedded = setup.embeddedFiles || {};
  return Boolean(
    embedded.exam?.text ||
    embedded.exam?.json !== undefined ||
    embedded.gexf?.text ||
    (Array.isArray(embedded.attemptData) && embedded.attemptData.some((item) => item?.text || item?.json !== undefined))
  );
}

function applyEmbeddedSetupFiles(setup) {
  const embedded = setup.embeddedFiles || {};
  const filePaths = setup.filePaths || {};
  const windowsFilePaths = setup.windowsFilePaths || {};
  const files = setup.files || {};
  const attemptPaths = splitPathLines(filePaths.attemptData || windowsFilePaths.attemptData || []);
  const errors = [];

  state.exam = null;
  state.gexf = null;
  state.attemptSources = [];

  if (embedded.exam?.text || embedded.exam?.json !== undefined) {
    try {
      const path = canonicalSetupPath(embedded.exam.path || embedded.exam.windowsPath || filePaths.exam || windowsFilePaths.exam || "");
      const text = embeddedItemText(embedded.exam);
      state.exam = {
        name: embedded.exam.fileName || files.examFileName || fileNameFromPath(path),
        path,
        text,
        data: parseNumbasExam(text)
      };
      state.km = null;
    } catch (error) {
      errors.push(`Exam: ${error.message}`);
    }
  }

  (embedded.attemptData || []).forEach((item, index) => {
    const path = canonicalSetupPath(item.path || item.windowsPath || attemptPaths[index] || "");
    const label = item.label || `data_source_${index + 1}`;
    const fileName = item.fileName || fileNameFromPath(path);
    try {
      const text = embeddedItemText(item);
      const raw = JSON.parse(text);
      state.attemptSources.push({
        label,
        fileName,
        path,
        text,
        raw,
        attemptCount: Array.isArray(raw.attempts) ? raw.attempts.length : 0,
        attempts: [],
        error: ""
      });
    } catch (error) {
      errors.push(`Attempt data ${label}: ${error.message}`);
      state.attemptSources.push({
        label,
        fileName,
        path,
        text: embeddedItemText(item),
        raw: null,
        attemptCount: 0,
        attempts: [],
        error: error.message
      });
    }
  });

  if (embedded.gexf?.text) {
    try {
      const path = canonicalSetupPath(embedded.gexf.path || embedded.gexf.windowsPath || filePaths.gexf || windowsFilePaths.gexf || "");
      state.gexf = parseGexf(embedded.gexf.text, embedded.gexf.fileName || files.gexfFileName || fileNameFromPath(path));
      state.gexf.path = path;
      state.gexf.text = embedded.gexf.text;
    } catch (error) {
      errors.push(`GEXF: ${error.message}`);
    }
  }

  state.attempts = [];
  state.validation = null;
  state.datasets = null;
  state.implied = null;
  state.curriculum = null;
  state.rasch = null;
  state.tracker = defaultTrackerState();

  if (errors.length) {
    alert(`Setup loaded with issues:\n\n${errors.join("\n")}`);
  }
}

function applyLoadedSetupFiles(payload) {
  const errors = [];

  if (payload.exam) {
    if (payload.exam.ok) {
      const exam = parseNumbasExam(payload.exam.text);
      state.exam = {
        name: payload.exam.fileName,
        path: payload.exam.path,
        text: payload.exam.text,
        data: exam
      };
      state.km = null;
    } else {
      errors.push(`Exam: ${payload.exam.path} (${payload.exam.error})`);
    }
  }

  state.attemptSources = [];
  (payload.attempts || []).forEach((item, index) => {
    if (!item.ok) {
      errors.push(`Attempt data: ${item.path} (${item.error})`);
      state.attemptSources.push({
        label: `data_source_${index + 1}`,
        fileName: item.fileName || item.path || "",
        path: item.path || "",
        raw: null,
        attemptCount: 0,
        attempts: [],
        error: item.error || "File could not be read."
      });
      return;
    }
    if (typeof item.text !== "string") {
      state.attemptSources.push({
        label: `data_source_${index + 1}`,
        fileName: item.fileName,
        path: item.path,
        resolvedPath: item.resolvedPath || "",
        raw: null,
        attemptCount: "",
        attempts: [],
        error: "staged for R import"
      });
      return;
    }
    try {
      const raw = JSON.parse(item.text);
      state.attemptSources.push({
        label: `data_source_${index + 1}`,
        fileName: item.fileName,
        path: item.path,
        text: item.text,
        raw,
        attemptCount: Array.isArray(raw.attempts) ? raw.attempts.length : 0,
        attempts: [],
        error: ""
      });
    } catch (error) {
      errors.push(`Attempt data: ${item.path} (${error.message})`);
    }
  });

  if (payload.gexf) {
    if (payload.gexf.ok) {
      state.gexf = parseGexf(payload.gexf.text, payload.gexf.fileName);
      state.gexf.path = payload.gexf.path;
      state.gexf.text = payload.gexf.text;
    } else {
      errors.push(`GEXF: ${payload.gexf.path} (${payload.gexf.error})`);
      state.gexf = null;
    }
  } else if (!state.stagedSources.gexf) {
    state.gexf = null;
  }

  state.attempts = [];
  state.validation = null;

  state.datasets = null;
  state.implied = null;
  state.curriculum = null;
  state.rasch = null;
  state.tracker = defaultTrackerState();

  if (errors.length) {
    alert(`Setup loaded with issues:\n\n${errors.join("\n")}`);
  }
}

function splitPathLines(value) {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") return item.path || item.windowsPath || "";
      return "";
    }).map((item) => item.trim()).filter(Boolean);
  }
  return splitSourcePathText(value);
}

function splitSourcePathText(value) {
  const text = String(value || "").trim();
  if (!text) return [];
  return text
    .split(/\r?\n|,\s*(?=(?:[A-Za-z]:[\\/]|\\\\|\/\/|\/))/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function pathLinesFromSetup(value) {
  return splitPathLines(value).join("\n");
}

function linuxPathToWslUnc(path) {
  const cleanPath = String(path || "").trim();
  if (isWslUncPath(cleanPath)) return cleanPath.replace(/\\/g, "/");
  const linuxPath = wslUncToLinuxPath(cleanPath) || cleanPath;
  if (!linuxPath.startsWith("/")) return "";
  return `//wsl$/Ubuntu${linuxPath}`;
}

function canonicalSetupPath(path) {
  const cleanPath = String(path || "").trim();
  return wslUncToLinuxPath(cleanPath) || cleanPath;
}

function wslUncToLinuxPath(path) {
  const normalised = String(path || "").trim().replace(/\\/g, "/");
  const match = normalised.match(/^\/\/wsl(?:\$|\.localhost)\/[^/]+(\/.*)$/i);
  return match ? match[1] : "";
}

function isWslUncPath(path) {
  return Boolean(wslUncToLinuxPath(path));
}

function isUsableFilePath(path) {
  const cleanPath = String(path || "").trim();
  return cleanPath !== "" && !/fakepath|^browser-selected file:/i.test(cleanPath);
}

function fileNameFromPath(path) {
  return String(path || "").split(/[\\/]/).filter(Boolean).pop() || "";
}

function downloadWorkspace() {
  const payload = {
    config: state.config,
    exam: state.exam ? { name: state.exam.name } : null,
    gexf: state.gexf ? { name: state.gexf.name } : null,
    attemptSources: sourceRows(),
    kmDictionary: state.km?.dictionary || [],
    datasets: state.datasets ? {
      rows: state.datasets.rows.length,
      attemptedQuestionCounts: state.datasets.attemptedQuestionCounts
    } : null,
    implied: state.implied ? {
      rawColumns: state.implied.rawMatrix.columns,
      impliedColumns: state.implied.impliedMatrix.columns
    } : null,
    curriculum: state.curriculum
  };
  downloadFile("diagnostic_tool_workspace_summary.json", "application/json", JSON.stringify(payload, null, 2));
}

function downloadRows(fileName, rows) {
  if (!rows.length) return;
  downloadFile(fileName, "text/csv", rowsToCsv(rows, Object.keys(rows[0])));
}

function downloadMatrix(fileName, matrix) {
  const rows = matrix.rows.map((row) => Object.fromEntries(matrix.columns.map((column, index) => [column, row[index]])));
  downloadRows(fileName, rows);
}

function panel(title, subtitle, children) {
  return el("section", { class: "section-panel" }, [
    heading(title, subtitle),
    ...children
  ]);
}

function emptyPanel(title, message) {
  return panel(title, "", [el("div", { class: "empty-state" }, message)]);
}

function heading(title, subtitle = "") {
  return el("div", { class: "panel-heading" }, [
    el("div", {}, [
      el("h2", {}, title),
      subtitle ? el("p", {}, subtitle) : ""
    ])
  ]);
}

function field(labelText, control, className = "") {
  return el("label", { class: className ? `field-row ${className}` : "field-row" }, [
    el("span", {}, labelText),
    control
  ]);
}

function compactParamField(labelText, control) {
  return el("label", { class: "field-row compact-param-field" }, [
    el("span", {}, labelText),
    control
  ]);
}

function sourceStagingControl(labelText, previewKind) {
  return el("div", { class: "field-row source-stage-row" }, [
    el("span", {}, labelText),
    el("div", { class: "source-path-line" }, [
      sourcePathEditor(previewKind),
      sourceFilePicker(previewKind),
      actionButton("Preview staged", () => showStagedSourcePreview(previewKind), false, "secondary-action preview-stage-button")
    ])
  ]);
}

function sourcePathEditor(kind) {
  const attrs = {
    class: "source-path-input",
    spellcheck: "false",
    placeholder: kind === "attempts" ? "One full path or URL per line" : "Full path or URL including filename"
  };
  if (kind === "attempts") {
    return committedTextArea(sourcePathEditorValue(kind), (value) => stageSourcesFromPathText(kind, value), { ...attrs, rows: "2" });
  }
  return committedTextInput(sourcePathEditorValue(kind), (value) => stageSourcesFromPathText(kind, value), attrs);
}

function sourceFilePicker(kind) {
  const inputAttrs = {
    type: "file",
    hidden: true,
    "data-source-file-kind": kind
  };
  if (kind === "attempts") {
    inputAttrs.multiple = true;
    inputAttrs.accept = ".json,application/json";
  } else if (kind === "exam") {
    inputAttrs.accept = ".exam";
  } else if (kind === "gexf") {
    inputAttrs.accept = ".gexf,.xml,application/xml,text/xml";
  }
  const inputNode = el("input", inputAttrs);
  const label = kind === "attempts" ? "Choose file(s)" : "Choose file";
  const button = actionButton(label, () => inputNode.click(), false, "secondary-action source-file-button");
  inputNode.addEventListener("change", () => {
    stageSourcesFromFiles(kind, inputNode.files);
    inputNode.value = "";
  });
  return el("span", { class: "source-file-picker" }, [button, inputNode]);
}

function committedTextInput(value, onCommit, attrs = {}) {
  const node = el("input", { type: "text", value: value ?? "", ...attrs });
  let lastCommitted = String(value ?? "");
  const commit = () => {
    if (node.value === lastCommitted) return;
    lastCommitted = node.value;
    onCommit(node.value);
  };
  node.addEventListener("change", commit);
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      node.blur();
    }
  });
  return node;
}

function committedTextArea(value, onCommit, attrs = {}) {
  const node = el("textarea", attrs, value ?? "");
  let lastCommitted = String(value ?? "");
  node.addEventListener("change", () => {
    if (node.value === lastCommitted) return;
    lastCommitted = node.value;
    onCommit(node.value);
  });
  return node;
}

function sourcePathEditorValue(kind) {
  if (kind === "attempts") return state.config.filePaths.attemptData || "";
  return state.config.filePaths[kind] || "";
}

function stageSourcesFromPathText(kind, value) {
  state.stagedSources.embeddedSetup = null;
  if (kind === "attempts") {
    state.config.filePaths.attemptData = value;
    const paths = splitSourcePathText(value);
    state.stagedSources.attempts = paths.map((path, index) => ({
      label: `data_source_${index + 1}`,
      fileName: fileNameFromPath(path),
      path: String(path || "").trim(),
      windowsPath: setupWindowsPathFor(path)
    }));
  } else {
    state.config.filePaths[kind] = value;
    const cleanPath = String(value || "").trim();
    const staged = cleanPath ? stageFileReference("", cleanPath, setupWindowsPathFor(cleanPath)) : null;
    if (kind === "exam") state.stagedSources.exam = staged;
    if (kind === "gexf") state.stagedSources.gexf = staged;
  }
  resetImportedSourceData();
  resetImportStatus("Source paths changed. Click Import Sources to load the staged paths, then choose an enabled build button.");
  state.setupDirty = true;
  updateSaveSetupButton();
  renderAll();
}

function stageSourcesFromFiles(kind, fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  state.stagedSources.embeddedSetup = null;
  if (kind === "attempts") {
    state.config.filePaths.attemptData = files.map((file) => `Browser-selected file: ${file.name}`).join("\n");
    state.stagedSources.attempts = files.map((file, index) => ({
      label: `data_source_${index + 1}`,
      fileName: file.name,
      path: "",
      windowsPath: "",
      file,
      size: file.size,
      lastModified: file.lastModified
    }));
  } else {
    const file = files[0];
    state.config.filePaths[kind] = `Browser-selected file: ${file.name}`;
    const staged = {
      fileName: file.name,
      path: "",
      windowsPath: "",
      file,
      size: file.size,
      lastModified: file.lastModified
    };
    if (kind === "exam") state.stagedSources.exam = staged;
    if (kind === "gexf") state.stagedSources.gexf = staged;
  }
  resetImportedSourceData();
  resetImportStatus("Browser file(s) staged for this session. Click Import Sources, then choose an enabled build button. Save/Download Setup cannot preserve browser-selected file handles.");
  state.setupDirty = true;
  updateSaveSetupButton();
  renderAll();
}

function metric(value, label) {
  return el("div", { class: "metric" }, [
    el("strong", {}, valueText(value)),
    el("span", {}, label)
  ]);
}

function pill(text) {
  return el("span", { class: "pill" }, text);
}

function input(type, value, onInput, attrs = {}) {
  const node = el("input", { type, value: value ?? "", ...attrs });
  node.addEventListener("input", () => onInput(node.value));
  return node;
}

function textArea(value, onInput, attrs = {}) {
  const node = el("textarea", attrs, value ?? "");
  node.addEventListener("input", () => onInput(node.value));
  return node;
}

function numberInput(value, min, step, onInput) {
  const initialValue = value ?? "";
  const node = el("input", { type: "number", value: initialValue, min, step });
  let lastCommitted = String(initialValue);
  const commit = () => {
    const raw = String(node.value ?? "").trim();
    if (raw === "") {
      node.value = lastCommitted;
      return;
    }
    const number = Number(raw);
    if (!Number.isFinite(number)) {
      node.value = lastCommitted;
      return;
    }
    lastCommitted = raw;
    onInput(number);
  };
  node.addEventListener("change", commit);
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      node.blur();
    }
  });
  return node;
}

function checkbox(checked, onChange) {
  const node = el("input", { type: "checkbox" });
  node.checked = Boolean(checked);
  node.addEventListener("change", () => onChange(node.checked));
  return node;
}

function select(options, value, onChange) {
  const node = el("select");
  options.forEach(([optionValue, label]) => {
    node.appendChild(el("option", { value: optionValue }, label));
  });
  node.value = value;
  node.addEventListener("change", () => onChange(node.value));
  return node;
}

function readFileText(file, label, fileIndex, fileCount, options = {}) {
  const clearLoading = options.clearLoading !== false;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const finish = (callback) => {
      if (clearLoading) setLoading("");
      callback();
    };
    reader.addEventListener("loadstart", () => {
      setLoading(label, `${file.name}: file ${fileIndex} of ${fileCount}, 0% read`);
    });
    reader.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        updateLoadingDetail(`${file.name}: file ${fileIndex} of ${fileCount}, ${percent}% read`);
      } else {
        updateLoadingDetail(`${file.name}: file ${fileIndex} of ${fileCount}, ${formatBytes(event.loaded)} read`);
      }
    });
    reader.addEventListener("load", () => {
      updateLoadingDetail(`${file.name}: file ${fileIndex} of ${fileCount}, 100% read`);
      finish(() => resolve(String(reader.result || "")));
    });
    reader.addEventListener("error", () => {
      finish(() => reject(reader.error || new Error(`Could not read ${file.name}.`)));
    });
    reader.addEventListener("abort", () => {
      finish(() => reject(new Error(`Reading ${file.name} was cancelled.`)));
    });
    reader.readAsText(file);
  });
}

function actionButton(label, onClick, disabled = false, className = "") {
  const node = el("button", { type: "button", class: className }, label);
  node.disabled = Boolean(disabled);
  node.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    node.blur();
    try {
      await onClick();
    } catch (error) {
      alert(error.message || String(error));
    }
  });
  return node;
}

function createTable(rows, columns) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeColumns = columns && columns.length ? columns : (safeRows[0] ? Object.keys(safeRows[0]) : []);
  const wrapper = el("div", { class: "table-wrap" });
  const table = el("table");
  const thead = el("thead");
  const tbody = el("tbody");
  let sortKey = "";
  let sortDirection = 1;

  const renderHeader = () => {
    thead.replaceChildren(el("tr", {}, safeColumns.map((column) => {
      const isSorted = sortKey === column;
      const th = el("th", {
        class: columnClassName(column),
        title: isSorted ? (sortDirection === 1 ? "Sorted ascending" : "Sorted descending") : "Sort",
        "aria-sort": isSorted ? (sortDirection === 1 ? "ascending" : "descending") : "none"
      }, [
        el("span", { class: "th-content" }, [
          el("span", {}, columnHeaderLabel(column)),
          el("span", { class: isSorted ? "sort-indicator is-active" : "sort-indicator", "aria-hidden": "true" }, isSorted ? (sortDirection === 1 ? "▲" : "▼") : "↕")
        ])
      ]);
      th.addEventListener("click", () => {
        if (sortKey === column) sortDirection *= -1;
        else {
          sortKey = column;
          sortDirection = 1;
        }
        renderHeader();
        renderBody();
      });
      return th;
    })));
  };

  const renderBody = () => {
    const sorted = safeRows.slice();
    if (sortKey) {
      sorted.sort((a, b) => compareValues(a[sortKey], b[sortKey]) * sortDirection);
    }
    tbody.replaceChildren(...sorted.map((row) => (
      el("tr", {}, safeColumns.map((column) => el("td", { class: columnClassName(column) }, valueText(row[column]))))
    )));
  };

  renderHeader();
  renderBody();
  table.append(thead, tbody);
  wrapper.appendChild(table);
  if (!safeRows.length) {
    wrapper.replaceChildren(el("div", { class: "empty-state" }, "No rows to display."));
  }
  return wrapper;
}

function createPagedTable(rows, columns, options = {}) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeColumns = columns && columns.length ? columns : (safeRows[0] ? Object.keys(safeRows[0]) : []);
  const pageSize = Math.max(1, Number(options.pageSize || 50));
  const wrapper = el("div", { class: "paged-table" });
  const toolbar = el("div", { class: "table-toolbar paged-table-toolbar" });
  const tableWrap = el("div", { class: "table-wrap paged-table-wrap" });
  const table = el("table");
  const thead = el("thead");
  const tbody = el("tbody");
  const pageInfo = el("span", { class: "muted" });
  let sortKey = "";
  let sortDirection = 1;
  let pageIndex = 0;

  const sortedRows = () => {
    const sorted = safeRows.slice();
    if (sortKey) sorted.sort((a, b) => compareValues(a[sortKey], b[sortKey]) * sortDirection);
    return sorted;
  };

  const renderHeader = () => {
    thead.replaceChildren(el("tr", {}, safeColumns.map((column) => {
      const isSorted = sortKey === column;
      const th = el("th", {
        class: columnClassName(column),
        title: isSorted ? (sortDirection === 1 ? "Sorted ascending" : "Sorted descending") : "Sort",
        "aria-sort": isSorted ? (sortDirection === 1 ? "ascending" : "descending") : "none"
      }, [
        el("span", { class: "th-content" }, [
          el("span", {}, columnHeaderLabel(column)),
          el("span", { class: isSorted ? "sort-indicator is-active" : "sort-indicator", "aria-hidden": "true" }, isSorted ? (sortDirection === 1 ? "▲" : "▼") : "↕")
        ])
      ]);
      th.addEventListener("click", () => {
        if (sortKey === column) sortDirection *= -1;
        else {
          sortKey = column;
          sortDirection = 1;
        }
        pageIndex = 0;
        renderHeader();
        renderBody();
      });
      return th;
    })));
  };

  let previousButton;
  let nextButton;
  const renderBody = () => {
    const sorted = sortedRows();
    const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
    pageIndex = Math.min(Math.max(0, pageIndex), pageCount - 1);
    const start = pageIndex * pageSize;
    const pageRows = sorted.slice(start, start + pageSize);
    tbody.replaceChildren(...pageRows.map((row) => (
      el("tr", {}, safeColumns.map((column) => el("td", { class: columnClassName(column) }, valueText(row[column]))))
    )));
    pageInfo.textContent = sorted.length
      ? `Rows ${start + 1}-${start + pageRows.length} of ${sorted.length}`
      : "No rows to display.";
    if (previousButton) previousButton.disabled = pageIndex <= 0;
    if (nextButton) nextButton.disabled = pageIndex >= pageCount - 1;
  };

  previousButton = actionButton("Previous 50", () => {
    pageIndex -= 1;
    renderBody();
  }, true, "secondary-action tiny-button");
  nextButton = actionButton("Next 50", () => {
    pageIndex += 1;
    renderBody();
  }, safeRows.length <= pageSize, "secondary-action tiny-button");

  toolbar.replaceChildren(
    el("div", { class: "button-row" }, [previousButton, nextButton]),
    pageInfo
  );
  renderHeader();
  renderBody();
  table.append(thead, tbody);
  tableWrap.appendChild(table);
  wrapper.append(toolbar, safeRows.length ? tableWrap : el("div", { class: "empty-state" }, "No rows to display."));
  return wrapper;
}

function compareValues(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function columnHeaderLabel(column) {
  return String(column ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .replace(/_SCORE_QUESTIONS\b/g, "_SCORED_QUESTIONS");
}

function columnClassName(column) {
  const safe = columnHeaderLabel(column).toLowerCase().replace(/_/g, "-");
  return safe ? `col-${safe}` : "";
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value === false || value === null || value === undefined) return;
    if (key === "class") node.className = value;
    else if (key === "style") node.setAttribute("style", value);
    else if (key === "readonly") node.readOnly = Boolean(value);
    else node.setAttribute(key, value === true ? "" : String(value));
  });
  appendChildren(node, children);
  return node;
}

function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value === false || value === null || value === undefined) return;
    node.setAttribute(key, String(value));
  });
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];
  list.forEach((child) => {
    if (child === null || child === undefined || child === "") return;
    if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  });
}

function cleanLabel(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function labelMatchKey(value) {
  return cleanLabel(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function uniqueIndexMap(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  const out = new Map();
  values.forEach((value, index) => {
    if (value !== "" && counts.get(value) === 1) out.set(value, index);
  });
  return out;
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function countNonNull(values) {
  return values.filter((value) => value !== null && value !== undefined && !Number.isNaN(Number(value))).length;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (Number.isNaN(number)) return "";
  return number.toFixed(digits);
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAttemptTimestamp(value) {
  if (value === null || value === undefined || value === "") return "";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return valueText(value);
  const millis = numeric > 100000000000 ? numeric : numeric * 1000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return valueText(value);
  return date.toLocaleString();
}

function valueText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(round(value, 4));
  if (Array.isArray(value)) return value.join("; ");
  return String(value);
}

function truncate(value, length) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, Math.max(0, length - 1))}...` : text;
}

function groupColourMap(groups) {
  const map = {};
  groups.forEach((group, index) => {
    map[group] = GROUP_COLOURS[index % GROUP_COLOURS.length];
  });
  return map;
}

function colourWithAlpha(hex, alpha) {
  const value = String(hex || "").replace("#", "");
  const full = value.length === 3
    ? value.split("").map((part) => `${part}${part}`).join("")
    : value;
  const match = full.match(/^[0-9a-fA-F]{6}$/);
  if (!match) return `rgba(122, 138, 150, ${alpha})`;
  const red = parseInt(full.slice(0, 2), 16);
  const green = parseInt(full.slice(2, 4), 16);
  const blue = parseInt(full.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function edgeKey(source, target) {
  return `${cleanLabel(source)}\t${cleanLabel(target)}`;
}

function splitEdgeKey(key) {
  const [source, target] = key.split("\t");
  return { source, target };
}

function rowsToCsv(rows, columns) {
  const csvValueText = (value) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
    if (Array.isArray(value)) return value.join("; ");
    return String(value);
  };
  const escape = (value) => {
    const text = csvValueText(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.map(escape).join(",")]
    .concat(rows.map((row) => columns.map((column) => escape(row[column])).join(",")))
    .join("\n");
}

function downloadFileParts(fileName, mime, parts) {
  const blob = new Blob(parts, { type: mime });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: fileName });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadFile(fileName, mime, content) {
  downloadFileParts(fileName, mime, [content]);
}
