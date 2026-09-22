const STORAGE_KEY = "hours-pilot-v1";
const CSV_FILE_NAME = "hours-pilot-entries.csv";
const CSV_HANDLE_DB = "hours-pilot-csv-db";
const CSV_HANDLE_STORE = "handles";
const CSV_HANDLE_KEY = "primary";

const defaultState = {
    settings: {
        theme: "dark",
        weekEndsAt: "17:00",
        reportDay: "Friday",
        hourlyWage: 0,
        taxRate: 0,
        contracts: [
            { name: "None", projects: ["None"] },
            { name: "Main", projects: ["Build"] }
        ]
    },
    entries: [],
    journals: {},
    activeEntryId: null,
    lastReminderDate: null
};

let state = loadState();
let goPrefixActive = false;
const undoStack = [];
let csvFileHandle = null;
let csvWriteChain = Promise.resolve();
const isDesktopHost = Boolean(window.chrome?.webview);
let suppressCsvWrite = false;
let desktopCsvConnected = false;
let localCsvServerConnected = false;
let journalSaveTimer = null;
let periodWasOverridden = false;
let loadedJournalDate = null;
let entryDateDigitCount = 0;
let dashboardRangeState = {
    mode: "week",
    anchorDate: startOfWeek(new Date())
};

const contractHues = [160, 215, 25, 278, 90, 330, 185, 45, 245, 120, 5, 300];

const pages = {
    tracking: document.getElementById("page-tracking"),
    dashboard: document.getElementById("page-dashboard"),
    projects: document.getElementById("page-projects"),
    notes: document.getElementById("page-notes"),
    settings: document.getElementById("page-settings")
};

const cyclePages = ["tracking", "dashboard", "projects", "notes", "settings"];

const navButtons = Array.from(document.querySelectorAll(".nav-btn"));
const appRoot = document.getElementById("app");

const quickEntry = document.getElementById("quick-entry");
const entryDate = document.getElementById("entry-date");
const entryHour = document.getElementById("entry-hour");
const entryMinute = document.getElementById("entry-minute");
const entryPeriod = document.getElementById("entry-period");
const entryContract = document.getElementById("entry-contract");
const entryProject = document.getElementById("entry-project");
const entryProjectField = document.getElementById("entry-project-field");
const entryTask = document.getElementById("entry-task");
const contractOptions = document.getElementById("contract-options");
const projectOptions = document.getElementById("project-options");
const activeStatus = document.getElementById("active-status");
const todayTotal = document.getElementById("today-total");
const recentEntries = document.getElementById("recent-entries");
const undoButton = document.getElementById("undo-btn");
const clock = document.getElementById("clock");

const rangeSelect = document.getElementById("range-select");
const rangeStart = document.getElementById("range-start");
const rangeEnd = document.getElementById("range-end");
const rangePrev = document.getElementById("range-prev");
const rangeNext = document.getElementById("range-next");
const dashboardGrid = document.getElementById("dashboard-grid");
const dashboardChartCard = document.getElementById("dashboard-chart-card");
const dashboardChartTitle = document.getElementById("dashboard-chart-title");
const contractChart = document.getElementById("contract-chart");
const dashboardStats = document.getElementById("dashboard-stats");

const journalDate = document.getElementById("journal-date");
const journalContractSelect = document.getElementById("journal-contract-select");
const journalProjectSelect = document.getElementById("journal-project-select");
const journalDid = document.getElementById("journal-did");
const journalLearned = document.getElementById("journal-learned");
const journalNext = document.getElementById("journal-next");
const journalPrev = document.getElementById("journal-prev");
const journalNextDay = document.getElementById("journal-next-day");
const journalDateLabel = document.getElementById("journal-date-label");
const journalDays = document.getElementById("journal-days");

const themeSelect = document.getElementById("theme-select");
const weekEnds = document.getElementById("week-ends");
const reportDay = document.getElementById("report-day");
const hourlyWage = document.getElementById("hourly-wage");
const taxRate = document.getElementById("tax-rate");
const saveSettingsButton = document.getElementById("save-settings");
const newContract = document.getElementById("new-contract");
const contractList = document.getElementById("contract-list");
const projectContract = document.getElementById("project-contract");
const newProject = document.getElementById("new-project");
const projectList = document.getElementById("project-list");
const connectCsvButton = document.getElementById("connect-csv");
const csvPath = document.getElementById("csv-path");
const csvFileLabel = document.getElementById("csv-file");
const csvStatus = document.getElementById("csv-status");

const notesContractSelect = document.getElementById("notes-contract-select");
const notesProjectSelect = document.getElementById("notes-project-select");
const notesResults = document.getElementById("notes-results");

const reminderDialog = document.getElementById("reminder-dialog");
const reminderOpen = document.getElementById("reminder-open");
const reminderSnooze = document.getElementById("reminder-snooze");
const reminderDismiss = document.getElementById("reminder-dismiss");

const paletteDialog = document.getElementById("palette-dialog");
const paletteSearch = document.getElementById("palette-search");
const paletteList = document.getElementById("palette-list");

const shortcutsDialog = document.getElementById("shortcuts-dialog");
const openShortcuts = document.getElementById("open-shortcuts");
const closeShortcuts = document.getElementById("close-shortcuts");

const commands = [
    { key: "go-tracking", label: "Go: Time Tracking", run: () => showPage("tracking") },
    { key: "go-dashboard", label: "Go: Dashboard", run: () => showPage("dashboard") },
    { key: "go-projects", label: "Go: Project Tracker", run: () => showPage("projects") },
    { key: "go-settings", label: "Go: Settings", run: () => showPage("settings") },
    { key: "go-notes", label: "Go: Notes", run: () => showPage("notes") },
    { key: "new-entry", label: "New time entry", run: focusEntryHour },
    { key: "save-journal", label: "Save Journal", run: saveJournal },
    { key: "undo", label: "Undo Last Edit", run: undoLast }
];

init().catch(() => {
    csvStatus.textContent = "CSV backend initialization failed. Using local storage only.";
});

async function init() {
    applyTheme(state.settings.theme);
    applySettingsToForm();
    bindEvents();
    rangeSelect.value = dashboardRangeState.mode;
    syncDashboardRangeInputs();
    await setupCsvBackend();
    updateContractSelectors();
    applyTodayDefaults();
    loadJournalForDate(journalDate.value);
    setupJournalBulletEditing();
    showPage("tracking");
    render();
    startClock();
    setEntryDefaults();
}

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return structuredClone(defaultState);
        }
        const parsed = JSON.parse(raw);
        return mergeState(parsed);
    } catch {
        return structuredClone(defaultState);
    }
}

function mergeState(parsed) {
    const merged = structuredClone(defaultState);
    merged.settings = { ...merged.settings, ...(parsed.settings || {}) };
    merged.settings.contracts = normalizeContracts(parsed.settings?.contracts || merged.settings.contracts);
    merged.entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    merged.journals = parsed.journals && typeof parsed.journals === "object" ? parsed.journals : {};
    merged.activeEntryId = parsed.activeEntryId || null;
    merged.lastReminderDate = parsed.lastReminderDate || null;
    return merged;
}

function normalizeContracts(contracts) {
    const cleaned = contracts
        .filter((c) => c && typeof c.name === "string")
        .map((c) => ({
            name: c.name.trim(),
            projects: Array.isArray(c.projects) ? c.projects.map((p) => String(p).trim()).filter(Boolean) : []
        }))
        .filter((c) => c.name);

    const names = new Set(cleaned.map((c) => c.name.toLowerCase()));
    if (!names.has("none")) {
        cleaned.unshift({ name: "None", projects: ["None"] });
    }

    for (const contract of cleaned) {
        const projectSet = new Set(contract.projects.map((p) => p.toLowerCase()));
        if (contract.name === "None") {
            contract.projects = ["None"];
            continue;
        }
        if (!projectSet.size) {
            contract.projects.push("General");
        }
    }

    return cleaned;
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (!suppressCsvWrite) {
        queueCsvWrite();
    }
}

