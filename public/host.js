let socket = null;

const elements = {
  hostLoginCard: document.getElementById("hostLoginCard"),
  hostLoginForm: document.getElementById("hostLoginForm"),
  hostCodeInput: document.getElementById("hostCodeInput"),
  hostControls: document.getElementById("hostControls"),
  hostStatusCard: document.getElementById("hostStatusCard"),
  hostStatusLabel: document.getElementById("hostStatusLabel"),
  hostStatusDetail: document.getElementById("hostStatusDetail"),
  hostQuestionLabel: document.getElementById("hostQuestionLabel"),
  hostLiveCount: document.getElementById("hostLiveCount"),
  questionBank: document.getElementById("questionBank"),
  questionImport: document.getElementById("questionImport"),
  questionImportFile: document.getElementById("questionImportFile"),
  fillImportTemplateButton: document.getElementById("fillImportTemplateButton"),
  questionEditorForm: document.getElementById("questionEditorForm"),
  editorPrompt: document.getElementById("editorPrompt"),
  editorChoices: document.getElementById("editorChoices"),
  editorCategory: document.getElementById("editorCategory"),
  editorCorrectIndex: document.getElementById("editorCorrectIndex"),
  editorPoints: document.getElementById("editorPoints"),
  editorTimeLimit: document.getElementById("editorTimeLimit"),
  editorExplanation: document.getElementById("editorExplanation"),
  saveQuestionButton: document.getElementById("saveQuestionButton"),
  addQuestionButton: document.getElementById("addQuestionButton"),
  duplicateQuestionButton: document.getElementById("duplicateQuestionButton"),
  deleteQuestionButton: document.getElementById("deleteQuestionButton"),
  openQuestionButton: document.getElementById("openQuestionButton"),
  closeAnswersButton: document.getElementById("closeAnswersButton"),
  revealAnswerButton: document.getElementById("revealAnswerButton"),
  nextQuestionButton: document.getElementById("nextQuestionButton"),
  returnLobbyButton: document.getElementById("returnLobbyButton"),
  resetQuizButton: document.getElementById("resetQuizButton"),
  importQuestionsButton: document.getElementById("importQuestionsButton"),
  toast: document.getElementById("toast")
};

const state = {
  publicState: null,
  hostState: { authorized: false, questions: [], currentQuestionIndex: 0 },
  selectedQuestionIndex: null,
  pendingSelectedQuestionIndex: null,
  editorDirty: false,
  editorQuestionId: "",
  editorSnapshot: ""
};

bootstrap();

async function bootstrap() {
  try {
    await loadSocketClient();
    if (window.io) {
      socket = window.io();
    }
  } catch (_error) {
    showToast("`http://localhost:3000` で開いてください。", "error");
    return;
  }

  bindEvents();
  bindSocketEvents();

  const savedCode = localStorage.getItem("festival-quiz-host-code");
  if (savedCode) {
    elements.hostCodeInput.value = savedCode;
  }
}

