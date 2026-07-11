window.siteConfig = {
  // このファイルだけ触れば、サイトの見た目と文言をかなり変えられます。
  branding: {
    browserTitle: "イマドキチェック",
    eyebrow: "Bunkasai Quiz Event",
    title: "イマドキチェック",
    subtitle: "その感覚、まだちゃんと今っぽい？ 会場みんなで参加する流行クイズです。"
  },

  hero: {
    lead: "会場みんなで参加できる、トレンド感覚チェックサイトです。ステージで問題を出して、スマホから答えて、リアルタイムで結果を見られます。",
    chips: ["# バズ感覚", "# SNSあるある", "# リアルタイム判定"],
    links: [
      { label: "問題を見る", href: "#displayPanel" },
      { label: "参加する", href: "#playerPanel" }
    ]
  },

  sidebar: {
    statsLabel: "いまの状況",
    featureLabel: "この企画で出るもの",
    featureItems: ["略語やSNSネタのクイズ", "リアルタイムの回答状況", "イマドキ度のランキング"]
  },

  bannerItems: [
    "IMADOKI CHECK",
    "その略語わかる？",
    "それ、もう古いかも？",
    "流行語・SNS・バズ感覚"
  ],

  navigation: [
    { label: "ステージ表示", href: "#displayPanel" },
    { label: "観客参加", href: "#playerPanel" }
  ],

  sections: {
    stage: {
      kicker: "Stage View",
      title: "いま出ている問題",
      copy: "会場スクリーン向けの表示エリアです。問題、残り時間、会場の回答状況をまとめて見せられます。"
    },
    player: {
      kicker: "Audience",
      title: "スマホで参加する",
      copy: "来場者が名前を入れて参加するエリアです。問題が始まると、そのままスマホから答えられます。"
    },
    host: {
      kicker: "Host",
      title: "司会者向けの進行画面",
      copy: "司会者が進行を管理するエリアです。問題開始、正解発表、待機画面への切り替えまでここで操作できます。"
    }
  },

  // 下の色を変えると雰囲気をまとめて変えられます。
  // 例: accent を青にすると全体が寒色寄りになります。
  theme: {
    vars: {
      "accent": "#ff5fa2",
      "accent-deep": "#ff8d5c",
      "mint": "#20cbb3",
      "cyan": "#49b8ff",
      "text": "#3a2141",
      "muted": "#6f6280",
      "line": "rgba(224, 107, 167, 0.2)",
      "surface": "rgba(255, 255, 255, 0.68)",
      "surface-strong": "rgba(255, 255, 255, 0.78)",
      "page-bg-start": "#fff8fb",
      "page-bg-mid": "#fffdf7",
      "page-bg-end": "#f6fbff",
      "card-border": "rgba(228, 108, 162, 0.12)",
      "card-border-strong": "rgba(228, 108, 162, 0.28)",
      "card-shadow": "rgba(194, 136, 169, 0.1)",
      "card-shadow-soft": "rgba(199, 133, 170, 0.1)",
      "card-shadow-strong": "rgba(199, 133, 170, 0.14)",
      "banner-pink": "rgba(255, 113, 174, 0.08)",
      "banner-yellow": "rgba(255, 212, 116, 0.14)",
      "banner-blue": "rgba(81, 181, 255, 0.1)",
      "nav-bg": "#fffdfd",
      "nav-bg-hover": "#fff5fa"
    }
  }
};