function bindEvents() {
    navButtons.forEach((btn) => {
        btn.addEventListener("click", () => showPage(btn.dataset.page));
    });

    quickEntry.addEventListener("submit", (event) => {
        event.preventDefault();
        saveQuickEntry();
    });
    entryDate.addEventListener("focus", () => { entryDateDigitCount = 0; });
    entryDate.addEventListener("keydown", handleEntryDateKeydown);
    entryHour.addEventListener("input", handleHourInput);
    entryHour.addEventListener("keydown", handleEntryFieldKeydown);
    entryMinute.addEventListener("keydown", handleEntryMinuteKeydown);
    entryContract.addEventListener("input", updateEntryProjectOptions);
    entryContract.addEventListener("change", updateEntryProjectOptions);
    entryProject.addEventListener("input", () => colorizeContract(entryProject, entryProject.value, entryContract.value));
    entryContract.addEventListener("keydown", handleEntryFieldKeydown);
    entryProject.addEventListener("keydown", handleEntryFieldKeydown);
    entryTask.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            saveQuickEntry();
        }
    });
    journalContractSelect.addEventListener("change", () => updateJournalProjectSelect());
    journalContractSelect.addEventListener("change", scheduleJournalSave);
    journalProjectSelect.addEventListener("change", () => {
        colorizeContract(journalProjectSelect, journalProjectSelect.value, journalContractSelect.value);
        scheduleJournalSave();
    });
    journalDate.addEventListener("change", () => {
        if (loadedJournalDate && loadedJournalDate !== journalDate.value) saveJournal(loadedJournalDate);
        loadJournalForDate(journalDate.value);
    });
    journalPrev.addEventListener("click", () => shiftJournalDay(-1));
    journalNextDay.addEventListener("click", () => shiftJournalDay(1));
    if (undoButton) {
        undoButton.addEventListener("click", () => undoLast());
    }

    rangeSelect.addEventListener("change", handleRangeSelection);
    rangePrev.addEventListener("click", () => shiftDashboardRange(-1));
    rangeNext.addEventListener("click", () => shiftDashboardRange(1));
    rangeStart.addEventListener("change", () => handleDashboardDateInputChange("start"));
    rangeEnd.addEventListener("change", () => handleDashboardDateInputChange("end"));

    saveSettingsButton.addEventListener("click", () => saveSettings());
    newContract.addEventListener("keydown", (event) => submitSettingsInputOnEnter(event, addContract));
    newProject.addEventListener("keydown", (event) => submitSettingsInputOnEnter(event, addProject));
    projectContract.addEventListener("change", () => {
        colorizeContract(projectContract, projectContract.value);
        renderProjectList();
    });
    connectCsvButton.addEventListener("click", () => connectCsvFile());
    notesContractSelect.addEventListener("change", () => {
        updateNotesProjectSelect();
        renderNotesPage();
    });
    notesProjectSelect.addEventListener("change", () => {
        colorizeContract(notesProjectSelect, notesProjectSelect.value, notesContractSelect.value);
        renderNotesPage();
    });

    reminderOpen.addEventListener("click", () => {
        reminderDialog.close();
        showPage("projects");
    });

    reminderSnooze.addEventListener("click", () => reminderDialog.close());
    reminderDismiss.addEventListener("click", () => {
        state.lastReminderDate = formatDateOnly(new Date());
        saveState();
        reminderDialog.close();
    });

    openShortcuts.addEventListener("click", () => shortcutsDialog.showModal());
    closeShortcuts.addEventListener("click", () => shortcutsDialog.close());

    paletteSearch.addEventListener("input", () => renderPalette());

    paletteList.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-cmd]");
        if (!button) {
            return;
        }
        const cmd = commands.find((c) => c.key === button.dataset.cmd);
        if (cmd) {
            cmd.run();
            paletteDialog.close();
        }
    });

    document.addEventListener("keydown", handleKeyboardShortcuts);
}

function handleKeyboardShortcuts(event) {
    const key = event.key.toLowerCase();
    const inTextField = isTypingTarget(event.target);

    if (event.ctrlKey && event.key === "Tab") {
        event.preventDefault();
        cyclePage(event.shiftKey ? -1 : 1);
        return;
    }

    if (event.ctrlKey && key === "w") {
        event.preventDefault();
        requestAppClose();
        return;
    }

    if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) {
        const activePage = pages[currentPage()];
        if (activePage && !activePage.contains(document.activeElement)) {
            event.preventDefault();
            focusFirstElementInActivePage();
            return;
        }
    }

    if (event.ctrlKey && key === "k") {
        event.preventDefault();
        openPalette();
        return;
    }

    if (key === "?" && !event.ctrlKey) {
        event.preventDefault();
        shortcutsDialog.showModal();
        return;
    }

    if (event.ctrlKey && key === "n") {
        event.preventDefault();
        showPage("tracking");
        focusEntryHour();
        return;
    }

    if (event.ctrlKey && key === "z") {
        event.preventDefault();
        undoLast();
        return;
    }

    if (event.ctrlKey && key === "enter" && currentPage() === "projects") {
        event.preventDefault();
        saveJournal();
        focusNextJournalSection(event.target);
        return;
    }

    if (inTextField) {
        return;
    }

    if (currentPage() === "dashboard" && event.key === "ArrowLeft") {
        event.preventDefault();
        shiftDashboardRange(-1);
        return;
    }

    if (currentPage() === "dashboard" && event.key === "ArrowRight") {
        event.preventDefault();
        shiftDashboardRange(1);
        return;
    }

    if (currentPage() === "projects" && event.key === "ArrowLeft") {
        event.preventDefault();
        shiftJournalDay(-1);
        return;
    }

    if (currentPage() === "projects" && event.key === "ArrowRight") {
        event.preventDefault();
        shiftJournalDay(1);
        return;
    }

    if (goPrefixActive) {
        const map = { t: "tracking", d: "dashboard", j: "projects", p: "projects", s: "settings", n: "notes" };
        if (map[key]) {
            event.preventDefault();
            showPage(map[key]);
        }
        goPrefixActive = false;
        return;
    }

    if (key === "g") {
        goPrefixActive = true;
        setTimeout(() => {
            goPrefixActive = false;
        }, 1200);
    }
}

function cyclePage(direction) {
    const current = currentPage();
    const index = cyclePages.indexOf(current);
    const normalized = index < 0 ? 0 : index;
    const next = (normalized + direction + cyclePages.length) % cyclePages.length;
    showPage(cyclePages[next]);
}

function focusFirstElementInActivePage() {
    const page = pages[currentPage()];
    if (!page) {
        return;
    }

    const selector = [
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        "button:not([disabled])",
        "[tabindex]:not([tabindex='-1'])"
    ].join(", ");

    const first = page.querySelector(selector);
    if (first && typeof first.focus === "function") {
        first.focus();
    }
}

function isTypingTarget(target) {
    return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

function showPage(pageName) {
    applyTodayDefaults();

    Object.entries(pages).forEach(([name, page]) => {
        page.classList.toggle("active", name === pageName);
    });
    navButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.page === pageName);
    });

    if (pageName === "dashboard") {
        renderDashboard();
    }

    if (pageName === "settings") {
        renderContractsAndProjects();
    }

    if (pageName === "notes") {
        renderNotesPage();
    }

    if (pageName === "tracking") {
        setEntryDefaults();
        requestAnimationFrame(focusEntryHour);
    } else {
        focusFirstElementInActivePage();
    }
}

function applyTodayDefaults() {
    const today = formatDateOnly(new Date());
    if (!journalDate.value) journalDate.value = today;
    if (!entryDate.value) entryDate.value = today;
}

function handleRangeSelection() {
    dashboardRangeState.mode = rangeSelect.value;
    syncDashboardRangeInputs();
    renderDashboard();
}

function shiftDashboardRange(step) {
    const nextAnchor = new Date(dashboardRangeState.anchorDate);

    if (dashboardRangeState.mode === "day") {
        nextAnchor.setDate(nextAnchor.getDate() + step);
    } else if (dashboardRangeState.mode === "week") {
        nextAnchor.setDate(nextAnchor.getDate() + (7 * step));
    } else if (dashboardRangeState.mode === "month") {
        nextAnchor.setMonth(nextAnchor.getMonth() + step, 1);
    } else if (dashboardRangeState.mode === "year") {
        nextAnchor.setFullYear(nextAnchor.getFullYear() + step, 0, 1);
    }

    dashboardRangeState.anchorDate = startOfDay(nextAnchor);
    syncDashboardRangeInputs();
    renderDashboard();
}

function syncDashboardRangeInputs() {
    if (!dashboardRangeState.anchorDate) {
        dashboardRangeState.anchorDate = startOfDay(new Date());
    }

    dashboardRangeState.mode = rangeSelect.value || dashboardRangeState.mode;
    if (rangeSelect.value !== dashboardRangeState.mode) {
        rangeSelect.value = dashboardRangeState.mode;
    }

    const bounds = getRangeBounds(dashboardRangeState.mode, dashboardRangeState.anchorDate);
    rangeStart.value = formatDateOnly(bounds.start);
    rangeEnd.value = formatDateOnly(bounds.end);
}

