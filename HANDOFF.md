# HANDOFF — 漢字のよるめいろ

**Status (2026-08-10 05:15 SGT)**: 第 6 便まで公開済み。全学年 1026 字 + 回転出題 + メニューボタン + 村・図鑑・じぶんで入力モード・全字テーマ化。検収は第 5 便(全 1026 字の連結網羅 + 回転)・第 6 便(テーマ反映・同テーマ 4 択・図鑑・村・せいれいタップ・永続化・入力 1.5 倍)とも実機合格。

- 公開 URL: https://iamashimpei-lab.github.io/kanji-maze/ (GitHub Pages、push すると自動反映)
- リポジトリ: https://github.com/iamashimpei-lab/kanji-maze (アカウント iamashimpei-lab、gh CLI 認証済み)

## Next up

1. **子どものテストプレイ感想待ち**(2026-08-10 実施予定)。操作感(タッチ旋回の感度・速度上限)・難しさ・コレクションの反応を次便に反映
2. **iPad の IME 実機確認**(発注書 oracle (c) の残項目): じぶんで入力モードで回答パネルとキーボードが重ならないか。Playwright では確認不能、実機のみ
3. 調整候補: PC の←→キーを旋回にするオプション / 蛍などの光点が近距離で四角く見える(点描画の仕様。丸テクスチャ化は次便向けの小改善)

## Documentation index

| 内容 | ファイル |
|---|---|
| 企画の正本(確定仕様・不採用・段階計画) | docs/game-design.md |
| 発注書(実装経緯の正本): MVP → 151字 → 滑らか壁 → タッチ操作 → 地形/世界観 → 全学年/回転 → 村/図鑑 | docs/codex-order-*.md |
| 月別カリキュラム 1〜2年(240字・公的配当表と一致検算済み) | data/curriculum.json |
| 月別カリキュラム 3〜6年(786字・同上。5年の「永」は補遺) | data/curriculum-upper.json |
| 公的配当表・公的読み(正本。読みを記憶で書くのは禁止) | data/official-grades.json / official-readings.json |

## Key operational notes

- **検収は必ず実機(Playwright)で**: 見た目のバグは node テストを全通過する(照明単位・霧・壁くり抜き・移動方向で 4 実績)。`python3 dev-server.py`(port 8642、キャッシュ無効) → Playwright で操作。ゲーム内部の観測は `MazeRenderer.prototype.render` を patch して instance を `window.__view` に取る(手順の実例は git log の検収コミット参照)
- **4 択の正解特定トリック**: 迷路の totalSamples + start 座標を全候補の generateMaze と突き合わせる(UI に答えを出さず E2E できる)
- **codex 委譲**: `codex exec -C <repo> --sandbox workspace-write -m gpt-5.6-sol -c model_reasoning_effort=high "<発注書を読め>" < /dev/null` を background で。`codex exec resume --last` は追加フラグ不可(cd してから実行)。起動確認 = `~/.codex/sessions/` の rollout 新規出現を 5 分以内に
- **方向規約**: three.js カメラ前方 = (-sin(yaw), -cos(yaw))。移動・スタート向きは全てこの規約(南北だけのテストでは逆行バグが隠れる。東西ケース必須)
- **KanjiVG**: 形の正本。`vendor/kanjivg-extract/`(gitignore、ローカルのみ。無ければ GitHub release r20250816 の main.zip を展開)。CC BY-SA 3.0、クレジットは README と設定画面に記載済み
- **サーフェス分担**: 実装 = Sol(発注書 + acceptance packet 方式)/ 検収・診断・小修正 = Claude。検収で落ちたら診断結果(症状の言語化 + 測定値 + 修理 oracle)を付けて resume で差し戻すと 1 往復で直る

## ハンドオフサマリー(2026-08-09〜10 のセッション)

2 日で企画 → MVP → 第 6 便公開まで。実装は全便 Sol(gpt-5.6-sol high)、検収は Claude(Playwright 実機)。検収で発見・修正した主要バグ: three.js r155+ 光量単位で真っ暗 / 種明かしが夜霧に沈む / 壁くり抜きの巻き方向 / 移動方向の東西反転 / setPointerCapture 例外でタッチ全滅 / 読みデータ抽出の空配列(Sol の入力検査が検知)/ 村の夜霧の楕円が放射状の筋に見える(回転角の単位、検収側で小修正)。カリキュラムは光村図書(令和6年度版)の月別で全学年分を調査・公的配当表と全字一致を検算済み。第 6 便の設計判断: 「雰囲気が答えをバラす」問題は 4 択の誤答候補を正解と同テーマから選ぶことで解決し、全 1026 字テーマ化(neutral 34.89%)を解禁した。
