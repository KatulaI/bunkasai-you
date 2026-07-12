const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");

const express = require("express");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3000);
const HOST_CODE = process.env.HOST_CODE || "bunkasai";
const QUESTIONS_PATH = path.join(__dirname, "data", "questions.json");
const QUESTION_CATEGORIES = new Set(["trend-expired", "trend-song", "retro-trend"]);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let questions = loadQuestions();
let quizState = createInitialState();
const participants = new Map();
const answersByQuestion = new Map();

app.use(express.static(path.join(__dirname, "public")));

// Render health checks can use this lightweight endpoint.
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/api/bootstrap", (_req, res) => {
  res.json({
    publicState: buildPublicState(),
    serverUrls: getJoinUrls(PORT)
  });
});

io.on("connection", (socket) => {
  socket.emit("state:update", buildPublicState(socket));
  socket.emit("host:state", buildHostState(socket));

  socket.on("player:join", ({ name, playerId }) => {
    if (!name || !String(name).trim()) {
      socket.emit("toast", { tone: "error", message: "名前を入力してください。" });
      return;
    }

    const safeId = typeof playerId === "string" && playerId ? playerId : randomUUID();
    const player = participants.get(safeId) || {
      id: safeId,
      name: String(name).trim().slice(0, 20),
      score: 0,
      connected: true,
      socketId: socket.id
    };

    player.name = String(name).trim().slice(0, 20);
    player.connected = true;
    player.socketId = socket.id;

    participants.set(safeId, player);
    socket.data.playerId = safeId;
    socket.data.playerName = player.name;

    socket.emit("player:joined", {
      id: player.id,
      name: player.name,
      score: player.score
    });

    emitAllStates();
  });

  socket.on("host:authenticate", ({ code }) => {
    if (code !== HOST_CODE) {
      socket.emit("toast", { tone: "error", message: "司会者コードが違います。" });
      return;
    }

    socket.data.isHost = true;
    socket.emit("toast", { tone: "success", message: "司会者モードを有効にしました。" });
    socket.emit("host:state", buildHostState(socket));
  });

  socket.on("player:answer", ({ choiceIndex }) => {
    const playerId = socket.data.playerId;
    const question = getCurrentQuestion();

    if (!playerId || !question || quizState.status !== "question" || !isAcceptingAnswers()) {
      return;
    }

    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex >= question.choices.length) {
      return;
    }

    const answerMap = getAnswerMap(question.id);
    answerMap.set(playerId, {
      choiceIndex,
      submittedAt: Date.now()
    });

    emitAllStates();
  });

  socket.on("host:open-question", ({ questionIndex }) => {
    if (!socket.data.isHost) {
      return;
    }

    if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= questions.length) {
      return;
    }

    const question = questions[questionIndex];
    quizState.currentQuestionIndex = questionIndex;
    quizState.status = "question";
    quizState.questionOpenedAt = Date.now();
    quizState.questionEndsAt = null;
    quizState.acceptingAnswers = true;
    quizState.revealedQuestionIds.delete(question.id);
    getAnswerMap(question.id).clear();

    emitAllStates();
  });

  socket.on("host:close-answers", () => {
    if (!socket.data.isHost) {
      return;
    }

    if (quizState.status !== "question" || !quizState.acceptingAnswers) {
      return;
    }

    quizState.acceptingAnswers = false;
    emitAllStates();
  });

  socket.on("host:save-question", ({ index, question }) => {
    if (!socket.data.isHost) {
      return;
    }

    if (!Number.isInteger(index) || index < 0 || index >= questions.length) {
      socket.emit("toast", { tone: "error", message: "保存する問題を特定できませんでした。" });
      return;
    }

    try {
      const validated = validateQuestion({
        ...question,
        id: questions[index].id
      }, index);
      questions[index] = validated;
      socket.emit("toast", { tone: "success", message: `Q${index + 1} を保存しました。` });
      emitAllStates();
    } catch (error) {
      socket.emit("toast", { tone: "error", message: error.message });
    }
  });

  socket.on("host:add-question", ({ afterIndex }) => {
    if (!socket.data.isHost) {
      return;
    }

    const insertIndex = Math.max(0, Math.min(Number.isInteger(afterIndex) ? afterIndex + 1 : questions.length, questions.length));
    const newQuestion = createBlankQuestion(insertIndex);
    questions.splice(insertIndex, 0, newQuestion);

    if (insertIndex <= quizState.currentQuestionIndex && questions.length > 1) {
      quizState.currentQuestionIndex += 1;
    }

    socket.emit("toast", { tone: "success", message: `Q${insertIndex + 1} を追加しました。` });
    emitAllStates();
  });

  socket.on("host:duplicate-question", ({ index }) => {
    if (!socket.data.isHost) {
      return;
    }

    if (!Number.isInteger(index) || index < 0 || index >= questions.length) {
      socket.emit("toast", { tone: "error", message: "複製する問題を特定できませんでした。" });
      return;
    }

    const source = questions[index];
    const clone = validateQuestion({
      ...source,
      id: createQuestionId()
    }, index + 1);
    const insertIndex = index + 1;
    questions.splice(insertIndex, 0, clone);

    if (insertIndex <= quizState.currentQuestionIndex && questions.length > 1) {
      quizState.currentQuestionIndex += 1;
    }

    socket.emit("toast", { tone: "success", message: `Q${index + 1} を複製しました。` });
    emitAllStates();
  });

  socket.on("host:delete-question", ({ index }) => {
    if (!socket.data.isHost) {
      return;
    }

    if (questions.length <= 1) {
      socket.emit("toast", { tone: "error", message: "最後の1問は削除できません。" });
      return;
    }

    if (!Number.isInteger(index) || index < 0 || index >= questions.length) {
      socket.emit("toast", { tone: "error", message: "削除する問題を特定できませんでした。" });
      return;
    }

    const deletingCurrentQuestion = index === quizState.currentQuestionIndex;
    questions.splice(index, 1);

    if (index < quizState.currentQuestionIndex) {
      quizState.currentQuestionIndex -= 1;
    } else if (quizState.currentQuestionIndex >= questions.length) {
      quizState.currentQuestionIndex = questions.length - 1;
    }

    if (deletingCurrentQuestion && quizState.status !== "lobby") {
      quizState.status = "lobby";
      quizState.acceptingAnswers = false;
      quizState.questionOpenedAt = null;
      quizState.questionEndsAt = null;
    }

    socket.emit("toast", { tone: "success", message: `Q${index + 1} を削除しました。` });
    emitAllStates();
  });

  socket.on("host:reveal-answer", () => {
    if (!socket.data.isHost) {
      return;
    }

    const question = getCurrentQuestion();
    if (!question || quizState.status !== "question") {
      return;
    }

    scoreQuestionIfNeeded(question);
    quizState.status = "reveal";
    quizState.acceptingAnswers = false;
    quizState.revealedQuestionIds.add(question.id);
    emitAllStates();
  });

  socket.on("host:next-question", () => {
    if (!socket.data.isHost) {
      return;
    }

    const currentQuestion = getCurrentQuestion();
    if (currentQuestion && quizState.status === "question") {
      scoreQuestionIfNeeded(currentQuestion);
    }

    const nextIndex = Math.min(quizState.currentQuestionIndex + 1, questions.length - 1);
    if (nextIndex === quizState.currentQuestionIndex && quizState.currentQuestionIndex === questions.length - 1) {
      quizState.status = "finished";
      quizState.acceptingAnswers = false;
      if (currentQuestion) {
        quizState.revealedQuestionIds.add(currentQuestion.id);
      }
      emitAllStates();
      return;
    }

    const question = questions[nextIndex];
    quizState.currentQuestionIndex = nextIndex;
    quizState.status = "question";
    quizState.questionOpenedAt = Date.now();
    quizState.questionEndsAt = null;
    quizState.acceptingAnswers = true;
    quizState.revealedQuestionIds.delete(question.id);
    getAnswerMap(question.id).clear();

    emitAllStates();
  });

  socket.on("host:return-lobby", () => {
    if (!socket.data.isHost) {
      return;
    }

    quizState.status = "lobby";
    quizState.acceptingAnswers = false;
    quizState.questionOpenedAt = null;
    quizState.questionEndsAt = null;
    emitAllStates();
  });

  socket.on("host:reset-quiz", () => {
    if (!socket.data.isHost) {
      return;
    }

    participants.forEach((player) => {
      player.score = 0;
    });
    answersByQuestion.clear();
    quizState = createInitialState();
    emitAllStates();
  });

  socket.on("host:import-questions", ({ rawJson }) => {
    if (!socket.data.isHost) {
      return;
    }

    try {
      const parsed = JSON.parse(rawJson);
      const validated = validateQuestions(parsed);
      questions = validated;
      answersByQuestion.clear();
      participants.forEach((player) => {
        player.score = 0;
      });
      quizState = createInitialState();
      socket.emit("toast", { tone: "success", message: "問題セットを読み込みました。" });
      emitAllStates();
    } catch (error) {
      socket.emit("toast", { tone: "error", message: `問題JSONを読み込めませんでした: ${error.message}` });
    }
  });

  socket.on("disconnect", () => {
    const playerId = socket.data.playerId;
    if (playerId && participants.has(playerId)) {
      participants.get(playerId).connected = false;
      participants.get(playerId).socketId = null;
    }

    emitAllStates();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log("Realtime quiz server is ready.");
  console.log(`Host code: ${HOST_CODE}`);
  console.log("Open one of these URLs:");
  getJoinUrls(PORT).forEach((url) => {
    console.log(`  - ${url}`);
  });
  console.log("");
});