function handleDashboardDateInputChange(changedField) {
    const startDate = parseDateOnlyInput(rangeStart.value);
    const endDate = parseDateOnlyInput(rangeEnd.value);
    if (!startDate && !endDate) {
        syncDashboardRangeInputs();
        return;
    }

    const mode = dashboardRangeState.mode;
    if (mode === "day") {
        dashboardRangeState.anchorDate = startOfDay(startDate || endDate);
    } else if (mode === "week") {
        dashboardRangeState.anchorDate = startOfWeek(startDate || endDate);
    } else if (mode === "month") {
        const base = changedField === "end" ? (endDate || startDate) : (startDate || endDate);
        dashboardRangeState.anchorDate = startOfDay(new Date(base.getFullYear(), base.getMonth(), 1));
    } else if (mode === "year") {
        const base = changedField === "end" ? (endDate || startDate) : (startDate || endDate);
        dashboardRangeState.anchorDate = startOfDay(new Date(base.getFullYear(), 0, 1));
    }

    syncDashboardRangeInputs();
    renderDashboard();
}

function forceDatePartToToday(existingLocalDateTime) {
    const now = new Date();
    const today = formatDateOnly(now);
    if (!existingLocalDateTime || !existingLocalDateTime.includes("T")) {
        return toLocalDateTimeValue(now);
    }
    const timePart = existingLocalDateTime.split("T")[1] || "09:00";
    return `${today}T${timePart}`;
}

function requestAppClose() {
    if (window.chrome?.webview?.postMessage) {
        window.chrome.webview.postMessage({ type: "close-app" });
        return;
    }

    if (window.close) {
        window.close();
    }
}

function submitTrackingNoteOnEnter(event, action) {
    if (event.key !== "Enter" || event.shiftKey) {
        return;
    }

    event.preventDefault();
    action();
}

function submitSettingsInputOnEnter(event, action) {
    if (event.key !== "Enter" || event.shiftKey) {
        return;
    }

    event.preventDefault();
    action();
}

function focusEntryHour() {
    entryHour.focus();
    entryHour.select();
}

function setEntryDefaults(preferredDate) {
    const latest = [...state.entries].sort((a, b) => new Date(b.startRaw) - new Date(a.startRaw))[0];
    const base = preferredDate || (latest?.endRaw ? new Date(latest.endRaw) : HoursPilotLogic.roundedQuarter(new Date()));
    entryDate.value = formatDateOnly(base);
    const hour = base.getHours();
    entryHour.value = String(hour % 12 || 12);
    entryMinute.value = ["00", "15", "30", "45"].includes(String(base.getMinutes()).padStart(2, "0"))
        ? String(base.getMinutes()).padStart(2, "0") : "00";
    entryPeriod.value = hour >= 12 ? "PM" : "AM";
    periodWasOverridden = false;
    if (!entryContract.value) entryContract.value = latest?.contract || state.settings.contracts[0]?.name || "None";
    updateEntryProjectOptions();
    if (latest && getContract(entryContract.value)?.projects.includes(latest.project)) entryProject.value = latest.project;
}

function handleHourInput() {
    entryHour.value = entryHour.value.replace(/\D/g, "").slice(0, 2);
    const hour = Number(entryHour.value);
    if (hour >= 1 && hour <= 12 && !periodWasOverridden) {
        const nearby = [...state.entries].sort((a, b) => new Date(b.startRaw) - new Date(a.startRaw))[0];
        entryPeriod.value = HoursPilotLogic.inferPeriod(hour, nearby?.endRaw || nearby?.startRaw);
    }
    if (entryHour.value.length === 2 && hour >= 10 && hour <= 12) entryMinute.focus();
    if (entryHour.value.length === 1 && hour >= 2 && hour <= 9) {
        setTimeout(() => {
            if (document.activeElement === entryHour && entryHour.value === String(hour)) entryMinute.focus();
        }, 350);
    }
}

function handleEntryDateKeydown(event) {
    if (/^\d$/.test(event.key)) {
        entryDateDigitCount += 1;
        if (entryDateDigitCount === 2) {
            setTimeout(() => {
                if (document.activeElement === entryDate) entryHour.focus();
            }, 0);
        }
        return;
    }
    if (event.key === "Backspace" || event.key === "Delete") entryDateDigitCount = 0;
}

function handleEntryMinuteKeydown(event) {
    const minutesByFirstDigit = { 0: "00", 1: "15", 3: "30", 4: "45" };
    if (minutesByFirstDigit[event.key]) {
        event.preventDefault();
        entryMinute.value = minutesByFirstDigit[event.key];
        focusEntryContract();
        return;
    }
    handleEntryFieldKeydown(event);
}

function matchingEntryOption(values, typedValue) {
    const typed = typedValue.trim().toLowerCase();
    return values.find((value) => value.toLowerCase().startsWith(typed)) || values[0] || "";
}

function focusEntryContract() {
    if (!getContract(entryContract.value)) {
        entryContract.value = matchingEntryOption(state.settings.contracts.map((contract) => contract.name), entryContract.value);
        updateEntryProjectOptions();
    }
    entryContract.focus();
    entryContract.select();
}

function acceptEntryContract() {
    entryContract.value = matchingEntryOption(state.settings.contracts.map((contract) => contract.name), entryContract.value);
    updateEntryProjectOptions();
    if (entryContract.value === "None") {
        entryTask.focus();
        return;
    }
    entryProject.focus();
    entryProject.select();
}

function acceptEntryProject() {
    const projects = getContract(entryContract.value)?.projects || ["None"];
    entryProject.value = matchingEntryOption(projects, entryProject.value);
    entryTask.focus();
}

function handleEntryFieldKeydown(event) {
    if (event.key !== "Enter" && event.key !== "Tab") return;
    if (event.key === "Tab" && event.shiftKey) return;

    if (event.target === entryContract) {
        event.preventDefault();
        event.stopPropagation();
        acceptEntryContract();
        return;
    }

    if (event.target === entryProject) {
        event.preventDefault();
        event.stopPropagation();
        acceptEntryProject();
        return;
    }

    const order = [entryHour, entryMinute, entryContract, entryProject, entryTask];
    const next = order[order.indexOf(event.target) + 1];
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    next.focus();
    next.select?.();
}

entryPeriod.addEventListener("change", () => { periodWasOverridden = true; });

async function setupCsvBackend() {
    if (isDesktopHost) {
        window.chrome.webview.addEventListener("message", (event) => handleDesktopHostMessage(event.data));
        csvStatus.textContent = "Loading CSV backend...";
        window.chrome.webview.postMessage({ type: "csv-init" });
        return;
    }

    if (await setupLocalCsvServer()) return;

    if (!("showOpenFilePicker" in window)) {
        csvStatus.textContent = "Start Hours Pilot local server to use a persistent CSV in Safari.";
        return;
    }

    const restoredHandle = await getStoredCsvHandle();
    if (restoredHandle) {
        csvFileHandle = restoredHandle;
        csvFileLabel.textContent = csvFileHandle.name || CSV_FILE_NAME;
        await loadEntriesFromConnectedCsv();
        csvStatus.textContent = "CSV connected automatically. Auto-sync is active.";
        return;
    }

    csvStatus.textContent = "Connect a CSV file once. Future launches reconnect automatically.";
    csvFileLabel.textContent = "No CSV connected";
}

async function setupLocalCsvServer() {
    try {
        const response = await fetch("/api/csv/status", { cache: "no-store" });
        if (!response.ok) return false;
        localCsvServerConnected = true;
        applyLocalCsvStatus(await response.json());
        return true;
    } catch {
        return false;
    }
}

function applyLocalCsvStatus(payload) {
    csvPath.value = payload.path || "";
    csvFileLabel.textContent = payload.fileName || CSV_FILE_NAME;
    csvStatus.textContent = payload.exists
        ? "CSV connected. Auto-sync is active."
        : "CSV ready. It will be created when you save your first entry.";
    suppressCsvWrite = true;
    loadEntriesFromCsvText(payload.csvText || "");
    suppressCsvWrite = false;
}

async function connectCsvFile() {
    if (isDesktopHost) {
        window.chrome.webview.postMessage({ type: "csv-pick" });
        return;
    }

    if (localCsvServerConnected) {
        try {
            const response = await fetch("/api/csv/configure", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: csvPath.value.trim() })
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "CSV configuration failed.");
            applyLocalCsvStatus(payload);
        } catch (error) {
            csvStatus.textContent = error.message || "Could not configure CSV.";
        }
        return;
    }

    if (!("showOpenFilePicker" in window)) {
        csvStatus.textContent = "Start Hours Pilot local server to use a persistent CSV in Safari.";
        return;
    }

    try {
        const handles = await window.showOpenFilePicker({
            multiple: false,
            types: [{ description: "CSV file", accept: { "text/csv": [".csv"] } }]
        });
        csvFileHandle = handles[0];
        await storeCsvHandle(csvFileHandle);
        csvFileLabel.textContent = csvFileHandle.name;
        await loadEntriesFromConnectedCsv();
        csvStatus.textContent = "CSV connected. Auto-sync is active.";
    } catch {
        csvStatus.textContent = "CSV connection canceled.";
    }
}

