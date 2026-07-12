let socket = null;

const defaultSiteConfig = {
  branding: {
    browserTitle: "モニター表示",
    title: "イマドキチェック"
  }
};

const siteConfig = {
  branding: {
    ...defaultSiteConfig.branding,
    ...(window.siteConfig?.branding || {})
  }
};

const state = {
  publicState: null,
  isPreview: false
};

const elements = {
  title: document.getElementById("displayScreenTitle"),
  meta: document.getElementById("displayScreenMeta"),
  kicker: document.getElementById("displayScreenKicker"),
  question: document.getElementById("displayScreenQuestion"),
  media: document.getElementById("displayScreenMedia"),
  choices: document.getElementById("displayScreenChoices")
};

bootstrap();

async function bootstrap() {
  document.title = `${siteConfig.branding.title} | モニター表示`;
  elements.title.textContent = siteConfig.branding.title;

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

  if (socket) {
    socket.on("state:update", (payload) => {
      state.publicState = payload;
      render();
    });
    return;
  }

  state.publicState = buildPreviewState();
  render();
}

function buildPreviewState() {
  return {
    title: siteConfig.branding.title,
    status: "lobby",
    currentQuestionIndex: 0,
    totalQuestions: 8,
    currentQuestion: null
  };
}

function render() {
  const quiz = state.publicState;
  if (!quiz) {
    return;
  }

  document.body.dataset.status = quiz.status;
  document.body.dataset.questionType = quiz.currentQuestion?.category || "default";
  elements.title.textContent = quiz.title || siteConfig.branding.title;

  renderQuestion(quiz);
}

function renderQuestion(quiz) {
  const question = quiz.currentQuestion;

  if (!question) {
    elements.meta.textContent = quiz.status === "reveal" || quiz.status === "finished" ? "結果発表" : "開始待ち";
    elements.kicker.textContent = "次の問題";
    elements.question.textContent = "司会者が問題を開始すると、ここに問題が表示されます。";
    renderQuestionMedia(null);
    elements.choices.innerHTML = "";
    return;
  }

  elements.meta.textContent = `Q${quiz.currentQuestionIndex + 1} / ${quiz.totalQuestions}`;
  elements.kicker.textContent = quiz.status === "reveal" || quiz.status === "finished"
    ? "正解発表"
    : question.acceptingAnswers
      ? "回答受付中"
      : "集計中";
  elements.kicker.textContent += ` ・ ${questionCategoryLabel(question.category)}`;
  elements.question.textContent = question.prompt;
  renderQuestionMedia(question);
  elements.choices.style.setProperty("--choice-columns", String(choiceColumnCount(question.choices.length)));
  elements.choices.innerHTML = question.choices
    .map((choice, index) => {
      const isCorrect = question.correctIndex === index && (quiz.status === "reveal" || quiz.status === "finished");
      return `
        <div class="display-stage-choice ${isCorrect ? "is-correct" : ""}">
          <span class="display-stage-choice-index">${String.fromCharCode(65 + index)}</span>
          <span>${escapeHtml(choice)}</span>
        </div>
      `;
    })
    .join("");
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

function renderQuestionMedia(question) {
  const image = question?.image?.trim();
  if (!image) {
    elements.media.innerHTML = "";
    elements.media.classList.add("hidden");
    return;
  }

  elements.media.innerHTML = `<img src="${escapeHtml(image)}" alt="問題画像">`;
  elements.media.classList.remove("hidden");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function questionCategoryLabel(category) {
  if (category === "trend-song") {
    return "流行りの曲";
  }
  if (category === "retro-trend") {
    return "昔の流行";
  }
  return "今の流行";
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
