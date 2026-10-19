# Grok Botパズル

色ちがいのGrok Botを4つつなげて消す、オリジナルの落ち物パズル（スマホ/PCブラウザ用PWA）。

- とことん（ひとりで終わりまで・ハイスコア保存・だんだん速くなる）
- CPU対戦（よわい / ふつう / つよい、れんさでおじゃまを送る・相殺あり）
- 操作：スワイプ（左右ドラッグ移動・タップ回転・下ドラッグでゆっくり・下フリックで一気に落下）＋画面ボタン、PCは ←→↓ / Z X(↑) / スペース / P

## 構成
- `logic.js` … 盤面・重力・消去・連鎖・得点・おじゃま・CPU思考（DOMなし、Node/Worker共用）
- `game.js` … 進行（落下・固定・アニメ・CPU操作・おじゃまのやり取り）
- `render.js` … canvas描画（Grok Botの顔、つながり、着地のぷにっ、消えるときのはじけ）
- `ui.js` … 画面・レイアウト・入力・メインループ、`sound.js` … WebAudio効果音
- `ai-worker.js` … CPU思考をWeb Workerで実行

## テスト
```
node --test tests/          # ロジックの単体テスト
node tests/sim.js           # CPUの連鎖数・対戦シミュレーション
node tests/browser-e2e.js   # headless Chrome（puppeteer-core が必要）
```
名前・絵・音はすべてオリジナルです。