function handleDesktopHostMessage(message) {
    if (!message || typeof message !== "object") {
        return;
    }

    if (message.type === "csv-loaded") {
        desktopCsvConnected = true;
        csvFileLabel.textContent = message.fileName || CSV_FILE_NAME;
        csvStatus.textContent = "CSV connected. Auto-sync is active.";
        suppressCsvWrite = true;
        loadEntriesFromCsvText(message.csvText || "");
        suppressCsvWrite = false;
        return;
    }

    if (message.type === "csv-status") {
        desktopCsvConnected = Boolean(message.connected);
        if (message.fileName) {
            csvFileLabel.textContent = message.fileName;
        }
        if (message.status) {
            csvStatus.textContent = message.status;
        }
    }
}

function openCsvHandleDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(CSV_HANDLE_DB, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(CSV_HANDLE_STORE)) {
                db.createObjectStore(CSV_HANDLE_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function storeCsvHandle(handle) {
    const db = await openCsvHandleDb();
    await new Promise((resolve, reject) => {
        const tx = db.transaction(CSV_HANDLE_STORE, "readwrite");
        tx.objectStore(CSV_HANDLE_STORE).put(handle, CSV_HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    db.close();
}

async function getStoredCsvHandle() {
    try {
        const db = await openCsvHandleDb();
        const handle = await new Promise((resolve, reject) => {
            const tx = db.transaction(CSV_HANDLE_STORE, "readonly");
            const req = tx.objectStore(CSV_HANDLE_STORE).get(CSV_HANDLE_KEY);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
        db.close();
        return handle;
    } catch {
        return null;
    }
}

async function loadEntriesFromConnectedCsv() {
    if (!csvFileHandle) {
        return;
    }

    const file = await csvFileHandle.getFile();
    const text = await file.text();
    loadEntriesFromCsvText(text);
}

function loadEntriesFromCsvText(text) {
    if (!text.trim()) {
        state.entries = [];
        state.activeEntryId = null;
        saveState();
        render();
        return;
    }

    const lines = text.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) {
        return;
    }

    const header = parseCsvLine(lines[0]).map((cell) => cell.trim());
    const index = Object.fromEntries(header.map((name, idx) => [name, idx]));
    const imported = [];

    for (let i = 1; i < lines.length; i += 1) {
        const cols = parseCsvLine(lines[i]);
        const startRaw = cols[index.start_raw]?.trim();
        if (!startRaw) {
            continue;
        }

        const startDate = new Date(startRaw);
        if (Number.isNaN(startDate.valueOf())) {
            continue;
        }

        const endRawText = index.end_raw !== undefined ? cols[index.end_raw]?.trim() : "";
        const endDate = endRawText ? new Date(endRawText) : null;
        const entry = {
            id: index.id !== undefined && cols[index.id] ? cols[index.id] : crypto.randomUUID(),
            date: formatDateOnly(startDate),
            startRaw: startDate.toISOString(),
            endRaw: endDate && !Number.isNaN(endDate.valueOf()) ? endDate.toISOString() : null,
            startRounded: "",
            endRounded: null,
            durationMinutesExact: 0,
            durationMinutesRounded: 0,
            contract: cols[index.contract]?.trim() || "None",
            project: cols[index.project]?.trim() || "None",
            note: index.task !== undefined ? (cols[index.task] || "") : ""
        };
        if (entry.contract === "None") {
            entry.project = "None";
        }
        recalcEntry(entry);
        imported.push(entry);
    }

    state.entries = imported.sort((a, b) => new Date(a.startRaw) - new Date(b.startRaw));
    mergeContractsFromEntries(imported);
    const newestOpen = [...state.entries].reverse().find((entry) => !entry.endRaw);
    state.activeEntryId = newestOpen ? newestOpen.id : null;
    saveState();
    render();
}

function queueCsvWrite() {
    if (isDesktopHost) {
        if (!desktopCsvConnected) {
            return;
        }

        csvWriteChain = csvWriteChain
            .then(() => writeEntriesToCsv())
            .catch(() => {
                csvStatus.textContent = "Auto-save to CSV failed.";
            });
        return;
    }

    if (localCsvServerConnected) {
        csvWriteChain = csvWriteChain
            .then(() => writeEntriesToCsv())
            .catch(() => {
                csvStatus.textContent = "Auto-save to CSV failed.";
            });
        return;
    }

    if (!csvFileHandle) {
        return;
    }

    csvWriteChain = csvWriteChain
        .then(() => writeEntriesToCsv())
        .catch(() => {
            csvStatus.textContent = "Auto-save to CSV failed.";
        });
}

async function writeEntriesToCsv() {
    if (!isDesktopHost && !localCsvServerConnected && !csvFileHandle) {
        return;
    }

    const header = [
        "id",
        "date",
        "start_raw",
        "end_raw",
        "start_rounded",
        "end_rounded",
        "duration_minutes_exact",
        "duration_minutes_rounded",
        "contract",
        "project",
        "task"
    ];

    const rows = state.entries
        .slice()
        .sort((a, b) => new Date(a.startRaw) - new Date(b.startRaw))
        .map((entry) => {
            recalcEntry(entry);
            return [
                entry.id,
                entry.date,
                entry.startRaw,
                entry.endRaw || "",
                entry.startRounded,
                entry.endRounded || "",
                String(entry.durationMinutesExact),
                String(entry.durationMinutesRounded),
                entry.contract,
                entry.project,
                entry.note || ""
            ];
        });

    const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");

    if (isDesktopHost) {
        window.chrome.webview.postMessage({ type: "csv-write", csvText: csv, rowCount: rows.length });
        return;
    }

    if (localCsvServerConnected) {
        const response = await fetch("/api/csv/write", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ csvText: csv, rowCount: rows.length })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "CSV write failed.");
        csvFileLabel.textContent = payload.fileName || CSV_FILE_NAME;
        csvStatus.textContent = `Auto-synced  entries.`;
        return;
    }

    const writable = await csvFileHandle.createWritable();
    await writable.write(csv);
    await writable.close();
    csvStatus.textContent = `Auto-synced ${rows.length} entries.`;
}

function currentPage() {
    return Object.entries(pages).find(([, el]) => el.classList.contains("active"))?.[0] || "tracking";
}

function render() {
    updateActiveStatus();
    renderRecentEntries();
    renderDashboard();
    renderContractsAndProjects();
    renderNotesPage();
}

function updateContractSelectors() {
    const contracts = state.settings.contracts;
    const selectedProjectContract = projectContract.value;
    const selectedJournalContract = journalContractSelect.value;
    const selectedNotesContract = notesContractSelect.value;
    replaceDataList(contractOptions, contracts.map((c) => c.name));
    replaceOptions(journalContractSelect, contracts.map((c) => c.name));
    replaceOptions(projectContract, contracts.map((c) => c.name));
    replaceOptions(notesContractSelect, ["All", ...contracts.map((c) => c.name)]);

    if (!contracts.some((c) => c.name === entryContract.value)) {
        entryContract.value = contracts[0].name;
    }

    projectContract.value = contracts.some((c) => c.name === selectedProjectContract)
        ? selectedProjectContract : contracts[0].name;
    journalContractSelect.value = contracts.some((c) => c.name === selectedJournalContract)
        ? selectedJournalContract : contracts[0].name;
    notesContractSelect.value = ["All", ...contracts.map((c) => c.name)].includes(selectedNotesContract)
        ? selectedNotesContract : "All";

    updateEntryProjectOptions();
    updateJournalProjectSelect();
    updateNotesProjectSelect();
    colorizeContract(projectContract, projectContract.value);
    colorizeContract(notesContractSelect, notesContractSelect.value);
}

function mergeContractsFromEntries(entries) {
    const contracts = new Map(state.settings.contracts.map((contract) => [contract.name, {
        name: contract.name,
        projects: [...contract.projects]
    }]));

    entries.forEach((entry) => {
        const contractName = entry.contract || "None";
        if (!contracts.has(contractName)) {
            contracts.set(contractName, {
                name: contractName,
                projects: contractName === "None" ? ["None"] : []
            });
        }

        if (contractName === "None") {
            contracts.get(contractName).projects = ["None"];
            return;
        }

        const projectName = entry.project || "General";
        const contract = contracts.get(contractName);
        if (!contract.projects.includes(projectName)) {
            contract.projects.push(projectName);
        }
    });

    state.settings.contracts = normalizeContracts(Array.from(contracts.values()));
    updateContractSelectors();
}

function updateNotesProjectSelect() {
    const selectedContract = notesContractSelect.value;
    if (selectedContract === "All") {
        replaceOptions(notesProjectSelect, ["All"]);
        notesProjectSelect.value = "All";
        notesProjectSelect.disabled = true;
        colorizeContract(notesContractSelect, "All");
        colorizeContract(notesProjectSelect, "All");
        return;
    }

    const contract = getContract(selectedContract);
    const projects = contract ? contract.projects : ["None"];
    replaceOptions(notesProjectSelect, ["All", ...projects]);
    if (!["All", ...projects].includes(notesProjectSelect.value)) {
        notesProjectSelect.value = "All";
    }
    notesProjectSelect.disabled = false;
    colorizeContract(notesContractSelect, selectedContract);
    colorizeContract(notesProjectSelect, notesProjectSelect.value, selectedContract);
}

function renderNotesPage() {
    const contractFilter = notesContractSelect.value;
    const projectFilter = notesProjectSelect.value;

    const filtered = Object.entries(state.journals)
        .map(([date, journal]) => ({
            date,
            contract: journal.contract || "None",
            project: journal.project || "None",
            did: journal.did || "",
            learned: journal.learned || "",
            next: journal.next || "",
            updatedAt: journal.updatedAt || `${date}T00:00:00`
        }))
        .filter((journal) => hasJournalContent(journal))
        .filter((journal) => {
            if (contractFilter !== "All" && journal.contract !== contractFilter) {
                return false;
            }
            if (projectFilter !== "All" && journal.project !== projectFilter) {
                return false;
            }
            return true;
        })
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    notesResults.innerHTML = "";
    if (!filtered.length) {
        const li = document.createElement("li");
        li.className = "muted";
        li.textContent = "No notes for this selection.";
        notesResults.appendChild(li);
        return;
    }

    filtered.forEach((journal) => {
        const li = document.createElement("li");
        li.innerHTML = `
            <span class="note-meta"><span class="${journal.contract === "None" ? "is-none" : "contract-colored"}" style="--contract-hue:${getContractHue(journal.contract)}">${escapeHtml(journal.contract)} / ${escapeHtml(journal.project)}</span> - ${escapeHtml(journal.date)}</span>
            ${renderJournalSection("Did / Tried", journal.did)}
            ${renderJournalSection("Learned", journal.learned)}
            ${renderJournalSection("Next / Blocker", journal.next)}
        `;
        notesResults.appendChild(li);
    });
}

function replaceOptions(selectEl, values) {
    selectEl.innerHTML = "";
    values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        if (value === "None") option.className = "is-none";
        selectEl.appendChild(option);
    });
}

function replaceDataList(list, values) {
    list.innerHTML = values.map((value) => `<option value="${escapeHtml(value)}"${value === "None" ? ' class="is-none"' : ""}></option>`).join("");
}

function updateEntryProjectOptions() {
    const previousValue = entryProject.value;
    const contract = getContract(entryContract.value);
    const projects = contract?.name === "None" ? [] : (contract?.projects || []);
    replaceDataList(projectOptions, projects);
    entryProjectField.hidden = projects.length === 0;
    entryProject.disabled = projects.length === 0;
    entryProject.required = projects.length > 0;
    quickEntry.classList.toggle("no-project", projects.length === 0);
    if (contract?.name === "None") {
        entryProject.value = "None";
    } else {
        entryProject.value = projects.includes(previousValue) ? previousValue : (projects[0] || "");
    }
    colorizeContract(entryContract, entryContract.value);
    colorizeContract(entryProject, entryProject.value, entryContract.value);
}

function updateJournalProjectSelect() {
    const contract = getContract(journalContractSelect.value);
    const projects = contract ? contract.projects : ["None"];
    replaceOptions(journalProjectSelect, projects);
    if (contract?.name === "None") {
        journalProjectSelect.value = "None";
        journalProjectSelect.disabled = true;
    } else {
        journalProjectSelect.disabled = false;
    }
    journalProjectSelect.parentElement.hidden = contract?.name === "None";
    colorizeContract(journalContractSelect, journalContractSelect.value);
    colorizeContract(journalProjectSelect, journalProjectSelect.value, journalContractSelect.value);
}

function getContract(name) {
    return state.settings.contracts.find((c) => c.name === name) || null;
}

function getContractHue(name) {
    const index = state.settings.contracts.filter((contract) => contract.name !== "None")
        .findIndex((contract) => contract.name === name);
    return contractHues[index % contractHues.length] ?? contractHues[0];
}

function colorizeContract(element, value, contractName = value) {
    element.classList.toggle("is-none", value === "None");
    const hasContractColor = Boolean(value && value !== "None" && getContract(contractName));
    element.classList.toggle("contract-colored", hasContractColor);
    if (hasContractColor) element.style.setProperty("--contract-hue", getContractHue(contractName));
    else element.style.removeProperty("--contract-hue");
}

function saveQuickEntry() {
    const hour24 = HoursPilotLogic.to24Hour(entryHour.value, entryPeriod.value);
    const contract = getContract(entryContract.value);
    entryHour.setCustomValidity(hour24 === null ? "Enter an hour from 1 to 12." : "");
    entryContract.setCustomValidity(contract ? "" : "Choose a contract from the list.");
    entryProject.setCustomValidity(contract?.projects.includes(entryProject.value) ? "" : "Choose a project from the list.");
    if (!quickEntry.checkValidity() || hour24 === null || !contract || !contract.projects.includes(entryProject.value)) {
        quickEntry.reportValidity();
        return;
    }
    const startAt = new Date(`${entryDate.value}T00:00:00`);
    startAt.setHours(hour24, Number(entryMinute.value), 0, 0);
    if (Number.isNaN(startAt.valueOf())) return;

    const project = contract.name === "None" ? "None" : entryProject.value;
    const currentTaskNote = entryTask.value.trim();
    const startIso = startAt.toISOString();

    pushUndo();

    closePreviousEntryAt(startIso);

    const newEntry = {
        id: crypto.randomUUID(),
        date: formatDateOnly(startAt),
        startRaw: startIso,
        endRaw: null,
        startRounded: toRoundedIso(startAt),
        endRounded: null,
        durationMinutesExact: 0,
        durationMinutesRounded: 0,
        contract: contract.name,
        project,
        note: currentTaskNote
    };

    recalcEntry(newEntry);
    state.entries.push(newEntry);
    state.entries.sort((a, b) => new Date(a.startRaw) - new Date(b.startRaw));
    refreshActiveEntryId();

    entryTask.value = "";
    checkJournalReminder(startAt);
    saveState();
    render();
    setEntryDefaults(startAt);
    focusEntryHour();
}

function closePreviousEntryAt(startIso) {
    const startAt = new Date(startIso);
    const previousEntry = state.entries
        .filter((entry) => {
            const entryStart = new Date(entry.startRaw);
            const entryEnd = entry.endRaw ? new Date(entry.endRaw) : null;
            if (entryStart >= startAt) {
                return false;
            }

            // Close the task that is still open at this instant or overlaps the new start time.
            return !entryEnd || entryEnd > startAt;
        })
        .sort((a, b) => new Date(b.startRaw) - new Date(a.startRaw))[0];

    if (!previousEntry) {
        return;
    }

    previousEntry.endRaw = startIso;
    recalcEntry(previousEntry);
}

function refreshActiveEntryId() {
    const newestOpen = state.entries
        .filter((entry) => !entry.endRaw)
        .sort((a, b) => new Date(b.startRaw) - new Date(a.startRaw))[0];
    state.activeEntryId = newestOpen ? newestOpen.id : null;
}

function startTaskAtTime(startAt, contract, project, stopNote) {
    const startIso = startAt.toISOString();

    pushUndo();

    const activeEntry = state.entries.find((entry) => entry.id === state.activeEntryId);
    if (activeEntry) {
        activeEntry.endRaw = startIso;
        if (stopNote) {
            activeEntry.note = stopNote;
        }
        recalcEntry(activeEntry);
    }

    const newEntry = {
        id: crypto.randomUUID(),
        date: formatDateOnly(startAt),
        startRaw: startIso,
        endRaw: null,
        startRounded: toRoundedIso(startAt),
        endRounded: null,
        durationMinutesExact: 0,
        durationMinutesRounded: 0,
        contract,
        project,
        note: ""
    };

    state.entries.push(newEntry);
    state.entries.sort((a, b) => new Date(a.startRaw) - new Date(b.startRaw));
    state.activeEntryId = newEntry.id;

    checkJournalReminder(startAt);
    saveState();
    render();
}

function checkJournalReminder(now) {
    const today = formatDateOnly(now);
    const yesterday = formatDateOnly(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    if (state.lastReminderDate === today) {
        return;
    }

    const workedYesterday = state.entries.some((entry) => entry.date === yesterday);
    const journalMissing = !state.journals[yesterday] ||
        (!state.journals[yesterday].did?.trim() && !state.journals[yesterday].learned?.trim());

    if (workedYesterday && journalMissing) {
        reminderDialog.showModal();
        state.lastReminderDate = today;
        saveState();
    }
}

function recalcEntry(entry) {
    const start = new Date(entry.startRaw);
    const end = entry.endRaw ? new Date(entry.endRaw) : new Date();
    const exactMinutes = Math.max(0, Math.round((end - start) / 60000));
    entry.startRounded = toRoundedIso(start);
    entry.endRounded = entry.endRaw ? toRoundedIso(end) : null;
    entry.durationMinutesExact = exactMinutes;
    entry.durationMinutesRounded = roundMinutesToQuarter(exactMinutes);
    entry.date = formatDateOnly(start);
}

function roundMinutesToQuarter(minutes) {
    return Math.round(minutes / 15) * 15;
}

function toRoundedIso(date) {
    const rounded = new Date(date);
    const minutes = rounded.getMinutes();
    const roundedMinutes = Math.round(minutes / 15) * 15;
    rounded.setMinutes(roundedMinutes, 0, 0);
    return rounded.toISOString();
}

function updateActiveStatus() {
    const today = formatDateOnly(new Date());
    const todayEntriesTotal = state.entries
        .filter((entry) => entry.date === today)
        .reduce((total, entry) => total + countedMinutes(entry), 0);

    activeStatus.textContent = `${formatMinutes(todayEntriesTotal)} worked`;
    todayTotal.textContent = `${formatMinutes(todayEntriesTotal)} today`;
}

function countedMinutes(entry) {
    recalcEntry(entry);
    return entry.contract === "None" ? 0 : entry.durationMinutesRounded;
}

function renderRecentEntries() {
    const entries = state.entries
        .sort((a, b) => new Date(b.startRaw) - new Date(a.startRaw));

    recentEntries.innerHTML = "";

    if (!entries.length) {
        const row = document.createElement("tr");
        row.innerHTML = `<td colspan="7" class="muted empty-history">No entries yet. Start with the row above.</td>`;
        recentEntries.appendChild(row);
        return;
    }

    let currentDate = "";
    entries.forEach((entry) => {
        recalcEntry(entry);
        if (entry.date !== currentDate) {
            currentDate = entry.date;
            const dayEntries = entries.filter((item) => item.date === currentDate);
            const dayTotal = dayEntries.reduce((total, item) => total + countedMinutes(item), 0);
            const divider = document.createElement("tr");
            divider.className = "day-divider";
            divider.innerHTML = `<th colspan="7"><span>${formatDayHeading(parseDateOnlyInput(currentDate))}</span><strong class="mono">${formatMinutes(dayTotal)}</strong></th>`;
            recentEntries.appendChild(divider);
        }
        const row = document.createElement("tr");
        row.dataset.entryId = entry.id;
        row.innerHTML = `
      <td><input class="cell-input mono cell-time" data-field="start" type="time" step="900" value="${toTimeValue(new Date(entry.startRaw))}" aria-label="Start time" /></td>
      <td><input class="cell-input mono cell-time" data-field="end" type="time" step="900" value="${entry.endRaw ? toTimeValue(new Date(entry.endRaw)) : ""}" aria-label="End time" /></td>
      <td><select class="cell-input ${entry.contract === "None" ? "is-none" : "contract-colored"}" style="--contract-hue:${getContractHue(entry.contract)}" data-field="contract" aria-label="Contract">${optionsHtml(state.settings.contracts.map((item) => item.name), entry.contract)}</select></td>
      <td><select class="cell-input ${entry.project === "None" ? "is-none" : "contract-colored"}" style="--contract-hue:${getContractHue(entry.contract)}" data-field="project" aria-label="Project">${optionsHtml((getContract(entry.contract)?.projects || ["None"]), entry.project)}</select></td>
      <td class="mono duration-cell">${formatMinutes(entry.durationMinutesRounded)}</td>
      <td><input class="cell-input cell-note" data-field="note" value="${escapeHtml(entry.note || "")}" aria-label="Task note" maxlength="120" /></td>
      <td>
        <button class="delete-entry" data-action="delete" data-id="${entry.id}" aria-label="Delete entry" title="Delete entry (Delete key)">&times;</button>
      </td>
    `;
        recentEntries.appendChild(row);
    });

    recentEntries.querySelectorAll("button[data-action='delete']").forEach((button) => {
        button.addEventListener("click", () => deleteEntry(button.dataset.id));
    });
    recentEntries.querySelectorAll(".cell-input").forEach((input) => {
        input.addEventListener("focus", () => input.select?.());
        input.addEventListener("change", () => saveInlineEdit(input));
        input.addEventListener("keydown", handleHistoryKeydown);
    });
}

function saveInlineEdit(input) {
    const row = input.closest("tr[data-entry-id]");
    const entry = state.entries.find((item) => item.id === row?.dataset.entryId);
    if (!entry) return;
    pushUndo();
    const field = input.dataset.field;
    if (field === "start" || field === "end") {
        const date = field === "start" ? new Date(entry.startRaw) : new Date(entry.endRaw || entry.startRaw);
        const [hours, minutes] = input.value.split(":").map(Number);
        if (!input.value && field === "end") entry.endRaw = null;
        else {
            date.setHours(hours, minutes, 0, 0);
            if (field === "start") entry.startRaw = date.toISOString();
            else entry.endRaw = date.toISOString();
        }
        if (entry.endRaw && new Date(entry.endRaw) < new Date(entry.startRaw)) {
            undoStack.pop();
            renderRecentEntries();
            return;
        }
    } else if (field === "contract") {
        entry.contract = input.value;
        entry.project = getContract(input.value)?.projects[0] || "None";
    } else if (field === "project") entry.project = input.value;
    else entry.note = input.value.trim();
    recalcEntry(entry);
    state.entries.sort((a, b) => new Date(a.startRaw) - new Date(b.startRaw));
    refreshActiveEntryId();
    saveState();
    render();
}

function handleHistoryKeydown(event) {
    if (event.key === "Delete" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        deleteEntry(event.target.closest("tr")?.dataset.entryId);
        return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.target.blur();
    const inputs = Array.from(recentEntries.querySelectorAll(".cell-input"));
    inputs[(inputs.indexOf(event.target) + 1) % inputs.length]?.focus();
}

function deleteEntry(entryId) {
    pushUndo();

    state.entries = state.entries.filter((entry) => entry.id !== entryId);
    if (state.activeEntryId === entryId) {
        state.activeEntryId = null;
    }

    saveState();
    render();
}

function pushUndo() {
    undoStack.push(JSON.stringify(state));
    if (undoStack.length > 40) {
        undoStack.shift();
    }
}

function undoLast() {
    if (!undoStack.length) {
        return;
    }

    const snapshot = undoStack.pop();
    state = mergeState(JSON.parse(snapshot));
    applyTheme(state.settings.theme);
    applySettingsToForm();
    updateContractSelectors();
    saveState();
    render();
}

function renderDashboard() {
    const mode = dashboardRangeState.mode;
    const bounds = getRangeBounds(mode, dashboardRangeState.anchorDate);
    const entries = getEntriesForCurrentRange(bounds)
        .filter((entry) => entry.contract !== "None" && entry.project !== "None");
    const totalsByContract = new Map();
    const totalsByProject = new Map();
    let roundedMinutes = 0;

    entries.forEach((entry) => {
        recalcEntry(entry);
        const minutes = entry.durationMinutesRounded;
        roundedMinutes += minutes;
        totalsByContract.set(
            entry.contract,
            (totalsByContract.get(entry.contract) || 0) + minutes
        );

        const projectKey = `${entry.project} (${entry.contract})`;
        totalsByProject.set(projectKey, (totalsByProject.get(projectKey) || 0) + minutes);
    });

    const contractRows = Array.from(totalsByContract.entries()).sort((a, b) => b[1] - a[1]);
    const projectRows = Array.from(totalsByProject.entries()).sort((a, b) => b[1] - a[1]);

    if (mode === "week") {
        dashboardChartCard.hidden = false;
        dashboardGrid.classList.remove("chart-hidden");
        renderWeeklyContractChart(entries, startOfWeek(bounds.start));
    } else {
        dashboardChartCard.hidden = true;
        dashboardGrid.classList.add("chart-hidden");
    }

    const wage = Number(state.settings.hourlyWage) || 0;
    const taxRateValue = (Number(state.settings.taxRate) || 0) / 100;
    const roundedHours = roundedMinutes / 60;
    const gross = roundedHours * wage;
    const takeHome = gross * (1 - taxRateValue);

    if (mode === "day" || mode === "month") {
        dashboardStats.innerHTML = `
        ${renderDashboardRows("Time by Project", projectRows, "No project time in this range.", 10)}
        ${renderDashboardRows("Time by Contract", contractRows, "No contract time in this range.", 10)}
        ${renderIncomeRows(gross, takeHome)}
    `;
        return;
    }

    dashboardStats.innerHTML = `
    <li class="stat-total"><span class="stat-total-label">Total Time for Period</span><strong class="mono stat-total-value">${formatMinutes(roundedMinutes)}</strong></li>
    ${renderDashboardRows("Time by Contract", contractRows, "No contract time in this range.", 12)}
    ${renderIncomeRows(gross, takeHome)}
  `;
}

function renderDashboardRows(title, rows, emptyMessage, limit) {
    if (!rows.length) {
        return `<li class="stats-heading">${escapeHtml(title)}</li><li class="muted">${escapeHtml(emptyMessage)}</li>`;
    }

    const content = rows
        .slice(0, limit)
        .map(([name, minutes]) => {
            const contractName = title === "Time by Project" ? name.slice(name.lastIndexOf(" (") + 2, -1) : name;
            return `<li class="stat-row"><span class="contract-colored" style="--contract-hue:${getContractHue(contractName)}">${escapeHtml(name)}</span><strong class="mono">${formatMinutes(minutes)}</strong></li>`;
        })
        .join("");

    return `<li class="stats-heading">${escapeHtml(title)}</li>${content}`;
}

function renderIncomeRows(gross, takeHome) {
    return `
        <li class="stat-row"><span>Gross</span><strong class="mono">${formatCurrency(gross)}</strong></li>
        <li class="stat-row"><span>After Tax</span><strong class="mono">${formatCurrency(takeHome)}</strong></li>
    `;
}

function renderWeeklyContractChart(entries, weekStart) {
    dashboardChartTitle.textContent = "Daily Time by Contract";
    contractChart.className = "week-bars";

    const days = [];
    for (let i = 0; i < 7; i += 1) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + i);
        days.push({
            key: formatDateOnly(dayDate),
            label: dayDate.toLocaleDateString([], { weekday: "short" }),
            totals: new Map(),
            totalMinutes: 0
        });
    }

    const dayIndex = new Map(days.map((day, index) => [day.key, index]));
    const contractSet = new Set();

    entries.forEach((entry) => {
        if (entry.contract === "None") {
            return;
        }

        const bucketIndex = dayIndex.get(entry.date);
        if (bucketIndex === undefined) {
            return;
        }

        recalcEntry(entry);
        const bucket = days[bucketIndex];
        const minutes = entry.durationMinutesRounded;
        bucket.totals.set(entry.contract, (bucket.totals.get(entry.contract) || 0) + minutes);
        bucket.totalMinutes += minutes;
        contractSet.add(entry.contract);
    });

    const contractNames = Array.from(contractSet).sort((a, b) => a.localeCompare(b));
    const maxMinutes = Math.max(...days.map((day) => day.totalMinutes), 60);
    const chartCeiling = roundUpTo(maxMinutes, 60);
    const yTickCount = 4;
    const tickValues = [];
    for (let i = yTickCount; i >= 0; i -= 1) {
        tickValues.push(Math.round((chartCeiling * i) / yTickCount));
    }

    const legendHtml = contractNames.length
        ? `<div class="week-legend">${contractNames
            .map((name) => `<span class="legend-item"><span class="legend-swatch" style="background:${getContractColor(name)}"></span>${escapeHtml(name)}</span>`)
            .join("")}</div>`
        : "";

    const yAxisHtml = `<div class="week-y-axis">${tickValues
        .map((minutes) => `<div class="week-y-tick">${formatHoursLabel(minutes)}</div>`)
        .join("")}</div>`;

    const barsHtml = days
        .map((day) => {
            const segments = contractNames
                .map((contractName) => {
                    const minutes = day.totals.get(contractName) || 0;
                    if (!minutes) {
                        return "";
                    }
                    const pct = (minutes / chartCeiling) * 100;
                    return `<div class="week-segment" style="height:${pct.toFixed(2)}%;background:${getContractColor(contractName)}" title="${escapeHtml(contractName)}: ${formatMinutes(minutes)}"></div>`;
                })
                .join("");

            return `
                <div class="week-day">
                    <div class="week-stack">${segments}</div>
                    <div class="week-day-label">${escapeHtml(day.label)}</div>
                    <div class="week-day-total mono">${formatMinutes(day.totalMinutes)}</div>
                </div>
            `;
        })
        .join("");

    const empty = !contractNames.length
        ? "<p class='muted'>No contract data in this week yet.</p>"
        : "";

    contractChart.innerHTML = `
        ${legendHtml}
        <div class="week-chart">
            ${yAxisHtml}
            <div class="week-plot">${barsHtml}</div>
        </div>
        ${empty}
    `;
}

function getContractColor(name) {
    return `hsl(${getContractHue(name)} 32% 57%)`;
}

function roundUpTo(value, step) {
    return Math.ceil(value / step) * step;
}

function formatHoursLabel(minutes) {
    return `${(minutes / 60).toFixed(1).replace(/\.0$/, "")}h`;
}

function getEntriesForCurrentRange(bounds) {
    const todayEnd = endOfDay(new Date());
    const end = bounds.end > todayEnd ? todayEnd : bounds.end;

    if (bounds.start > end) {
        return [];
    }

    return state.entries.filter((entry) => {
        const startRaw = new Date(entry.startRaw);
        if (startRaw < bounds.start) {
            return false;
        }
        if (startRaw > end) {
            return false;
        }
        return true;
    });
}

function getRangeBounds(mode, anchorDate) {
    const anchor = startOfDay(anchorDate || new Date());
    const now = new Date();
    let start = startOfDay(anchor);
    let end = endOfDay(anchor);

    if (mode === "week") {
        start = startOfWeek(anchor);
        end = endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
    } else if (mode === "month") {
        start = startOfDay(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
        const monthEnd = endOfDay(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
        const inCurrentMonth = anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth();
        end = inCurrentMonth ? endOfDay(now) : monthEnd;
    } else if (mode === "year") {
        start = startOfDay(new Date(anchor.getFullYear(), 0, 1));
        const yearEnd = endOfDay(new Date(anchor.getFullYear(), 11, 31));
        const inCurrentYear = anchor.getFullYear() === now.getFullYear();
        end = inCurrentYear ? endOfDay(now) : yearEnd;
    }

    return { start, end };
}

function saveJournal(dateOverride) {
    const date = typeof dateOverride === "string" ? dateOverride : (loadedJournalDate || journalDate.value || formatDateOnly(new Date()));
    state.journals[date] = {
        contract: journalContractSelect.value || "None",
        project: journalContractSelect.value === "None" ? "None" : (journalProjectSelect.value || "None"),
        did: normalizeBulletText(journalDid.value),
        learned: normalizeBulletText(journalLearned.value),
        next: normalizeBulletText(journalNext.value),
        updatedAt: new Date().toISOString()
    };

    if (document.activeElement !== journalDid) journalDid.value = state.journals[date].did;
    if (document.activeElement !== journalLearned) journalLearned.value = state.journals[date].learned;
    if (document.activeElement !== journalNext) journalNext.value = state.journals[date].next;

    saveState();
}

function loadJournalForDate(dateValue) {
    const date = dateValue || formatDateOnly(new Date());
    loadedJournalDate = date;
    const journal = state.journals[date] || {
        contract: entryContract.value || "None",
        project: entryProject.value || "None",
        did: "",
        learned: "",
        next: ""
    };
    journalContractSelect.value = journal.contract || "None";
    updateJournalProjectSelect();
    journalProjectSelect.value = journal.contract === "None" ? "None" : (journal.project || journalProjectSelect.value);
    journalDid.value = normalizeBulletText(journal.did || "");
    journalLearned.value = normalizeBulletText(journal.learned || "");
    journalNext.value = normalizeBulletText(journal.next || "");
    const dateObject = parseDateOnlyInput(date);
    journalDateLabel.textContent = formatDayHeading(dateObject);
    renderJournalDays(dateObject);
}

function shiftJournalDay(amount) {
    saveJournal();
    const date = parseDateOnlyInput(journalDate.value) || new Date();
    date.setDate(date.getDate() + amount);
    journalDate.value = formatDateOnly(date);
    loadJournalForDate(journalDate.value);
}

function renderJournalDays(selectedDate) {
    journalDays.innerHTML = "";
    for (let offset = -4; offset <= 4; offset += 1) {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() + offset);
        const key = formatDateOnly(date);
        const button = document.createElement("button");
        button.type = "button";
        button.className = key === journalDate.value ? "active" : "";
        button.innerHTML = `<span>${date.toLocaleDateString([], { weekday: "short" })}</span><strong>${date.getDate()}</strong>`;
        button.addEventListener("click", () => {
            saveJournal();
            journalDate.value = key;
            loadJournalForDate(key);
        });
        journalDays.appendChild(button);
    }
    journalDays.querySelector(".active")?.scrollIntoView({ block: "nearest", inline: "center" });
}

function scheduleJournalSave() {
    clearTimeout(journalSaveTimer);
    journalSaveTimer = setTimeout(saveJournal, 300);
}

function focusNextJournalSection(current) {
    const sections = [journalDid, journalLearned, journalNext];
    const index = sections.indexOf(current);
    sections[(index + 1 + sections.length) % sections.length].focus();
}

function hasJournalContent(journal) {
    return Boolean(journal.did.trim() || journal.learned.trim() || journal.next.trim());
}

function renderJournalSection(title, content) {
    if (!content.trim()) {
        return "";
    }

    const body = escapeHtml(content).replaceAll("\n", "<br>");
    return `
        <div class="note-section">
            <strong>${escapeHtml(title)}</strong>
            <div class="note-section-body">${body}</div>
        </div>
    `;
}

function saveSettings() {
    state.settings.theme = themeSelect.value;
    state.settings.weekEndsAt = weekEnds.value || "17:00";
    state.settings.reportDay = reportDay.value;
    state.settings.hourlyWage = Number(hourlyWage.value) || 0;
    state.settings.taxRate = Number(taxRate.value) || 0;

    applyTheme(state.settings.theme);
    saveState();
    renderDashboard();
}

function applySettingsToForm() {
    themeSelect.value = state.settings.theme;
    weekEnds.value = state.settings.weekEndsAt;
    reportDay.value = state.settings.reportDay;
    hourlyWage.value = state.settings.hourlyWage;
    taxRate.value = state.settings.taxRate;
}

function addContract() {
    const name = newContract.value.trim();
    if (!name || name.toLowerCase() === "none") {
        return;
    }

    const exists = state.settings.contracts.some((contract) => contract.name.toLowerCase() === name.toLowerCase());
    if (exists) {
        return;
    }

    state.settings.contracts.push({ name, projects: ["General"] });
    newContract.value = "";
    saveState();
    updateContractSelectors();
    renderContractsAndProjects();
}

function addProject() {
    const name = newProject.value.trim();
    const contractName = projectContract.value;
    if (!name || !contractName || contractName === "None") {
        return;
    }

    const contract = getContract(contractName);
    if (!contract) {
        return;
    }

    const exists = contract.projects.some((project) => project.toLowerCase() === name.toLowerCase());
    if (exists) {
        return;
    }

    contract.projects.push(name);
    newProject.value = "";
    saveState();
    updateContractSelectors();
    renderProjectList();
}

function renderContractsAndProjects() {
    contractList.innerHTML = "";

    state.settings.contracts.forEach((contract) => {
        const li = document.createElement("li");
        if (contract.name === "None") {
            li.className = "is-none";
            li.textContent = "None (system)";
        } else {
            li.innerHTML = `${escapeHtml(contract.name)} <button class="ghost" data-remove-contract="${escapeHtml(contract.name)}">Remove</button>`;
            colorizeContract(li, contract.name);
        }
        contractList.appendChild(li);
    });

    contractList.querySelectorAll("button[data-remove-contract]").forEach((button) => {
        button.addEventListener("click", () => removeContract(button.dataset.removeContract));
    });

    renderProjectList();
}

function renderProjectList() {
    const contract = getContract(projectContract.value);
    projectList.innerHTML = "";
    if (!contract) {
        return;
    }

    contract.projects.forEach((project) => {
        const li = document.createElement("li");
        if (contract.name === "None" || project === "None") {
            li.className = "is-none";
            li.textContent = `${project} (system)`;
        } else {
            li.innerHTML = `${escapeHtml(project)} <button class="ghost" data-remove-project="${escapeHtml(project)}">Remove</button>`;
            colorizeContract(li, project, contract.name);
        }
        projectList.appendChild(li);
    });

    projectList.querySelectorAll("button[data-remove-project]").forEach((button) => {
        button.addEventListener("click", () => removeProject(contract.name, button.dataset.removeProject));
    });
}

function removeContract(contractName) {
    pushUndo();
    state.settings.contracts = state.settings.contracts.filter((contract) => contract.name !== contractName);
    state.entries = state.entries.map((entry) => {
        if (entry.contract === contractName) {
            return { ...entry, contract: "None", project: "None" };
        }
        return entry;
    });

    saveState();
    updateContractSelectors();
    render();
}

function removeProject(contractName, projectName) {
    pushUndo();

    const contract = getContract(contractName);
    if (!contract) {
        return;
    }

    contract.projects = contract.projects.filter((project) => project !== projectName);
    if (!contract.projects.length) {
        contract.projects.push("General");
    }

    state.entries = state.entries.map((entry) => {
        if (entry.contract === contractName && entry.project === projectName) {
            return { ...entry, project: contract.projects[0] };
        }
        return entry;
    });

    saveState();
    updateContractSelectors();
    renderProjectList();
    renderRecentEntries();
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    appRoot.dataset.theme = theme;
}

function startClock() {
    const tick = () => {
        clock.textContent = new Date().toLocaleString([], {
            weekday: "short",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
        updateActiveStatus();
        if (currentPage() === "dashboard") {
            renderDashboard();
        }
    };

    tick();
    setInterval(tick, 30000);
}

function openPalette() {
    paletteSearch.value = "";
    renderPalette();
    paletteDialog.showModal();
    paletteSearch.focus();
}

function renderPalette() {
    const query = paletteSearch.value.trim().toLowerCase();
    const filtered = commands.filter((command) => command.label.toLowerCase().includes(query));

    paletteList.innerHTML = "";
    filtered.forEach((command) => {
        const li = document.createElement("li");
        li.innerHTML = `<button class="ghost" data-cmd="${command.key}">${command.label}</button>`;
        paletteList.appendChild(li);
    });
}

function setupJournalBulletEditing() {
    [journalDid, journalLearned, journalNext].forEach((field) => {
        field.addEventListener("keydown", (event) => {
            if (event.ctrlKey && event.key === "Enter") {
                event.preventDefault();
                saveJournal();
                focusNextJournalSection(field);
                return;
            }
            if (event.key !== "Enter") {
                return;
            }
            event.preventDefault();
            const cursorStart = field.selectionStart;
            const cursorEnd = field.selectionEnd;
            const value = field.value;
            field.value = `${value.slice(0, cursorStart)}\n- ${value.slice(cursorEnd)}`;
            const nextPos = cursorStart + 3;
            field.setSelectionRange(nextPos, nextPos);
        });

        field.addEventListener("blur", () => {
            field.value = normalizeBulletText(field.value);
            saveJournal();
        });
        field.addEventListener("input", scheduleJournalSave);
    });
}

function normalizeBulletText(text) {
    const cleaned = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => (line.startsWith("- ") ? line : `- ${line.replace(/^[-*]\s*/, "")}`));
    return cleaned.join("\n");
}

function parseCsvLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === "," && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += ch;
        }
    }

    result.push(current);
    return result;
}

function escapeCsvCell(value) {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replaceAll('"', '""')}"`;
    }
    return text;
}

function formatDateOnly(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseDateOnlyInput(value) {
    if (!value) {
        return null;
    }
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.valueOf())) {
        return null;
    }
    return parsed;
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toTimeValue(date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDayHeading(date) {
    return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

function optionsHtml(values, selected) {
    return values.map((value) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}${value === "None" ? ' class="is-none"' : ""}>${escapeHtml(value)}</option>`).join("");
}

function toLocalDateTimeValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatMinutes(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function formatCurrency(value) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value || 0);
}

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfWeek(date) {
    const result = startOfDay(date);
    const day = result.getDay();
    const delta = day;
    result.setDate(result.getDate() - delta);
    return result;
}

function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