function bindEvents() {
  elements.hostLoginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const code = elements.hostCodeInput.value.trim();

    if (!code) {
      showToast("司会者コードを入力してください。", "error");
      return;
    }

    localStorage.setItem("festival-quiz-host-code", code);
    socket.emit("host:authenticate", { code });
  });

  elements.openQuestionButton.addEventListener("click", () => {
    socket.emit("host:open-question", { questionIndex: state.selectedQuestionIndex });
  });

  elements.closeAnswersButton.addEventListener("click", () => {
    socket.emit("host:close-answers");
  });

  elements.revealAnswerButton.addEventListener("click", () => {
    socket.emit("host:reveal-answer");
  });

  elements.nextQuestionButton.addEventListener("click", () => {
    socket.emit("host:next-question");
  });

  elements.returnLobbyButton.addEventListener("click", () => {
    socket.emit("host:return-lobby");
  });

  elements.resetQuizButton.addEventListener("click", () => {
    if (window.confirm("得点と回答履歴をすべてリセットします。よろしいですか？")) {
      socket.emit("host:reset-quiz");
    }
  });

  elements.saveQuestionButton.addEventListener("click", () => {
    const existingQuestion = getSelectedQuestion();
    const question = buildQuestionFromEditor(existingQuestion);
    if (!question) {
      return;
    }

    state.editorDirty = false;
    socket.emit("host:save-question", {
      index: state.selectedQuestionIndex,
      question
    });
  });

  elements.addQuestionButton.addEventListener("click", () => {
    state.pendingSelectedQuestionIndex = (state.selectedQuestionIndex ?? 0) + 1;
    state.editorDirty = false;
    socket.emit("host:add-question", { afterIndex: state.selectedQuestionIndex ?? 0 });
  });

  elements.duplicateQuestionButton.addEventListener("click", () => {
    state.pendingSelectedQuestionIndex = (state.selectedQuestionIndex ?? 0) + 1;
    state.editorDirty = false;
    socket.emit("host:duplicate-question", { index: state.selectedQuestionIndex ?? 0 });
  });

  elements.deleteQuestionButton.addEventListener("click", () => {
    if (!window.confirm("この問題を削除します。よろしいですか？")) {
      return;
    }

    state.pendingSelectedQuestionIndex = Math.max(0, (state.selectedQuestionIndex ?? 0) - 1);
    state.editorDirty = false;
    socket.emit("host:delete-question", { index: state.selectedQuestionIndex ?? 0 });
  });

  elements.importQuestionsButton.addEventListener("click", () => {
    importQuestionsFromText(elements.questionImport.value, "貼り付け内容");
  });

  elements.questionImportFile.addEventListener("change", async (event) => {
    const [file] = Array.from(event.target.files || []);
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      importQuestionsFromText(text, file.name);
    } catch (_error) {
      showToast("ファイルを読み込めませんでした。", "error");
    } finally {
      event.target.value = "";
    }
  });

  elements.fillImportTemplateButton.addEventListener("click", () => {
    elements.questionImport.value = buildImportTemplate();
    showToast("貼り付け用の見本を入れました。", "success");
  });

  [
    elements.editorPrompt,
    elements.editorChoices,
    elements.editorCorrectIndex,
    elements.editorCategory,
    elements.editorPoints,
    elements.editorTimeLimit,
    elements.editorExplanation
  ].forEach((input) => {
    input.addEventListener("input", handleEditorInput);
    input.addEventListener("change", handleEditorInput);
  });
}

function bindSocketEvents() {
  socket.on("connect", () => {
    const savedCode = localStorage.getItem("festival-quiz-host-code");
    if (savedCode) {
      socket.emit("host:authenticate", { code: savedCode });
    }
  });

  socket.on("host:state", (payload) => {
    const wasAuthorized = state.hostState.authorized;
    state.hostState = payload;

    if (payload.authorized && !wasAuthorized) {
      state.selectedQuestionIndex = payload.currentQuestionIndex ?? 0;
    }

    if (payload.authorized) {
      if (Number.isInteger(state.pendingSelectedQuestionIndex)) {
        state.selectedQuestionIndex = Math.max(0, Math.min(state.pendingSelectedQuestionIndex, payload.questions.length - 1));
        state.pendingSelectedQuestionIndex = null;
      } else if (state.selectedQuestionIndex === null || state.selectedQuestionIndex >= payload.questions.length) {
        state.selectedQuestionIndex = Math.max(0, Math.min(payload.currentQuestionIndex ?? 0, payload.questions.length - 1));
      }
    }

    renderHostState();
  });

  socket.on("state:update", (payload) => {
    state.publicState = payload;
    renderHostState();
  });

  socket.on("toast", ({ message, tone }) => {
    showToast(message, tone);
  });
}

function renderHostState() {
  const host = state.hostState;
  elements.hostLoginCard.classList.toggle("hidden", host.authorized);
  elements.hostControls.classList.toggle("hidden", !host.authorized);

  if (!host.authorized) {
    return;
  }

  const quiz = state.publicState;
  const selectedQuestion = getSelectedQuestion();
  const currentMode = getQuizMode(quiz);
  const activeCategory = quiz?.currentQuestion?.category || selectedQuestion?.category || "trend-expired";
  document.body.dataset.questionType = activeCategory;

  renderStatusCard(quiz, currentMode);

  elements.hostQuestionLabel.textContent = selectedQuestion
    ? `Q${(state.selectedQuestionIndex ?? 0) + 1} / ${questionCategoryLabel(selectedQuestion.category)}`
    : "-";
  elements.hostLiveCount.textContent = String(quiz?.responseCount ?? 0);

  renderQuestionBank(host.questions);
  renderQuestionEditor(selectedQuestion);

  const status = quiz?.status || "lobby";
  elements.openQuestionButton.disabled = state.selectedQuestionIndex === null || status === "question";
  elements.closeAnswersButton.disabled = status !== "question" || !host.acceptingAnswers;
  elements.revealAnswerButton.disabled = status !== "question" || host.acceptingAnswers;
  elements.nextQuestionButton.disabled = !["question", "reveal"].includes(status);
  elements.duplicateQuestionButton.disabled = state.selectedQuestionIndex === null;
  elements.deleteQuestionButton.disabled = host.questions.length <= 1 || state.selectedQuestionIndex === null;
}

