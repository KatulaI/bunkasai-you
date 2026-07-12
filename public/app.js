let socket = null;

const defaultSiteConfig = {
  branding: {
    browserTitle: "イマドキチェック",
    eyebrow: "Bunkasai Quiz Event",
    title: "イマドキチェック",
    subtitle: "その感覚、まだちゃんと今っぽい？ 会場みんなで参加する流行クイズです。"
  },
  theme: {
    vars: {}
  }
};

const siteConfig = normalizeSiteConfig(window.siteConfig || {});

const state = {
  publicState: null,
  isPreview: false,
  isSplashVisible: false,
  hasAccess: Boolean(localStorage.getItem("festival-quiz-player-name")),
  player: {
    id: localStorage.getItem("festival-quiz-player-id") || "",
    name: localStorage.getItem("festival-quiz-player-name") || ""
  }
};

const elements = {
  accessGate: document.getElementById("accessGate"),
  accessForm: document.getElementById("accessForm"),
  accessNameInput: document.getElementById("accessNameInput"),
  splashScreen: document.getElementById("splashScreen"),
  appShell: document.getElementById("appShell"),
  eyebrow: document.getElementById("eyebrow"),
  title: document.getElementById("title"),
  subtitle: document.getElementById("subtitle"),
  participantCount: document.getElementById("participantCount"),
  responseCount: document.getElementById("responseCount"),
  statusText: document.getElementById("statusText"),
  statusStrip: document.getElementById("statusStrip"),
  statusHeadline: document.getElementById("statusHeadline"),
  statusDetail: document.getElementById("statusDetail"),
  questionMeta: document.getElementById("questionMeta"),
  displayQuestion: document.getElementById("displayQuestion"),
  displayQuestionMedia: document.getElementById("displayQuestionMedia"),
  displayChoices: document.getElementById("displayChoices"),
  joinForm: document.getElementById("joinForm"),
  nameInput: document.getElementById("nameInput"),
  playerIdentity: document.getElementById("playerIdentity"),
  playerFeedback: document.getElementById("playerFeedback"),
  responseSummary: document.getElementById("responseSummary"),
  resultBars: document.getElementById("resultBars"),
  leaderboard: document.getElementById("leaderboard"),
  toast: document.getElementById("toast")
};

bootstrap();

async function bootstrap() {
  applySiteConfig();
  setAccessState(Boolean(state.player.name));

  if (state.player.name) {
    elements.accessNameInput.value = state.player.name;
    elements.nameInput.value = state.player.name;
  }

  if (location.protocol !== "file:") {
    try {
      await loadSocketClient();
      if (window.io) {
        socket = window.io();
      }
    } catch (_error) {
      state.isPreview = true;
    }
  } else {
    state.isPreview = true;
  }

  bindEvents();

  if (socket) {
    bindSocketEvents();
    return;
  }

  applyPreviewState();
  showToast("デザイン確認用のプレビューです。リアルタイム機能は `http://localhost:3000` で使えます。", "success");
}

function bindEvents() {
  elements.accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.accessNameInput.value.trim();
    await submitPlayerName(name, true);
  });

  elements.joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = elements.nameInput.value.trim();
    await submitPlayerName(name, false);
  });
}