function createInitialState() {
  return {
    title: "イマドキチェック",
    status: "lobby",
    currentQuestionIndex: 0,
    acceptingAnswers: false,
    questionOpenedAt: null,
    questionEndsAt: null,
    scoredQuestionIds: new Set(),
    revealedQuestionIds: new Set()
  };
}

function createQuestionId() {
  return `question-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createBlankQuestion(index = 0) {
  return validateQuestion({
    id: createQuestionId(),
    prompt: `新しい問題 ${index + 1}`,
    category: "trend-expired",
    choices: ["選択肢A", "選択肢B", "選択肢C"],
    correctIndex: 0,
    image: "",
    timeLimit: 15,
    points: 100,
    explanation: ""
  }, index);
}

function loadQuestions() {
  const raw = fs.readFileSync(QUESTIONS_PATH, "utf8");
  return validateQuestions(JSON.parse(raw));
}

function validateQuestions(candidate) {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    throw new Error("問題は1問以上必要です。");
  }

  return candidate.map((question, index) => validateQuestion(question, index));
}

function validateQuestion(question, index = 0) {
  if (!question || typeof question !== "object") {
    throw new Error(`${index + 1}問目の形式が不正です。`);
  }

  if (!Array.isArray(question.choices) || question.choices.length < 2) {
    throw new Error(`${index + 1}問目は選択肢が2つ以上必要です。`);
  }

  if (!Number.isInteger(question.correctIndex) || question.correctIndex < 0 || question.correctIndex >= question.choices.length) {
    throw new Error(`${index + 1}問目の正解番号が不正です。`);
  }

  const timeLimit = Number(question.timeLimit || 15);
  const points = Number(question.points || 100);
  const category = normalizeQuestionCategory(question.category);

  return {
    id: typeof question.id === "string" && question.id ? question.id : createQuestionId(),
    prompt: String(question.prompt || `問題 ${index + 1}`),
    category,
    choices: question.choices.map((choice) => String(choice)),
    correctIndex: question.correctIndex,
    image: typeof question.image === "string" ? question.image.trim() : "",
    timeLimit: Number.isFinite(timeLimit) ? Math.max(5, Math.min(120, Math.round(timeLimit))) : 15,
    points: Number.isFinite(points) ? Math.max(10, Math.round(points)) : 100,
    explanation: String(question.explanation || "")
  };
}

function getCurrentQuestion() {
  return questions[quizState.currentQuestionIndex] || null;
}

function normalizeQuestionCategory(value) {
  return QUESTION_CATEGORIES.has(value) ? value : "trend-expired";
}

function getAnswerMap(questionId) {
  if (!answersByQuestion.has(questionId)) {
    answersByQuestion.set(questionId, new Map());
  }
  return answersByQuestion.get(questionId);
}

function isAcceptingAnswers() {
  return quizState.status === "question" && quizState.acceptingAnswers;
}

function scoreQuestionIfNeeded(question) {
  if (!question || quizState.scoredQuestionIds.has(question.id)) {
    return;
  }

  const answerMap = getAnswerMap(question.id);
  answerMap.forEach((answer, playerId) => {
    if (answer.choiceIndex === question.correctIndex) {
      const player = participants.get(playerId);
      if (player) {
        player.score += question.points;
      }
    }
  });

  quizState.scoredQuestionIds.add(question.id);
}

function buildPublicState(socket) {
  const questionIsVisible = ["question", "reveal", "finished"].includes(quizState.status);
  const question = questionIsVisible ? getCurrentQuestion() : null;
  const answerMap = question ? getAnswerMap(question.id) : new Map();
  const distribution = question
    ? question.choices.map((_, choiceIndex) => {
        let count = 0;
        answerMap.forEach((answer) => {
          if (answer.choiceIndex === choiceIndex) {
            count += 1;
          }
        });
        return count;
      })
    : [];
  const playerId = socket?.data?.playerId;
  const yourAnswer = playerId && question ? answerMap.get(playerId) : null;
  const connectedPlayers = Array.from(participants.values()).filter((player) => player.connected);
  const leaderboard = Array.from(participants.values())
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "ja"))
    .slice(0, 10)
    .map((player, index) => ({
      rank: index + 1,
      name: player.name,
      score: player.score,
      connected: player.connected
    }));

  return {
    title: quizState.title,
    status: quizState.status,
    currentQuestionIndex: quizState.currentQuestionIndex,
    totalQuestions: questions.length,
    participantCount: participants.size,
    connectedParticipantCount: connectedPlayers.length,
    currentQuestion: question
      ? {
          id: question.id,
          prompt: question.prompt,
          category: question.category,
          choices: question.choices,
          image: question.image,
          timeLimit: question.timeLimit,
          points: question.points,
          endsAt: quizState.questionEndsAt,
          acceptingAnswers: isAcceptingAnswers(),
          explanation: quizState.status === "reveal" || quizState.status === "finished" ? question.explanation : "",
          correctIndex: quizState.status === "reveal" || quizState.status === "finished" ? question.correctIndex : null
        }
      : null,
    responseCount: answerMap.size,
    distribution: quizState.status === "reveal" || quizState.status === "finished" ? distribution : [],
    leaderboard,
    you: playerId && participants.has(playerId)
      ? {
          id: playerId,
          name: participants.get(playerId).name,
          score: participants.get(playerId).score,
          answer: yourAnswer ? yourAnswer.choiceIndex : null
        }
      : null
  };
}

function buildHostState(socket) {
  if (!socket?.data?.isHost) {
    return { authorized: false };
  }

  const question = getCurrentQuestion();
  const answerMap = question ? getAnswerMap(question.id) : new Map();

  return {
    authorized: true,
    hostCodeHint: HOST_CODE,
    serverUrls: getJoinUrls(PORT),
    questions,
    currentQuestionIndex: quizState.currentQuestionIndex,
    acceptingAnswers: isAcceptingAnswers(),
    liveDistribution: question
      ? question.choices.map((_, choiceIndex) => {
          let count = 0;
          answerMap.forEach((answer) => {
            if (answer.choiceIndex === choiceIndex) {
              count += 1;
            }
          });
          return count;
        })
      : []
  };
}

function emitAllStates() {
  io.sockets.sockets.forEach((socket) => {
    socket.emit("state:update", buildPublicState(socket));
    socket.emit("host:state", buildHostState(socket));
  });
}

function getJoinUrls(port) {
  const urls = new Set([`http://localhost:${port}`]);
  const networkInterfaces = os.networkInterfaces();

  Object.values(networkInterfaces).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry && entry.family === "IPv4" && !entry.internal) {
        urls.add(`http://${entry.address}:${port}`);
      }
    });
  });

  return Array.from(urls);
}
