# 文化祭クイズライブ

文化祭のステージ進行と会場のお客さんの回答を、同じWebサイトでリアルタイム連動させるためのアプリです。

## できること

- 観客がスマホから参加して、その場で回答できる
- 司会者が問題開始、正解発表、次の問題への移動を操作できる
- ステージ表示で問題、回答受付状態、回答状況、ランキングを大きく見せられる
- 問題セットを `data/questions.json` から編集できる
- 司会者パネルからフォーム入力で問題を追加・編集・複製・削除できる
- 司会者パネルからJSONを貼り付けて、その場で問題を差し替えられる

## 使い方

```bash
npm install
npm start
```

起動するとターミナルに次のようなURLが表示されます。

- `http://localhost:3000`
- `http://192.168.x.x:3000` のようなローカルネットワークURL

同じWi-FiにつないだスマホでローカルネットワークURLを開けば、会場の人も参加できます。

## 司会者モード

- `http://localhost:3000/host.html` を開く
- 司会者コードを入力する
- 初期値は `bunkasai`
- 変更したい場合は、起動前に環境変数 `HOST_CODE` を設定する

```bash
HOST_CODE=my-secret-code npm start
```

## 問題の編集

初期問題は [data/questions.json](/Users/keiisogae/Documents/クイズサイト/data/questions.json) に入っています。

普段の運用では、司会者ページの `問題を追加・編集` を使う方が直感的です。

- 問題文
- 選択肢
- 正解
- 得点
- 目安秒数
- 解説

をそのまま画面上で編集できます。

各問題は次の形式です。

```json
{
  "id": "q1",
  "prompt": "問題文",
  "choices": ["A", "B", "C", "D"],
  "correctIndex": 1,
  "timeLimit": 15,
  "points": 100,
  "explanation": "正解の解説"
}
```

## おすすめ運用

- パソコン1台目: `ステージ表示` をプロジェクターに映す
- パソコン1台目または2台目: `司会者ページ` で進行する
- 観客: スマホで `観客参加` を開く

## 補足

- 回答は `回答受付中` の間だけ押し直しできます
- 正解発表のタイミングで得点が加算されます
- `得点をリセット` を押すと回答履歴とスコアをすべて初期化します

## Render で公開する

このプロジェクトには [render.yaml](/Users/keiisogae/Documents/クイズサイト/render.yaml) を入れてあります。Render の Blueprint としてそのまま使えます。

事前に必要なもの:

- GitHub / GitLab / Bitbucket のどれかにこのプロジェクトを置く
- Render アカウントを作る

手順:

1. Render にログインする
2. `New +` から `Blueprint` を選ぶ
3. このリポジトリを連携する
4. `render.yaml` を読み込ませる
5. 環境変数 `HOST_CODE` に司会者コードを入れる
6. デプロイする

作成されるサービス:

- Web Service 1つ
- リージョンは `Singapore`
- プランは `free`

Render 無料枠の注意:

- 15分アクセスがないとスリープする
- 次のアクセス時に起動まで約1分かかることがある
- 文化祭本番の直前に一度アクセスして起こしておくのがおすすめ
- 司会ページで追加・編集した問題はサーバーのメモリ上にあるため、スリープ復帰や再デプロイ後は元に戻る
- 本番で使う問題セットは、必要に応じて `data/questions.json` に反映するか、司会ページの JSON 差し替え欄に保存しておくのがおすすめ

公開後のURL例:

- 参加者ページ: `https://<your-service>.onrender.com/`
- 司会者ページ: `https://<your-service>.onrender.com/host.html`
- モニターページ: `https://<your-service>.onrender.com/display.html`