function renderStatusCard(quiz, mode) {
  elements.hostStatusCard.dataset.mode = mode;
  elements.hostStatusCard.dataset.questionType = quiz?.currentQuestion?.category || "trend-expired";

  if (!quiz?.currentQuestion) {
    elements.hostStatusLabel.textContent = "待機中";
    elements.hostStatusDetail.textContent = "まだ問題は出ていません。開始したい問題を選んで進行してください。";
    return;
  }

  if (mode === "question") {
    elements.hostStatusLabel.textContent = "回答受付中";
    elements.hostStatusDetail.textContent = "会場は回答できます。締め切るときは「回答受付を終了」を押してください。";
    return;
  }

  if (mode === "locked") {
    elements.hostStatusLabel.textContent = "集計中";
    elements.hostStatusDetail.textContent = "受付は終了しています。確認できたら「正解を発表」に進めます。";
    return;
  }

  if (mode === "reveal") {
    elements.hostStatusLabel.textContent = "正解発表";
    elements.hostStatusDetail.textContent = "正解と結果を表示中です。次へ進むと次の問題に移れます。";
    return;
  }

  elements.hostStatusLabel.textContent = "クイズ終了";
  elements.hostStatusDetail.textContent = "全問題が終わりました。必要なら得点リセットや問題編集ができます。";
}

function renderQuestionBank(questions) {
  elements.questionBank.innerHTML = questions
    .map((question, index) => `
      <button type="button" class="question-chip ${index === state.selectedQuestionIndex ? "is-selected" : ""}" data-question-index="${index}" data-category="${escapeHtml(question.category || "trend-expired")}">
        <strong>Q${index + 1}</strong>
        <em class="question-chip-category">${escapeHtml(questionCategoryLabel(question.category))}</em>
        <span>${escapeHtml(question.prompt)}</span>
      </button>
    `)
    .join("");

  elements.questionBank.querySelectorAll("[data-question-index]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedQuestionIndex = Number(button.dataset.questionIndex);
      state.pendingSelectedQuestionIndex = null;
      state.editorDirty = false;
      renderHostState();
    });
  });
}

function renderQuestionEditor(question) {
  if (!question) {
    return;
  }

  const snapshot = JSON.stringify(question);
  const shouldRefresh =
    !state.editorDirty ||
    state.editorQuestionId !== question.id ||
    state.editorSnapshot !== snapshot;

  if (!shouldRefresh) {
    return;
  }

  elements.editorPrompt.value = question.prompt;
  elements.editorChoices.value = question.choices.join("\n");
  elements.editorCategory.value = question.category || "trend-expired";
  elements.editorPoints.value = String(question.points ?? 100);
  elements.editorTimeLimit.value = String(question.timeLimit ?? 15);
  elements.editorExplanation.value = question.explanation || "";
  syncCorrectOptions(question.correctIndex);

  state.editorDirty = false;
  state.editorQuestionId = question.id;
  state.editorSnapshot = snapshot;
}

function handleEditorInput(event) {
  if (event.target === elements.editorChoices) {
    syncCorrectOptions(Number(elements.editorCorrectIndex.value) || 0);
  }

  state.editorDirty = true;
}

function syncCorrectOptions(preferredIndex = 0) {
  const choices = parseChoices(elements.editorChoices.value);
  const selectedIndex = Math.max(0, Math.min(preferredIndex, Math.max(choices.length - 1, 0)));

  if (choices.length === 0) {
    elements.editorCorrectIndex.innerHTML = "<option value=\"0\">選択肢を入力してください</option>";
    elements.editorCorrectIndex.value = "0";
    return;
  }

  elements.editorCorrectIndex.innerHTML = choices
    .map((choice, index) => `
      <option value="${index}">
        ${String.fromCharCode(65 + index)}: ${escapeHtml(choice)}
      </option>
    `)
    .join("");
  elements.editorCorrectIndex.value = String(selectedIndex);
}