function bindSocketEvents() {
  socket.on("connect", () => {
    if (state.player.id && state.player.name) {
      socket.emit("player:join", {
        name: state.player.name,
        playerId: state.player.id
      });
    }
  });

  socket.on("player:joined", (payload) => {
    state.player.id = payload.id;
    state.player.name = payload.name;
    state.hasAccess = true;
    localStorage.setItem("festival-quiz-player-id", payload.id);
    localStorage.setItem("festival-quiz-player-name", payload.name);
    elements.accessNameInput.value = payload.name;
    elements.nameInput.value = payload.name;
    if (!state.isSplashVisible) {
      setAccessState(true);
    }
    renderIdentity(payload.name, payload.score);
    showToast("参加しました。問題が始まるのを待ってください。", "success");
  });

  socket.on("state:update", (payload) => {
    state.publicState = payload;
    renderPublicState();
  });

  socket.on("toast", ({ message, tone }) => {
    showToast(message, tone);
  });
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

function applyPreviewState() {
  state.publicState = {
    title: siteConfig.branding.title,
    status: "lobby",
    currentQuestionIndex: 0,
    totalQuestions: 8,
    connectedParticipantCount: state.player.name ? 1 : 0,
    responseCount: 0,
    currentQuestion: null,
    distribution: [],
    leaderboard: state.player.name
      ? [{ rank: 1, name: state.player.name, score: 0 }]
      : [],
    you: state.player.name
      ? { id: state.player.id || "preview-player", name: state.player.name, score: 0, answer: null }
      : null
  };

  renderPublicState();
}

async function submitPlayerName(name, fromGate) {
  if (!name) {
    showToast("名前を入力してください。", "error");
    return;
  }

  if (!state.player.id) {
    state.player.id = createPlayerId();
    localStorage.setItem("festival-quiz-player-id", state.player.id);
  }

  state.player.name = name;
  state.hasAccess = true;
  localStorage.setItem("festival-quiz-player-name", state.player.name);
  elements.accessNameInput.value = name;
  elements.nameInput.value = name;
  if (fromGate) {
    await playSplashScreen();
  }
  setAccessState(true);
  renderIdentity(state.player.name, state.publicState?.you?.score ?? 0);

  if (socket) {
    socket.emit("player:join", { name, playerId: state.player.id });
    showToast(fromGate ? "クイズに入りました。" : "表示名を更新しました。", "success");
    return;
  }

  applyPreviewState();
  if (fromGate) {
    showToast("クイズに入りました。", "success");
  } else {
    showToast("表示名を更新しました。", "success");
  }
}

function renderPublicState() {
  const quiz = state.publicState;
  if (!quiz) {
    return;
  }

  document.body.dataset.status = quiz.status;
  document.body.dataset.questionType = quiz.currentQuestion?.category || "default";
  elements.title.textContent = siteConfig.branding.title || quiz.title;
  elements.subtitle.textContent = siteConfig.branding.subtitle;
  elements.participantCount.textContent = String(quiz.connectedParticipantCount);
  elements.responseCount.textContent = String(quiz.responseCount);
  elements.statusText.textContent = statusLabelForQuiz(quiz);
  const mode = statusMode(quiz);
  elements.statusText.dataset.status = quiz.status;
  elements.statusText.dataset.mode = mode;
  elements.statusStrip.dataset.status = mode;

  renderDisplay(quiz);
  renderPlayer(quiz);
  renderResultBars(quiz.currentQuestion, quiz.distribution);
  renderLeaderboard(quiz.leaderboard);
}

function renderDisplay(quiz) {
  const question = quiz.currentQuestion;
  const joined = Boolean(quiz.you);
  renderStatusStrip(quiz, question);

  if (!question) {
    elements.questionMeta.textContent = "開始待ち";
    elements.displayQuestion.textContent = "司会者が問題を開始すると、ここに現在のクイズが大きく表示されます。";
    renderQuestionMedia(elements.displayQuestionMedia, null);
    elements.displayChoices.innerHTML = "";
    elements.responseSummary.textContent = "問題が始まると、ここに回答状況が表示されます。";
    return;
  }

  elements.questionMeta.textContent = `Q${quiz.currentQuestionIndex + 1} / ${quiz.totalQuestions} ・ ${questionCategoryLabel(question.category)}`;
  elements.displayQuestion.textContent = question.prompt;
  renderQuestionMedia(elements.displayQuestionMedia, question);
  elements.displayChoices.style.setProperty("--choice-columns", String(choiceColumnCount(question.choices.length)));
  const disabled = !joined || quiz.status !== "question" || !question.acceptingAnswers;
  elements.displayChoices.innerHTML = question.choices
    .map((choice, index) => {
      const correct = quiz.status !== "question" && question.correctIndex === index;
      const selected = quiz.you?.answer === index;
      return `
        <button
          type="button"
          class="display-choice ${correct ? "is-correct" : ""} ${selected ? "is-selected" : ""}"
          data-choice-index="${index}"
          ${disabled ? "disabled" : ""}
        >
          <span class="choice-index">${String.fromCharCode(65 + index)}</span>
          <span>${escapeHtml(choice)}</span>
        </button>
      `;
    })
    .join("");

  elements.displayChoices.querySelectorAll("[data-choice-index]").forEach((button) => {
    button.addEventListener("click", () => {
      if (socket) {
        socket.emit("player:answer", { choiceIndex: Number(button.dataset.choiceIndex) });
      }
    });
  });

  if (quiz.status === "question") {
    elements.responseSummary.textContent = `${quiz.responseCount}人が回答中です。`;
  } else if (quiz.status === "reveal" || quiz.status === "finished") {
    const correctLabel = String.fromCharCode(65 + question.correctIndex);
    const explanation = question.explanation ? ` ${question.explanation}` : "";
    elements.responseSummary.textContent = `正解は ${correctLabel} です。${explanation}`;
  } else {
    elements.responseSummary.textContent = "次の問題を待機しています。";
  }
}

function renderPlayer(quiz) {
  const question = quiz.currentQuestion;
  const joined = Boolean(quiz.you);
  const pendingJoin = state.hasAccess && !joined;

  if (joined) {
    renderIdentity(quiz.you.name, quiz.you.score);
  }

  if (!question) {
    elements.playerFeedback.textContent = joined
      ? "参加できています。問題開始までお待ちください。"
      : pendingJoin
        ? "参加情報を反映しています。問題開始までそのままお待ちください。"
        : "名前を入力して参加すると、上の選択肢から回答できます。";
    return;
  }

  if (!joined) {
    elements.playerFeedback.textContent = pendingJoin
      ? "参加処理中です。反映されると、そのままこの画面から回答できます。"
      : "回答するには、先に名前を入力して参加してください。";
    return;
  }

  if (quiz.status === "question" && question.acceptingAnswers) {
    elements.playerFeedback.textContent = quiz.you?.answer === null
      ? "上の選択肢を1つ選んでください。受付中なら変更できます。"
      : `回答済み: ${String.fromCharCode(65 + quiz.you.answer)} を選択中です。`;
    return;
  }

  if (quiz.status === "question") {
    elements.playerFeedback.textContent = "回答受付は終了しました。";
    return;
  }

  if (quiz.status === "reveal" || quiz.status === "finished") {
    const correctLabel = String.fromCharCode(65 + question.correctIndex);
    const yourLabel = quiz.you?.answer === null ? "未回答" : String.fromCharCode(65 + quiz.you.answer);
    elements.playerFeedback.textContent = `あなたの回答: ${yourLabel} / 正解: ${correctLabel} / ${quiz.you?.score ?? 0}pt`;
    return;
  }

  elements.playerFeedback.textContent = "司会者が開始するまでお待ちください。";
}

function renderResultBars(question, distribution) {
  if (!question || !distribution.length) {
    elements.resultBars.innerHTML = "";
    return;
  }

  const max = Math.max(...distribution, 1);
  elements.resultBars.innerHTML = question.choices
    .map((choice, index) => {
      const percent = Math.round((distribution[index] / max) * 100);
      const isCorrect = question.correctIndex === index;
      return `
        <div class="result-row">
          <span class="result-label">${String.fromCharCode(65 + index)}. ${escapeHtml(choice)}</span>
          <div class="result-track ${isCorrect ? "is-correct" : ""}">
            <div class="result-fill" style="width: ${percent}%"></div>
          </div>
          <strong>${distribution[index]}票</strong>
        </div>
      `;
    })
    .join("");
}

function renderLeaderboard(leaderboard) {
  if (!leaderboard.length) {
    elements.leaderboard.innerHTML = "<li>まだ参加者がいません。</li>";
    return;
  }

  elements.leaderboard.innerHTML = leaderboard
    .map((entry) => `
      <li>
        <span>${entry.rank}位 ${escapeHtml(entry.name)}</span>
        <strong>${entry.score}pt</strong>
      </li>
    `)
    .join("");
}

function renderIdentity(name, score) {
  elements.playerIdentity.classList.remove("hidden");
  elements.playerIdentity.textContent = `${name} として参加中 / ${score}pt`;
}

function setAccessState(isOpen) {
  state.hasAccess = isOpen;
  elements.accessGate.classList.toggle("hidden", isOpen);
  elements.appShell.classList.toggle("hidden", !isOpen);
}

function playSplashScreen() {
  state.isSplashVisible = true;
  elements.splashScreen.setAttribute("aria-hidden", "false");
  elements.splashScreen.classList.remove("hidden");
  elements.splashScreen.classList.add("is-visible");

  return new Promise((resolve) => {
    window.setTimeout(() => {
      elements.splashScreen.classList.remove("is-visible");
      elements.splashScreen.classList.add("hidden");
      elements.splashScreen.setAttribute("aria-hidden", "true");
      state.isSplashVisible = false;
      resolve();
    }, 1000);
  });
}

function applySiteConfig() {
  document.title = siteConfig.branding.browserTitle || siteConfig.branding.title;
  applyThemeVariables(siteConfig.theme.vars);
  elements.eyebrow.textContent = siteConfig.branding.eyebrow;
  elements.title.textContent = siteConfig.branding.title;
  elements.subtitle.textContent = siteConfig.branding.subtitle;
}

function applyThemeVariables(variables) {
  Object.entries(variables).forEach(([name, value]) => {
    if (!value) {
      return;
    }
    document.documentElement.style.setProperty(`--${name}`, String(value));
  });
}

function normalizeSiteConfig(input) {
  return {
    branding: {
      ...defaultSiteConfig.branding,
      ...(input.branding || {})
    },
    theme: {
      vars: {
        ...defaultSiteConfig.theme.vars,
        ...(input.theme?.vars || {})
      }
    }
  };
}

function showToast(message, tone = "success") {
  elements.toast.textContent = message;
  elements.toast.className = `toast is-visible ${tone}`;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    elements.toast.className = "toast";
  }, 3200);
}

