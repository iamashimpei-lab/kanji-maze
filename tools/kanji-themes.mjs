import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const officialGradesPath = path.join(projectRoot, "data/official-grades.json");
const officialGrades = JSON.parse(fs.readFileSync(officialGradesPath, "utf8"));
const officialChars = Object.values(officialGrades).flat();

export const THEME_CATEGORIES = Object.freeze([
  "water",
  "mountain",
  "plant",
  "fire",
  "sky",
  "animal",
  "life",
  "town",
  "neutral",
]);

// 小学校配当 1026 字を、一字ずつ主な意味で分類した対応表。
// neutral は数・方向・心・言葉・制度など、具体的な風景にしにくい抽象字に限る。
const THEME_LOOKUP = Object.freeze({
  water: "雨水川海汽雪池飲泳湖港酒注湯波氷油洋流塩漁滋清浅沖浴冷液河減混沿源降済蒸泉洗潮",
  mountain: "山石土岩原谷地野里岸州島坂岡潟岐崎底阜陸境鉱域穴砂磁層頂",
  plant: "花森草竹田木林園黄秋茶麦米荷根実植柱庭豆農畑板薬葉緑茨果芽香菜材種松栃梨梅桜幹耕枝肥粉豊綿株絹穀樹熟糖俵",
  fire: "火赤光電明温暑消炭焼照灯熱災燃映灰紅暖",
  sky: "空月青夕天日白雲夏春星晴昼朝冬風夜曜暗寒昭陽季景候昨節宇宙晩暮翌",
  animal: "貝犬虫羽角牛魚鳥馬鳴毛皮羊熊鹿巣牧飼象蚕乳卵",
  life: "王休見口子耳手女人生足男目立力引歌会楽活顔帰兄交行作止姉自首食親声切走太体通弟頭肉売買父聞歩母妹友来悪安医委育員運開起客急去苦君係軽血向幸仕死使始指歯持者主守取受拾終習集住重助勝乗身神深進整息速族他打待着追投登動童配発悲美鼻病負服返勉放味命役遊落旅練和愛栄加改覚官願求泣挙競軍群欠結健験功好康最察参産散残氏司試児治失借周祝順初笑唱臣成静積折戦選争続卒孫隊達仲徒働飛夫付兵変包望満民勇養利良連老労囲移演応過快解慣眼寄喜逆救許検護衛効厚興妻士支師示似謝授修招常職性責接祖率損停適得毒任能破犯婦武保防暴迷胃延恩我干巻看危吸供胸勤筋敬己呼后孝皇骨困私姿視捨若就衆従縮除承将傷仁推盛舌染奏創臓退担探誕腸痛難認脳拝背肺腹奮陛閉補亡優幼欲臨朗",
  town: "玉金校糸車村町本家画絵弓京戸工公国市矢紙寺室社書場図船線組台店刀道門院駅屋階館宮球橋業曲局銀区具研県庫号祭皿写宿所商送丁帳笛鉄都箱筆品物列路衣印貨械街管関観旗器機鏡郡径建札刷城縄井席倉束帯典飯票標府便法料輪録営易往刊技居型航構財資舎術織製税設造貸築貯堂銅版費布墓貿務輸革机郷券鋼座冊誌射収署針銭窓装蔵宅段庁賃届納宝訪棒枚幕郵",
  neutral: "一右円音下学気九五左三四字七十出小上正千先早大中二入年八百文名六遠何科回外間丸記強教近形計元言古午後語広考高合黒今才細算思時弱週少色心新数西前多知長直点当東答同読内南半番分方北毎万用理話意央横化界感漢期級究決詩次事式章申真世昔全相想対代第題短談調定転度等倍反表秒部福平面問由有予様両礼案以位英媛億課賀害各完希議給共協極訓芸固佐差埼辞信省説然側単置兆低的伝努特徳奈念敗博阪必不富副別辺末未無約要量類令例圧因永益可仮価格確額紀基規義久旧均禁句経潔件険限現故個講告査再採際在罪殺雑酸賛史志識質述準序証賞条状情制政勢精績絶素総像増則測属態団断張提程統導独判比非備評貧復複仏編弁報脈夢余容略留領歴異遺拡閣割簡揮貴疑系警劇激権憲厳誤刻裁策至詞尺宗縦純処諸障垂寸聖誠宣専善操存尊値忠著敵展討党派俳班否批秘並片忘密盟模訳預乱覧裏律論",
});

const pairs = Object.entries(THEME_LOOKUP).flatMap(([theme, chars]) => [...chars].map((char) => [char, theme]));
const themeByChar = Object.fromEntries(pairs);
if (pairs.length !== officialChars.length || Object.keys(themeByChar).length !== officialChars.length) {
  throw new Error(`テーマ表は全字を重複なく含める必要があります: entries=${pairs.length}, unique=${Object.keys(themeByChar).length}`);
}
const missing = officialChars.filter((char) => !themeByChar[char]);
const extra = Object.keys(themeByChar).filter((char) => !officialChars.includes(char));
if (missing.length || extra.length) {
  throw new Error(`テーマ表が配当表と一致しません: missing=${missing.join("") || "none"}, extra=${extra.join("") || "none"}`);
}

export function resolveKanjiTheme(char) {
  return themeByChar[char] ?? "neutral";
}

export const KANJI_THEMES = Object.freeze(Object.fromEntries(
  officialChars.map((char) => [char, resolveKanjiTheme(char)]),
));

export function themeAssignments() {
  return THEME_CATEGORIES.map((theme) => ({ theme, chars: [...THEME_LOOKUP[theme]] }));
}
