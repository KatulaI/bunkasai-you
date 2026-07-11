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
  questionEditorForm: document.getElementById("questionEditorForm"),
  editorPrompt: document.getElementById("editorPrompt"),
  editorChoices: document.getElementById("editorChoices"),
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
    socket.emit("host:import-questions", { rawJson: elements.questionImport.value });
  });

  [
    elements.editorPrompt,
    elements.editorChoices,
    elements.editorCorrectIndex,
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

  renderStatusCard(quiz, currentMode);

  elements.hostQuestionLabel.textContent = selectedQuestion ? `Q${(state.selectedQuestionIndex ?? 0) + 1}` : "-";
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
      <button type="button" class="question-chip ${index === state.selectedQuestionIndex ? "is-selected" : ""}" data-question-index="${index}">
        <strong>Q${index + 1}</strong>
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