function statusLabel(status) {
  if (status === "question") {
    return "回答受付中";
  }
  if (status === "reveal") {
    return "正解発表";
  }
  if (status === "finished") {
    return "終了";
  }
  return "待機中";
}

function statusLabelForQuiz(quiz) {
  const mode = statusMode(quiz);
  if (mode === "question") {
    return "回答受付中";
  }
  if (mode === "locked") {
    return "集計中";
  }
  if (mode === "reveal") {
    return "正解発表";
  }
  if (mode === "finished") {
    return "終了";
  }
  return "待機中";
}

function statusMode(quiz) {
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

function renderStatusStrip(quiz, question) {
  const mode = statusMode(quiz);
  elements.statusStrip.dataset.status = mode;

  if (!question) {
    elements.statusHeadline.textContent = "待機中";
    elements.statusDetail.textContent = "司会者が問題を開始するまで、このままお待ちください。";
    return;
  }

  if (mode === "question") {
    elements.statusHeadline.textContent = "回答受付中";
    elements.statusDetail.textContent = `${questionCategoryLabel(question.category)}の問題です。いま回答できます。`;
    return;
  }

  if (mode === "locked") {
    elements.statusHeadline.textContent = "集計中";
    elements.statusDetail.textContent = `${questionCategoryLabel(question.category)}を集計中です。まもなく正解が表示されます。`;
    return;
  }

  if (mode === "reveal") {
    const correctLabel = String.fromCharCode(65 + question.correctIndex);
    elements.statusHeadline.textContent = "正解発表";
    elements.statusDetail.textContent = `${questionCategoryLabel(question.category)}の正解は ${correctLabel} です。`;
    return;
  }

  elements.statusHeadline.textContent = "クイズ終了";
  elements.statusDetail.textContent = "全問題が終了しました。最終結果を確認できます。";
}

function renderQuestionMedia(container, question) {
  const image = question?.image?.trim();
  if (!image) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }

  container.innerHTML = `<img src="${escapeHtml(image)}" alt="問題画像">`;
  container.classList.remove("hidden");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createPlayerId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function questionCategoryLabel(category) {
  if (category === "trend-song") {
    return "流行りの曲チェック";
  }
  if (category === "retro-trend") {
    return "昔の流行チェック";
  }
  return "今の流行チェック";
}

function choiceColumnCount(choiceLength) {
  if (choiceLength <= 2) {
    return choiceLength;
  }
  if (choiceLength === 4) {
    return 2;
  }
  return 3;
}