function buildQuestionFromEditor(existingQuestion) {
  const prompt = elements.editorPrompt.value.trim();
  const choices = parseChoices(elements.editorChoices.value);
  const correctIndex = Number(elements.editorCorrectIndex.value);
  const category = elements.editorCategory.value;
  const points = Number(elements.editorPoints.value || 100);
  const timeLimit = Number(elements.editorTimeLimit.value || 15);
  const explanation = elements.editorExplanation.value.trim();

  if (!prompt) {
    showToast("問題文を入力してください。", "error");
    return null;
  }

  if (choices.length < 2) {
    showToast("選択肢は2つ以上入力してください。", "error");
    return null;
  }

  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
    showToast("正解の選択肢を選んでください。", "error");
    return null;
  }

  return {
    id: existingQuestion?.id || "",
    prompt,
    category,
    choices,
    correctIndex,
    points: Number.isFinite(points) ? points : 100,
    timeLimit: Number.isFinite(timeLimit) ? timeLimit : 15,
    explanation
  };
}

function parseChoices(value) {
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function importQuestionsFromText(rawText, sourceLabel = "貼り付け内容") {
  if (!String(rawText || "").trim()) {
    showToast("読み込む内容を入力してください。", "error");
    return;
  }

  try {
    const rows = parseImportRows(rawText);
    const questions = convertImportRowsToQuestions(rows);
    socket.emit("host:import-questions", { rawJson: JSON.stringify(questions) });
    showToast(`${questions.length}問を ${sourceLabel} から読み込みます。`, "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function parseImportRows(rawText) {
  const normalized = String(rawText).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized.split("\n").filter((line) => line.trim());
  const firstLine = lines[0] || "";
  const delimiter = detectDelimiter(firstLine, normalized);
  return parseDelimitedTable(normalized, delimiter)
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
}

function detectDelimiter(firstLine, fullText) {
  if (firstLine.includes("\t")) {
    return "\t";
  }

  const commaCount = (fullText.match(/,/g) || []).length;
  const semicolonCount = (fullText.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

function parseDelimitedTable(rawText, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < rawText.length; index += 1) {
    const char = rawText[index];
    const nextChar = rawText[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function convertImportRowsToQuestions(rows) {
  if (!rows.length) {
    throw new Error("読み込める行がありません。");
  }

  const headerInfo = detectHeaderRow(rows[0]);
  const dataRows = headerInfo.hasHeader ? rows.slice(1) : rows;

  const questions = dataRows
    .filter((row) => row.some(Boolean))
    .map((row, index) => normalizeImportedQuestionRow(row, headerInfo, index))
    .filter(Boolean);

  if (!questions.length) {
    throw new Error("問題が1問も見つかりませんでした。");
  }

  return questions;
}

function detectHeaderRow(row) {
  const aliases = buildHeaderAliases();
  const headerMap = {};
  let matchedCount = 0;

  row.forEach((cell, index) => {
    const normalized = normalizeHeaderCell(cell);
    const matchedKey = Object.keys(aliases).find((key) => aliases[key].includes(normalized));
    if (matchedKey) {
      headerMap[matchedKey] = index;
      matchedCount += 1;
    }
  });

  return {
    hasHeader: matchedCount >= 3 || "prompt" in headerMap || "correct" in headerMap,
    headerMap
  };
}

function buildHeaderAliases() {
  return {
    prompt: ["問題文", "問題", "prompt", "question"],
    choice1: ["選択肢1", "選択肢a", "choice1", "choicea", "a"],
    choice2: ["選択肢2", "選択肢b", "choice2", "choiceb", "b"],
    choice3: ["選択肢3", "選択肢c", "choice3", "choicec", "c"],
    choice4: ["選択肢4", "選択肢d", "choice4", "choiced", "d"],
    choice5: ["選択肢5", "選択肢e", "choice5", "choicee", "e"],
    choice6: ["選択肢6", "選択肢f", "choice6", "choicef", "f"],
    correct: ["正解", "correct", "answer", "正答"],
    category: ["タイプ", "カテゴリ", "category", "genre", "種類"],
    points: ["点数", "points", "score", "pt"],
    timeLimit: ["秒数", "制限時間", "time", "timelimit", "time_limit"],
    explanation: ["解説", "explanation", "comment", "補足"]
  };
}

function normalizeHeaderCell(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[ _-]/g, "");
}

function normalizeImportedQuestionRow(row, headerInfo, index) {
  const prompt = getImportedCell(row, headerInfo, "prompt", 0).trim();
  if (!prompt) {
    return null;
  }

  const choices = [];
  for (let choiceIndex = 0; choiceIndex < 6; choiceIndex += 1) {
    const choice = getImportedCell(row, headerInfo, `choice${choiceIndex + 1}`, choiceIndex + 1).trim();
    if (choice) {
      choices.push(choice);
    }
  }

  if (choices.length < 2) {
    throw new Error(`${index + 1}行目: 選択肢は2つ以上必要です。`);
  }

  const correctValue = getImportedCell(row, headerInfo, "correct", 5).trim();
  const pointsValue = getImportedCell(row, headerInfo, "points", 7).trim();
  const timeValue = getImportedCell(row, headerInfo, "timeLimit", 8).trim();

  return {
    prompt,
    choices,
    correctIndex: parseCorrectIndex(correctValue, choices, index),
    category: normalizeImportedCategory(getImportedCell(row, headerInfo, "category", 6)),
    points: parseOptionalNumber(pointsValue, 100, 10),
    timeLimit: parseOptionalNumber(timeValue, 15, 5),
    explanation: getImportedCell(row, headerInfo, "explanation", 9).trim()
  };
}

function getImportedCell(row, headerInfo, key, fallbackIndex) {
  const mappedIndex = headerInfo.headerMap[key];
  const index = Number.isInteger(mappedIndex) ? mappedIndex : fallbackIndex;
  return String(row[index] || "");
}

function parseCorrectIndex(value, choices, rowIndex) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error(`${rowIndex + 1}行目: 正解を入れてください。`);
  }

  const letter = trimmed.toUpperCase();
  if (/^[A-F]$/.test(letter)) {
    const letterIndex = letter.charCodeAt(0) - 65;
    if (letterIndex < choices.length) {
      return letterIndex;
    }
  }

  if (/^\d+$/.test(trimmed)) {
    const numberValue = Number(trimmed);
    if (numberValue >= 1 && numberValue <= choices.length) {
      return numberValue - 1;
    }
    if (numberValue >= 0 && numberValue < choices.length) {
      return numberValue;
    }
  }

  const choiceIndex = choices.findIndex((choice) => choice === trimmed);
  if (choiceIndex >= 0) {
    return choiceIndex;
  }

  throw new Error(`${rowIndex + 1}行目: 正解は A / B / C / D か、選択肢番号で入れてください。`);
}

function normalizeImportedCategory(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) {
    return "trend-expired";
  }
  if (text.includes("song") || text.includes("曲")) {
    return "trend-song";
  }
  if (text.includes("retro") || text.includes("昔") || text.includes("古") || text.includes("懐")) {
    return "retro-trend";
  }
  return "trend-expired";
}

function parseOptionalNumber(value, fallbackValue, minValue) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallbackValue;
  }
  return Math.max(minValue, Math.round(numberValue));
}

function buildImportTemplate() {
  return [
    ["問題文", "選択肢1", "選択肢2", "選択肢3", "選択肢4", "正解", "タイプ", "点数", "秒数", "解説"].join("\t"),
    ["今いちばん使われがちなSNSは？", "BeReal", "mixi", "前略プロフィール", "ガラケー掲示板", "A", "今", "100", "15", "最近のSNS感覚をチェックする問題です。"].join("\t"),
    ["この中で最近の流行曲として最も近いものは？", "はいよろこんで", "世界に一つだけの花", "小さな恋のうた", "Runner", "A", "曲", "100", "15", "曲ジャンルの例です。"].join("\t")
  ].join("\n");
}

function getSelectedQuestion() {
  if (!state.hostState.questions?.length || state.selectedQuestionIndex === null) {
    return null;
  }

  return state.hostState.questions[state.selectedQuestionIndex] || null;
}

function getQuizMode(quiz) {
  if (!quiz) {
    return "lobby";
  }
  if (quiz.status === "reveal") {
    return "reveal";
  }
  if (quiz.status === "finished") {
    return "finished";
  }
  if (quiz.status === "question" && quiz.currentQuestion?.acceptingAnswers) {
    return "question";
  }
  if (quiz.status === "question") {
    return "locked";
  }
  return "lobby";
}

function questionCategoryLabel(category) {
  if (category === "trend-song") {
    return "流行り曲チェック";
  }
  if (category === "retro-trend") {
    return "懐かし流行チェック";
  }
  return "今の流行チェック";
}

function loadSocketClient() {
  if (window.io) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/socket.io/socket.io.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("socket.io client could not be loaded"));
    document.head.append(script);
  });
}

function showToast(message, tone = "success") {
  elements.toast.textContent = message;
  elements.toast.className = `toast is-visible ${tone}`;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.className = "toast";
  }, 3200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
