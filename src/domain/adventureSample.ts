import { zlibSync } from 'fflate';
import { createEntity, createProject, emptyValidity, newId, textToRichText, validateProject } from './model';
import type { Condition, Entity, EntityDataMap, EntityKind, ProjectData, PublicTextFields, RichText, TypedValue } from './types';
import type { AssetInput } from '../storage/store';
import { prepareAsset } from './attachments';
import { dialogueContentHash } from './production';
import { createWorldSnapshot } from './world';
import { getTrialChoices, pinTrialRecord, startTrial, stepTrial } from './runtime';
import { confirmConsultationImport, previewConsultationImport } from './productionPlanning';
import { jsonBytes, sha256 } from '../storage/json';
import { addAdventureRuntimeProfile } from './adventureSampleProjection';

export const ADVENTURE_SAMPLE_TITLE = '星還りの旅人 — 全3章サンプル';
export const ADVENTURE_SAMPLE_DESCRIPTION = '異世界へ迷い込んだ測量士・澪が、冒険者リナと失われた星路をたどる。帰還の鍵と街を守る誓いが、三つの章で結び直される。';
export const ADVENTURE_SAMPLE_SUMMARY = ADVENTURE_SAMPLE_DESCRIPTION;
export interface AdventureSample { project: ProjectData; assets: AssetInput[] }
const rich = textToRichText;
const bool = (value: boolean): TypedValue => ({ type: 'boolean', value });
const integer = (value: number): TypedValue => ({ type: 'integer', value });
const enumeration = (value: string): TypedValue => ({ type: 'enum', value });
const condition = (variableId: string, value: TypedValue): Condition => ({ op: 'compare', variableId, comparator: 'eq', value });

/** Original raster map; no network, fonts, external images or active SVG documents. */
function mapBytes(): Uint8Array {
  const width = 640, height = 400, raw = new Uint8Array(height * (1 + width * 3));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const river = Math.abs(x - 305 - 35 * Math.sin(y / 52)) < 13;
    const forest = x < 190 && y > 135 && y < 340;
    const mountains = x > 420 && y < 170 && (x + y * 2) % 85 < 43;
    const color = river ? [98, 161, 190] : mountains ? [135, 142, 158] : forest ? [101, 139, 104] : [229, 220, 183];
    const offset = y * (1 + width * 3) + 1 + x * 3;
    raw.set(color, offset);
  }
  const chunk = (name: string, data: Uint8Array) => {
    const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
    view.setUint32(0, data.length); bytes.set(new TextEncoder().encode(name), 4); bytes.set(data, 8);
    let crc = 0xffffffff;
    for (const value of bytes.subarray(4, bytes.length - 4)) { crc ^= value; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0); return bytes;
  };
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 2;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array())];
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; } return output;
}

/** Three original chimes are a temporary sound cue, not a claimed voice recording. */
function chimeBytes(): Uint8Array {
  const rate = 8000, length = rate * 2, bytes = new Uint8Array(44 + length * 2), view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => bytes.set(new TextEncoder().encode(value), at);
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) { const t = i / rate, note = Math.min(2, Math.floor(t / 0.6)), phase = t - note * 0.6; view.setInt16(44 + i * 2, Math.round(Math.sin(t * Math.PI * 2 * [440, 554.37, 659.25][note]) * Math.exp(-phase * 6) * 6000), true); }
  return bytes;
}

/** Creates a fresh, independently editable work including real assets and generated trial evidence. */
export async function createAdventureSampleProject(): Promise<AdventureSample> {
  let project = createProject(ADVENTURE_SAMPLE_TITLE);
  const add = <K extends EntityKind>(kind: K, name: string, data?: Partial<EntityDataMap[K]>): Entity<K> => {
    const entity = createEntity(project.projectId, kind, name, data); entity.status = 'confirmed'; project.entities.push(entity); return entity;
  };
  const assets = await Promise.all([prepareAsset(mapBytes(), 'エルセリア西境・旅の地図.png'), prepareAsset(chimeBytes(), '星路の三音・仮効果音.wav')]);
  const artSource = add('source', 'サンプル専用の地図・三音の出所', { sourceType: 'observation', locator: 'このサンプルの生成処理で作成したオリジナル素材', interpretation: rich('地図は位置関係を示す模式図。三音は物語の記憶装置を示す仮効果音。実在の土地・史料・声優の収録ではない。'), redistributionAllowed: true });
  const attachments = assets.map(asset => add('attachment', asset.displayName, { mediaType: asset.mediaType, contentHash: asset.contentHash, byteSize: asset.byteSize, assetPath: asset.assetPath, displayName: asset.displayName, provenanceId: artSource.id, licenseNote: 'サンプル専用オリジナル素材。作品とともに複製・改変・配布できます。', stage: 'temporary' }));
  artSource.data.attachmentId = attachments[0].id;
  project.calendarId = 'elseria-dawn';
  project.calendars = [{ id: project.calendarId, name: 'エルセリア黎明暦', kind: 'repeating', originLabel: '星路再開年・芽吹き月1日 午前0時', ticksPerDay: '24', years: [{ months: [{ name: '芽吹き', days: 30 }, { name: '長雨', days: 30 }, { name: '陽光', days: 30 }, { name: '実り', days: 30 }, { name: '霜', days: 30 }, { name: '星眠り', days: 30 }] }] }];
  project.mainStart = '8';
  const characterSpecs = [
    ['水瀬 澪', 'みなせ みお', '24歳。日本の測量技師。帰宅途中の落橋で異世界に迷い込む。', '紺の作業着と傷のある真鍮コンパスを持つ。高所が苦手だが、危険を数字にすれば一歩踏み出せる。相手の発言を図にして理解する。妹・凪に「必ず帰る」と約束した。魔力を発生できない一方、魔力の流れを距離と角度として認識する。帰還のため他人を犠牲にすることを拒む。', '私', '断定する前に根拠を述べる。「測ってみよう」が口癖。', '帰還路を見つけ、エルセリアの街も守る'],
    ['リナ・フェル', 'りな ふぇる', '21歳。灰羽の冒険者組合に属する斥候。澪の案内役。', '赤い編み紐を左手首に結ぶ。軽弓と折り畳み杖を使う。幼い弟を灰の洪水で失い、救助を優先して任務に遅れた過去がある。祖母から三音の子守唄を教わったが意味を知らない。普段は快活で短い命令形。仲間を選ぶ自由が自分にもあると学ぶ。', 'あたし', '短く率直。「まず生きて帰る」が信条。', '街を灰の洪水から守り、自分の選択を赦す'],
    ['セイル・アルカ', 'せいる あるか', '36歳。白鐘書庫の司書。失われた星路の研究者。', '銀縁の眼鏡と墨の付いた袖。右手に古い火傷。星路守の一族だが、禁書を隠した父の罪を引き継ぐと恐れ、血筋を伏せている。資料の確度を明示する。古文の読解は得意、野外行動は苦手。第三章で自身の家印とコンパスの紋を照合する。', '僕', '「記録によれば」「推測ですが」と事実と解釈を分ける。', '星路の仕組みを公開し、独占の歴史を終わらせる'],
    ['オルド・グレン', 'おるど ぐれん', '52歳。灰羽組合の支部長。元鉱山救助隊。', '義足を着用し、机の脇に救助縄を置く。洪水で隊員を失った責任感から規則を厳しく運用する。澪を利用するだけの人物ではなく、危険を説明し帰還費用を前払いする。地元の避難経路を熟知する。', '俺', '指示は人数・時間・退路の順。「退路を決めろ」。', '住民の避難と冒険者の帰還を両立する'],
    ['ノア', 'のあ', '外見12歳。星見塔の保守人形。300年前の記録を保持する。', '片目だけ琥珀色。食事をせず、定時に掌の水晶を磨く。感情に似た応答は長年の保守記録から学習したもの。命令の逐語的解釈で人を傷つけたため、今は目的を問い返す。第三章で「閉鎖」命令を「安全な接続」へ更新する協力者。', '私', '丁寧で簡潔。命令を復唱し、目的を確認する。', '塔の保守命令を人を守る意味へ読み替える'],
    ['ヴァルド・レイン', 'ゔぁるど れいん', '43歳。王都星路局の監督官。敵対するが交渉可能。', '灰色の外套と局章。旧事故で家族を失い、星路再開は必ず災害になると信じる。星核片を没収して封鎖する権限を持つ。誤った記録を根拠にしており、証拠を示されれば命令を撤回できる。', '私', '敬語を保ち、規則の条項を引用する。', '二度目の星路事故を防ぐ'],
    ['ミナ・トル', 'みな とる', '17歳。河渡り宿の薬師見習い。橋の避難を手伝う。', '乾燥薬草の袋を腰に下げる。灰毒を治すのではなく症状を遅らせる薬を調合する。知識の限界を説明する。自分の手柄より患者の安全を優先する。遠回りの経路では澪たちに保存薬と聞き書きを渡す。', 'わたし', '柔らかい敬語。「まだ分からないこともあります」。', '灰毒の患者を救助地点まで運ぶ'],
    ['エダ・フェル', 'えだ ふぇる', '68歳。リナの祖母。星渡りの子守唄の最後の伝承者。', '第1章では手紙と記憶の中に登場し、第3章で連絡を交わす。三音の唄を祭りの歌として伝えてきた。身分制度で読めなかった星路記録を、音と刺繍に変えて継承した。知識は血統だけに属さないという主題を支える。', 'わたし', '身近な家事の比喩で話す。結論を急がせない。', '知恵を誰もが使える形で次世代へ渡す'],
  ];
  const characters = characterSpecs.map(([name, reading, summary, body, firstPerson, phrasing, goalText]) => {
    const person = add('character', name, { reading, summary: rich(summary), body: rich(body), authorNotes: rich(`人物の変化：${goalText}。場面で選択と結果を描き、設定説明だけで済ませない。`) });
    const voice = add('voice_rule', `${name}の口調`, { characterId: person.id, validity: emptyValidity(), firstPerson, addressing: '仲間は名前。初対面には敬称を添える。', phrasing, examples: rich(`${firstPerson}にできることを、確かめてから進もう。`) });
    const goal = add('goal', `${name}の目標`, { ownerId: person.id, description: rich(goalText) }); person.data.goals = [goal.id]; person.data.voiceRules = [voice.id];
    person.data.aliases = [{ id: newId(), text: name.split(' ')[0], reading, validity: emptyValidity(), audienceHolderIds: [], isPublicDefault: true }]; return person;
  });
  const [mio, lina, seil, ordo, noa, valdo, mina, eda] = characters;
  const placeSpecs = [
    ['エルセリア西境', 'えるせりあせいきょう', '王国西側の盆地。東西80km、南北50km。北東に星見塔、中央に銀枝川、西に眠り森。雨は西風で運ばれる。徒歩一刻はおよそ4km。星路事故の灰は川沿いに流れる。'],
    ['落星の草原', 'らくせいのそうげん', '澪の出現地点。ルーメンの南西8km。夜露の上だけに、普通の星図と逆向きの光が残る。水は飲用不可。背の低い薬草と黒い柱状石がある。'],
    ['灯都ルーメン', 'とうとるーめん', '人口約8千人の交易街。銀枝川の西岸。灰羽組合、避難広場、白鐘書庫が同じ石畳通りに並ぶ。行政は王国、救助は組合、記録は司書が担当する。'],
    ['白鐘書庫', 'はくしょうしょこ', 'ルーメン北区。二階は公開資料、一階奥は事故記録。鐘の振動が魔力紙を保護する。300年前の測量日誌の頁だけ反転印刷されている。火気厳禁。'],
    ['河渡り宿と銀枝橋', 'かわわたりやどとぎんしきょう', '街から東へ12km。増水で旧橋は損傷。浅瀬経由なら救助ができるが半刻余分にかかる。宿に薬師と避難者が集まる。対岸の青い柱が測量基点。'],
    ['眠り森の環状遺跡', 'ねむりもりのかんじょういせき', '銀枝橋の北西6km。水晶菌の光で距離感が狂う。三つの石輪の中心を測ると北東の塔へ線が伸びる。暴れる灰狼は魔力過剰であり、生来の怪物ではない。'],
    ['星見塔', 'ほしみとう', '標高680m、橋の北東24km。三重螺旋の階段と水を使わない時計がある。ノアが管理する。上層のレンズは東西反転で地図を投影する。保守経路は南面。'],
    ['星還りの門', 'ほしかえりのもん', '塔の地下、三本の導線の交点。街への防護路と異世界への帰還路を切り替える。二つを同時に開くのでなく、三音で順に接続すれば圧力を逃せる。最終章の選択地点。'],
  ];
  const places = placeSpecs.map(([name, reading, body], i) => add('place', name, { reading, body: rich(body), parentId: null }));
  for (let i = 1; i < places.length; i++) places[i].data.parentId = places[0].id;
  places[3].data.parentId = places[2].id; places[7].data.parentId = places[6].id;
  const map = add('map', '三章の旅路・西境地図', { placeId: places[0].id, attachmentId: attachments[0].id, pins: places.slice(1).map((place, i) => ({ id: newId(), placeId: place.id, x: [0.15, 0.38, 0.4, 0.56, 0.23, 0.83, 0.86][i], y: [0.82, 0.62, 0.54, 0.58, 0.4, 0.2, 0.27][i], label: place.name })) });
  places.forEach(place => { place.data.mapIds = [map.id]; });
  const group = add('group', '灰羽の冒険者組合', { groupType: 'faction', members: [lina.id, ordo.id, mio.id], summary: rich('救助と探索を請け負う互助組織。任務書には報酬・危険・撤退条件を明記する。所属は血統や出自を問わない。') });
  const thread = add('group', '帰還と居場所', { groupType: 'plot_thread', members: [mio.id, lina.id, seil.id], summary: rich('故郷へ帰る願いと、目の前の他者を守る選択を三章で重ねる。') });
  const itemType = add('item', '星核片', { itemMode: 'type', body: rich('星路の圧力を蓄える青い結晶。1片で1経路を短時間安定化する。人の血で起動するという俗説は誤り。衝撃と高熱に弱く、布で包む。'), properties: null });
  const compassType = add('item', '星路測量コンパス', { itemMode: 'type', body: rich('アルカ工房が製造した携帯測量器。星路基点の方向と距離を光で示す。北を示す普通の磁石とは異なる。') });
  const compass = add('item', '澪の真鍮コンパス', { itemMode: 'instance', typeId: compassType.id, body: rich('祖父の形見。磁北でなく最も近い星路基点を指す。蓋の裏に三本線の紋があり、第三章でアルカ家の工房印と分かる。元の世界にも星路がつながっていた証拠。'), properties: null });
  const crystal = add('item', '遺跡で得る第一星核片', { itemMode: 'instance', typeId: itemType.id, body: rich('環状遺跡の台座に残る個体。澪が計測しリナが運搬する。第三章で防護路の起動に消費する。') });
  const herb = add('item', '灰毒を遅らせる保存薬', { itemMode: 'type', body: rich('ミナの処方。症状を二刻遅らせるが治療薬ではない。救助経路で入手し住民へ渡す。薬効を誇張しない。') });
  const loreSpecs = [
    ['星路と魔力保存則', '星路は世界間のエネルギーを運ぶ導線。魔力を無から生み出せない。接続先を急に閉じると余剰が灰となる。三つの経路を低圧側から順に開けば安全に移送できる。'],
    ['黎明暦と旅の所要時間', '一日は24刻、一年は六か月各30日。1tickは1刻。第1章は芽吹き月1日、第2章は2日、第3章は3日。制作期限は現実の暦として別管理する。'],
    ['冒険者の契約と通貨', '銅貨10枚で銀貨1枚。宿泊は銀貨1枚、星路調査の前金は5枚。任務の成功より撤退判断を優先する条項がある。救助対象から追加報酬を取らない。'],
    ['王国星路局と封鎖令', '300年前の事故後、星路局が遺跡管理を独占。監督官は危険物の没収権を持つが、緊急避難の証拠があれば現地裁量で停止できる。ヴァルドとの交渉根拠。'],
    ['三音の子守唄', '低いラ・中のド♯・高いミ。歌詞は「道を量り、灯を分け、名を呼ぼう」。保守操作を庶民に残すためエダの先祖が唄にした。血筋による選別の歌ではない。'],
    ['灰の洪水と生態', '魔力過剰の灰は水より低い地面へ流れる。植物の葉脈が銀色になり、動物は光を避ける。直接触れず湿った布と高所への退避が基本。川の水位とは別現象。'],
    ['二つの世界を結ぶ工房', '星路工房アルカは300年前に複数世界へ測量器を送った。澪の祖父が拾ったコンパスもその一つ。澪は選ばれた血統ではなく、計測の技能によって解決に参加する。'],
  ];
  const lores = loreSpecs.map(([name, body]) => add('lore', name, { body: rich(body) }));
  const source = add('source', '架空史料：星路保守日誌・第三冊', { sourceType: 'book', locator: '物語内の架空史料／白鐘書庫 保守記録 第三冊 12–18頁', excerptLocation: '14頁の反転星図と18頁の「三導線・順次接続」', interpretation: rich('事故原因は異邦人ではなく導線の一斉閉鎖。欠損箇所はセイルの推測で補い、第三章で塔の実測と照合する。実在資料の引用ではない。'), redistributionAllowed: true });
  lores.forEach(lore => { lore.data.sourceIds = [source.id]; });
  const template = add('template', '冒険者の人物票', { targetKind: 'character', description: '本文設定と、検索に使える構造化項目を併用する。', version: '1', fields: [
    { key: 'profession', label: '職業', type: 'text', required: true, nullable: false, default: '冒険者', help: '物語上の役割とは別に、日常の仕事を記す。' },
    { key: 'chapter_debut', label: '初登場章', type: 'number', required: true, nullable: false, default: 1 },
    { key: 'home_place', label: '活動拠点', type: 'ref', required: true, nullable: false, default: { type: 'ref', value: places[2].id }, targetKinds: ['place'] },
  ] });
  characters.forEach((person, i) => { person.templateId = template.id; person.customValues = { profession: ['測量技師', '斥候', '司書', '組合長', '塔の保守人形', '監督官', '薬師見習い', '織物師'][i], chapter_debut: [1, 1, 1, 1, 3, 2, 2, 1][i], home_place: { type: 'ref', value: i === 4 ? places[6].id : i === 6 ? places[4].id : places[2].id } }; });
  const chapters = [
    add('chapter', '第1章　逆さの星を測る', { summary: rich('澪は落星の草原でリナに救われ、灯都で帰還調査を請け負う。コンパス、反転星図、三音の唄という三つの手掛かりを得る。'), structureRole: '導入：異世界の制約と帰還の願いを提示' }),
    add('chapter', '第2章　灰の川と失われた誓い', { summary: rich('橋の避難と遺跡調査を両立し、星核片を得る。ヴァルドの封鎖命令と対峙し、事故の公式説明を疑う。仲間の信頼が交渉の選択肢を変える。'), structureRole: '展開：救助か急行かを選び、証拠と関係を積み上げる' }),
    add('chapter', '第3章　星還りの門', { summary: rich('塔の実測から事故の真相を確定。三つの伏線を回収し、街の防護と帰還路の共存を実現する。澪は連絡路を残して故郷へ帰る。'), structureRole: '解決：知識を共有し、帰還と他者への責任を両立' }),
  ];
  const sceneSpecs = [
    ['01　知らない星の朝', 1, 8, '澪は異世界で目覚め、リナと合流する。', '湿った草が頬に触れた。澪は破れた袖を押さえ、空に二つの月を見つけた。道路も橋もない。足元の真鍮コンパスだけが、故郷で最後に見たものと同じだった。\n針は北を向かなかった。草原の黒い石柱へ、脈を打つように揺れている。澪が歩幅を数えると、光の筋が規則正しい間隔で重なった。故障だと片づけるには、あまりに正確だった。\n弓を背負った少女が水筒を差し出した。「あたしはリナ。まず、生きて帰ろう。帰る場所の話は、そのあとでいい」澪は水を受け取り、コンパスの針と石柱を手帳に描いた。', '生存と情報収集', '帰還を急ぐ焦りと未知の環境', 'リナの案内を受け入れる', 'コンパスは魔力の基点を指す', 3],
    ['02　灰羽の契約', 2, 11, '組合長から報酬・危険・撤退条件を聞く。', '灰羽組合の机には、報酬の袋より先に避難図が置かれた。オルドは義足を引き、「退路を決めろ。英雄になる予定は契約に書くな」と言った。北東の星見塔なら異邦人の記録があるという。\n澪は調査の前金を受け取る手を止めた。「帰る方法が見つからなかったら」。「それでも生きて戻れば仕事は終わりだ」。リナの肩がわずかに下がった。\n門限までに書庫へ寄るか、荷を整えて出発するか。澪は手帳の空白を見た。知らないことを数えるのも、測量の仕事だった。', '安全な調査契約を結ぶ', '早く帰りたい願いと準備の必要', '調査を正式に引き受ける', '救助優先の契約、書庫の存在', 2],
    ['03　白鐘書庫の反転頁', 3, 14, 'セイルと反転星図を調べる追加場面。', '鐘が鳴るたび、紙の端が淡く光った。セイルは事故の記録と噂の本を別々に積んだ。「この頁は写しです。何が省かれたかは分からない」。澪はコンパスを星図へ重ね、地図を裏返した。\n三本の線が同じ角度で重なった。日誌が誤っているのではない。塔のレンズ越しに写した図だから、東西が逆なのだ。セイルは袖で右手の火傷を隠した。\n「この紋を見たことがあります。でも、確かめる時間をください」。澪は彼を問い詰めず、頁番号と未確認の解釈を分けて書いた。', '帰還装置の手掛かりを得る', '史料の欠損とセイルの秘密', '反転の理由を仮説として残す', '三本線の紋と塔のレンズ', 4],
    ['04　三音を携えて', 2, 18, '旅立ち前に三音の唄と共通の調査メモを受け取る。', '書庫へ寄った者にも、荷車を整えた者にも、セイルは同じ写しを渡した。澪は「確認したこと」と「まだ推測のこと」を違う線で囲んだ。急いだせいで知る機会を失わせないためだ。\n夕暮れ、リナが祖母の手紙を読んだ。余白には三つの音符。「道を量り、灯を分け、名を呼ぼう」。子守唄だと言いながら、彼女は赤い編み紐を強く握った。\nコンパスが唄の最後の音に小さく震えた。澪は歌ってもらった順番を書き留めた。セイルも資料鞄を背負い、三人は北門を出て河渡り宿を目指した。', '旅の準備と手掛かりの共有', '急行した経路にも必要情報を残す', '三音と反転図を全経路で共有する', '三音の順番が装置へ作用する', 3],
    ['05　銀枝橋の避難者', 4, 32, '灰の流れに追われる住民を発見する。', '川は増えていない。それなのに灰だけが橋脚を上っていた。ミナは湿った布を子どもの口に当て、「薬は時間を稼ぐだけです」と言った。対岸の青い柱の周りには、灰が来ていない。\nリナは弓を握り、失った弟と同じ背丈の少年を見つめた。「任務が先だって、前は言われた」。澪は橋の傾きと流れを測った。「今なら浅瀬に退路が作れる。数字は、見捨てる理由じゃない」。\n救助に回るか、薬と避難図を託して遺跡へ急ぐか。どちらを選んでも、誰が続きを担うのかを言葉にする必要があった。', '避難者の安全と調査時間を両立', '救助にかかる時間と塔の期限', '役割分担を明示して選択する', '灰は水位と独立、基点周辺は安全', 6],
    ['06　救助縄の向こう側', 4, 34, '遠回りして住民を運び、信頼と保存薬を得る。', '澪は青い柱から縄の長さを測り、浅瀬へ一直線の目印を張った。リナが一人ずつ住民を背負い、ミナが呼吸を確かめる。最後の少年が渡り終えるまで、誰も成功を口にしなかった。\n対岸でリナは手首の紐をほどいた。「あのときの弟は戻らない。でも、今日の誰かは戻せた」。澪は答えを急がず、結び直すのを手伝った。\nミナは保存薬と古い渡守の聞き書きを渡した。星路は人を選ぶ門ではなく、皆で保つ橋だった。救助で失った時間を取り戻すように、住民が最短の山道を教えた。', '住民を対岸へ運ぶ', '過去の喪失によるリナのためらい', '信頼と薬・土地の証言を得る', '星路は共同管理の道だった', 7],
    ['07　眠り森の三つの中心', 5, 38, '遺跡を測量して星核片を回収する。', '森の光は距離を嘘にした。澪は目測を捨て、縄と歩数で三つの石輪の中心を求めた。中心を結ぶ線は、地図ではなく反転した地図の塔へ向かう。\n灰狼が茂みから現れたが、リナは弓を下ろした。体の光が強すぎるのだ。澪が水晶板の角度をずらすと、余剰の魔力が地中へ逃げ、狼は静かに森へ帰った。\n台座から星核片を取り出すと、三音が短く響いた。血を流す必要も、誰かを生贄にする必要もなかった。セイルは公式史料の誤りを認め、塔で確かめると約束した。', '星核片を安全に取り出す', '錯覚と暴れる灰狼', '計測と圧力調整で解決する', '血統や犠牲は起動条件ではない', 7],
    ['08　封鎖令の持ち主', 5, 42, 'ヴァルドへ証拠を提示し、同行を取り付ける。', '遺跡の出口に灰色の外套が並んだ。ヴァルドは星核片の引渡しを命じた。「異邦人が門を開いた結果が、三百年前の災厄です」。澪は日誌の頁と測量値を順に置いた。\nリナと積んだ信頼があれば、救助された住民の証言も添えられる。急行した道では、星核片を封印箱へ預け、監督官の同行を条件に調査を続ける。どちらも脅して通る道ではなかった。\nヴァルドは地図の反転を長く見た。「命令の根拠が誤りなら、止めるべきは別の操作かもしれない」。彼は部下を避難支援へ戻し、自ら塔へ同行した。', '封鎖を解除し共同調査にする', '権限と誤った事故記録', '信頼に応じた交渉で同行を得る', '敵対者にも守りたいものがある', 6],
    ['09　名を問う塔', 6, 57, 'ノアの問いに答え、塔の保守室へ進む。', '星見塔の人形は、武器ではなく名前を尋ねた。「目的を確認します。帰還ですか、閉鎖ですか」。澪は「街を守って帰る」と答えた。人形は二つの目的を別々の札に記した。\nセイルはコンパスの蓋を開き、自分の家印を並べた。三本線は王の血の印ではなく、測量器を作った工房の印だった。澪の祖父が異世界の道具を持っていた理由も、ここで一本の線になった。\nノアは破損した命令を見せた。事故の直前に実行されたのは開門ではなく一斉閉鎖。守るための命令が、守るべき場所へ灰を押し戻したのだ。', '塔へ入り命令記録を読む', '目的を一つに限定する古い命令', '二つの目的と事故原因を明確化', 'コンパスの来歴、閉鎖が事故原因', 7],
    ['10　逆さの星が示すもの', 6, 59, '反転星図を実測と照合して第一の伏線を回収。', 'レンズの下で地図は東西を逆に映した。澪は書庫で囲んだ未確認の線を、いま測った数値でなぞった。仮説と観測が重なり、三本の導線が地下の門へ集まった。\n「異邦人が悪い」という記述は、故障した手順を隠すための後世の追記だった。セイルは家の名を添えて誤りを認め、写しをヴァルドへ渡した。知識を守ることと隠すことは、同じではない。\n澪は高い窓の前で足を止め、リナの手を借りて最後の基点を測った。怖さが消えなくても、協力すれば測れる距離があった。', '仮説を実測で確定する', '家の名誉と記録訂正の責任', '反転図と工房印の意味を公開する', '星路は技能と共有知識で修理できる', 8],
    ['11　三音で灯を分ける', 7, 60, '唄と誓いの伏線を回収し、防護路を起動する。', '地下の門は一斉開放の命令を待っていた。リナは祖母の唄を口ずさんだ。「道を量り、灯を分け、名を呼ぼう」。澪は三つの動詞を三本の導線へ割り当てた。\n最初の音で低圧側を測り、次の音で星核片の力を街の防護へ分ける。最後に接続先の名を呼ぶ。一度に全部を動かす必要はなかった。エダの先祖は保守手順を、誰でも覚えられる歌に残したのだ。\nノアが命令を復唱し、ヴァルドが封鎖令を撤回した。リナは灰の流れが引くのを見届けた。「守るって、閉じ込めることじゃなかった」。', '防護と帰還を順次接続する', '誤った一斉操作の誘惑', '星核片を消費し街を守る', '三音は操作順、誓いは排除でなく協力', 9],
    ['12　帰る道、続く道', 7, 62, '主要な謎を解き、帰還と再会の約束を描く。', '門の向こうには雨上がりの道路が見えた。澪の手帳には、こちらで覚えた名前が並んでいる。帰ることは、ここでの時間を消すことではなかった。\nルーメンへ届いた連絡で、エダは唄の続きを教えた。「橋は渡ったら終わりじゃない。次の人のために、傷んだところを知らせるの」。澪は測量記録の写しをセイルへ、コンパスの修理法をノアへ渡した。\nリナは赤い編み紐を半分にした。「次は依頼じゃなく、遊びに来なよ」。澪は紐を手帳へ結び、門をくぐる。妹への最初の言葉は、長い説明ではなかった。「ただいま」。星路の向こうで、三つの音が静かに応えた。', '故郷へ帰り知識を残す', '別れと新しい関係の継続', '帰還し定期連絡の道を残す', '主要な謎をすべて回収し三章で完結', 4],
  ] as const;
  const events: Entity<'event'>[] = [], scenes: Entity<'scene'>[] = [];
  const sceneParticipants = [
    [mio, lina], [mio, lina, ordo], [mio, lina, seil], [mio, lina, seil],
    [mio, lina, seil, mina], [mio, lina, seil, mina], [mio, lina, seil], [mio, lina, seil, valdo],
    [mio, lina, seil, noa, valdo], [mio, lina, seil, noa, valdo], [mio, lina, seil, noa, valdo], [mio, lina, seil, noa, valdo],
  ];
  sceneSpecs.forEach(([name, placeIndex, tick, summary, body, goal, conflict, result, information, tension], i) => {
    const event = add('event', name.replace(/^\d+　/, ''), { summary: rich(summary), time: { mode: 'instant', at: String(tick), calendarId: project.calendarId }, laneRole: 'both', locationId: places[placeIndex].id, participants: sceneParticipants[i].map(person => ({ characterId: person.id, role: 'actor' })), itemIds: [compass.id], constraints: [] });
    const scene = add('scene', name, { summary: rich(summary), body: rich(body), authorNotes: rich(`この場面の役割：${information}。読者に見える本文と作者だけの設計意図を分ける。`), eventIds: [event.id], chapterId: chapters[Math.floor(i / 4)].id, threadIds: [thread.id], povId: mio.id, goals: rich(goal), conflicts: rich(conflict), results: rich(result), newInformation: rich(information), tension, importance: i > 8 ? 10 : 7 });
    chapters[Math.floor(i / 4)].data.sceneIds.push(scene.id); events.push(event); scenes.push(scene);
  });
  events[3].data.participants!.push({ characterId: eda.id, role: 'mentioned' });
  events[11].data.participants!.push({ characterId: eda.id, role: 'informed' });
  events[5].data.itemIds!.push(herb.id); events[6].data.itemIds!.push(crystal.id); events[10].data.itemIds!.push(crystal.id);
  const goalEvidence = [[0, 8, 11], [4, 5, 10], [2, 9], [1], [8, 10], [7, 9, 10], [4, 5], [3, 11]];
  characters.forEach((person, index) => {
    const goal = project.entities.find(entity => entity.id === person.data.goals![0]) as Entity<'goal'>;
    goal.data.evidenceSceneIds = goalEvidence[index].map(scene => scenes[scene].id);
  });
  const ancientEvent = add('event', '300年前・星路の一斉閉鎖事故', { summary: rich('保守命令の誤りで余剰魔力が街へ逆流。後の記録は異邦人に原因を帰した。'), time: { mode: 'uncertain', earliest: '-1296001', latest: '-1295976', calendarId: project.calendarId, precision: '残存記録から一日幅。正確な刻は不明。' }, laneRole: 'common', locationId: places[7].id, itemIds: [compass.id] });
  events.forEach((event, i) => { if (i < events.length - 1) event.data.constraints = [{ type: 'before', targetEventId: events[i + 1].id }]; });
  const routes = [[1, 2, '徒歩', 2, 3], [2, 4, '徒歩・荷車・宿での休息を含む', 3, 14], [4, 5, '森の徒歩道', 2, 4], [5, 6, '山道・途中野営を含む', 6, 18], [6, 7, '塔内の保守階段', 1, 1]] as const;
  routes.forEach(([from, to, method, min, max]) => add('travel_route', `${places[from].name} → ${places[to].name}`, { fromPlaceId: places[from].id, toPlaceId: places[to].id, direction: 'two_way', method, minimumTicks: String(min), maximumTicks: String(max), evidence: [map.id, source.id] }));
  const locationHistory = add('assertion', '星還りの門・封鎖期', { subjectId: places[7].id, predicate: 'place_state', value: enumeration('封鎖'), truthKind: 'author_truth', sourceIds: [ancientEvent.id], validity: { ...emptyValidity(), worldRange: { start: '-1295976', end: '60' } }, reason: '一斉閉鎖事故後、第三章の修理まで接続を停止。' });
  const reopened = add('assertion', '星還りの門・安全運用期', { subjectId: places[7].id, predicate: 'place_state', value: enumeration('順次接続'), truthKind: 'author_truth', sourceIds: [events[10].id], validity: { ...emptyValidity(), worldRange: { start: '60', end: null } }, reason: '三音の手順で防護と帰還を順次実行できる。' });
  places[7].data.changes = [locationHistory.id, reopened.id];
  const truths = [
    add('assertion', 'コンパスの事実', { subjectId: compass.id, predicate: '製作者', value: enumeration('複数世界へ道具を送ったアルカ工房'), truthKind: 'author_truth', sourceIds: [source.id, events[8].id], evidenceLocation: { entityId: scenes[8].id, blockId: scenes[8].data.body[1].id } }),
    add('assertion', '三音の事実', { subjectId: lores[4].id, predicate: '用途', value: enumeration('導線を順次接続する保守手順'), truthKind: 'author_truth', sourceIds: [source.id, events[10].id] }),
    add('assertion', '事故原因の事実', { subjectId: ancientEvent.id, predicate: '原因', value: enumeration('導線の一斉閉鎖'), truthKind: 'author_truth', sourceIds: [source.id, events[9].id] }),
  ];
  add('assertion', 'ヴァルドの当初の認識', { subjectId: ancientEvent.id, predicate: '原因', value: enumeration('異邦人による開門'), truthKind: 'belief', holderId: valdo.id, sourceIds: [source.id], validity: { ...emptyValidity(), worldRange: { start: '0', end: '59' } }, reason: '改竄された公式史料を信じている。作者の真実とは分ける。' });
  const correctedBelief = add('assertion', 'ヴァルドが証拠から得る認識', { subjectId: ancientEvent.id, predicate: '原因', value: enumeration('導線の一斉閉鎖'), truthKind: 'belief', holderId: valdo.id, sourceIds: [scenes[9].id], evidenceLocation: { entityId: scenes[9].id, blockId: scenes[9].data.body[1].id }, reason: '第3章で記録訂正を聞いた後、明示した認識効果で取得する。場面へ参加しただけでは取得しない。' });
  lores[6].data.assertionIds = [truths[0].id]; lores[4].data.assertionIds = [truths[1].id]; lores[0].data.assertionIds = [truths[2].id];
  const dialogueSpecs = [
    [lina, 'まず、生きて帰ろう。帰る場所の話は、そのあとでいい。'], [ordo, '退路を決めろ。英雄になる予定は契約に書くな。'], [seil, 'この頁は写しです。何が省かれたかは分からない。'], [lina, '道を量り、灯を分け、名を呼ぼう。'], [mina, '薬は時間を稼ぐだけです。'], [lina, '今日の誰かは戻せた。'], [mio, '目で分からないなら、測ってみよう。'], [valdo, '命令の根拠が誤りなら、止めるべきは別の操作かもしれない。'], [noa, '目的を確認します。帰還ですか、閉鎖ですか。'], [seil, 'この訂正には、僕の名前を添えます。'], [lina, '守るって、閉じ込めることじゃなかった。'], [mio, 'ただいま。'],
  ] as const;
  const lines = dialogueSpecs.map(([speaker, text], i) => { const line = add('dialogue_line', `台詞 ${i + 1}・${speaker.name}`, { speakerId: speaker.id, text: rich(text) }); scenes[i].data.dialogueLineIds = [line.id]; return line; });
  add('dialogue_line', '事故原因の認識・注釈例', { speakerId: seil.id, text: rich('事故の原因は、開門ではなく一斉閉鎖でした。'), claimAssertionIds: [truths[2].id], assertionIntent: 'statement', assertionReason: '塔の保守記録と実測を照合した発言。認識注釈の編集用資料。本編台詞と区別し、実行形式への出力対象から外す。' });
  const cue = add('cue', '第3章・三音と門の明滅', { anchor: { entityId: scenes[10].id }, cueType: 'sound', attachmentId: attachments[1].id, speakerId: lina.id, expression: '静かな決意', waitMs: 1800, mediaTime: 0, camera: null, stage: '仮演出' });
  lines[10].data.cueIds = [cue.id];
  add('storyboard_frame', '三音の接続・絵コンテ01', { anchor: { entityId: scenes[10].id, blockId: scenes[10].data.body[1].id }, mediaStartMs: 0, mediaEndMs: 8000, referenceAssetId: attachments[0].id, cueIds: [cue.id], caption: rich('手元から三本の導線へ引き、俯瞰で見せる。低圧側から一つずつ点灯。音と同時に光らせる。地図は仮参照素材。') });
  for (const index of [0, 3, 10, 11]) {
    const hash = await dialogueContentHash(project, lines[index]);
    const translation = add('localization', `英訳草稿・${lines[index].name}`, { sourceLineId: lines[index].id, language: 'en', sourceHash: hash, text: rich(['First, let us get home alive.', 'Measure the path, share the light, and call its name.', 'Protecting people never meant locking them away.', 'I am home.'][[0, 3, 10, 11].indexOf(index)]), stage: 'draft' });
    const recording = add('recording', `収録計画・${lines[index].name}`, { sourceLineId: lines[index].id, translationId: translation.id, language: 'en', sourceHash: hash, notes: rich('未収録。訳文の意味と呼吸位置を確認したあと収録する。効果音の添付を台詞音声として扱わない。'), stage: 'planned' }); translation.data.recordingIds = [recording.id];
  }
  [['星路', 'せいろ', ['星の道'], 'Starway'], ['星核片', 'せいかくへん', ['星の欠片'], 'Star-core shard'], ['灰羽', 'はいばね', ['灰翼'], 'Ashfeather']].forEach(([canonical, reading, variants, english]) => add('terminology', String(canonical), { canonical: String(canonical), reading: String(reading), variants: variants as string[], language: 'ja', usageNotes: rich(`本文の表記は「${canonical}」。英訳は ${english}。別表記は検索対象として保持し、公開原稿では統一する。`) }));
  const trust = add('variable', 'リナとの信頼', { key: 'lina_trust', valueType: 'integer', initial: integer(0), allowed: { min: 0, max: 5 }, description: rich('救助経路で2増える。2以上なら住民の証言とともに交渉できる。') });
  const route = add('variable', '橋での選択', { key: 'bridge_route', valueType: 'enum', initial: enumeration('未選択'), allowed: { values: ['未選択', '救助', '急行'] }, description: rich('世界の時刻とは別の経路状態。合流後も選択を保持する。') });
  const questState = add('variable', '帰還調査の段階', { key: 'starway_quest', valueType: 'enum', initial: enumeration('未受注'), allowed: { values: ['未受注', '調査中', '修復済み', '帰還'] }, transitionRules: [{ from: enumeration('未受注'), to: enumeration('調査中') }, { from: enumeration('調査中'), to: enumeration('修復済み') }, { from: enumeration('修復済み'), to: enumeration('帰還') }], description: rich('契約・修復・帰還の各接続で段階を進める。') });
  const protection = add('variable', '街の防護路が開いた', { key: 'town_protected', initial: bool(false), description: rich('第3章の修復後に真。帰還の前提条件。'), resetRules: [{ on: 'new_loop', value: bool(false), reason: '新しい試読では修復前から始める。' }] });
  add('variable', '安全に帰還できる', { key: 'can_return', initial: bool(false), derived: condition(protection.id, bool(true)), description: rich('防護状態から計算する派生値。直接書き換えない。') });
  const quest = add('quest', '星還りの道を開く', { key: 'restore_starway', stateVariableId: questState.id, description: rich('契約を結ぶ→遺跡を調べる→星核片で防護路を修復→帰還。救助と急行のどちらでも完了可能。'), transitionRules: questState.data.transitionRules });
  const effect = (name: string, target: Entity, value: TypedValue, operation: 'set' | 'add' = 'set') => add('effect', name, { operation, targetId: target.id, value, reason: name });
  const accept = effect('帰還調査を受注', questState, enumeration('調査中'));
  const rescue = effect('橋で救助を選ぶ', route, enumeration('救助'));
  const hurry = effect('避難支援を託し急行する', route, enumeration('急行'));
  const trustUp = effect('リナと救助して信頼を得る', trust, integer(2), 'add');
  const receiveMedicine = add('effect', 'ミナから保存薬を受け取る', { operation: 'grant', targetId: herb.id, value: integer(1), reason: '救助のお礼に保存薬を受け取る。' });
  const learnTruth = add('effect', 'ヴァルドが記録訂正を受け入れる', { operation: 'assert', targetId: correctedBelief.id, value: bool(true), reason: '第3章の実測と記録を根拠に認識を更新する。' });
  const grantCrystal = add('effect', '星核片を回収', { operation: 'grant', targetId: itemType.id, instanceId: crystal.id, value: integer(1), reason: '遺跡を測り、台座から一片を取り出す。' });
  const moveCrystal = add('effect', '星核片を澪へ渡す', { operation: 'move', targetId: itemType.id, instanceId: crystal.id, value: { type: 'ref', value: mio.id }, reason: '修理を行う澪が携行する。' });
  const useCrystal = add('effect', '防護路のため星核片を消費', { operation: 'consume', targetId: itemType.id, instanceId: crystal.id, value: integer(1), reason: '街の防護路へ魔力を移す。' });
  const repair = effect('街の防護路を修復', protection, bool(true));
  const repairedQuest = effect('帰還調査・修復済み', questState, enumeration('修復済み'));
  const completedQuest = effect('帰還調査を完了', questState, enumeration('帰還'));
  const nodes = scenes.map((scene, i) => add('flow_node', scene.name, { nodeType: i === 11 ? 'terminal' : [1, 4, 7].includes(i) ? 'choice' : 'automatic', sceneId: scene.id, executionPolicy: [1, 4, 7].includes(i) ? 'manual_choice' : 'first_match', terminalReason: i === 11 ? '街を守り、澪は故郷へ帰還。全3章の完結。' : '' }));
  const edges: Entity<'flow_edge'>[] = [];
  const connect = (from: number, to: number, label: string, effects: Entity<'effect'>[] = [], choice = false, when?: Condition) => {
    const edge = add('flow_edge', label, { fromId: nodes[from].id, toId: nodes[to].id, label, edgeType: choice ? 'choice' : 'automatic', effectIds: effects.map(item => item.id), priority: edges.length + 1, ...(when ? { condition: when } : {}) }); edges.push(edge); return edge;
  };
  connect(0, 1, 'リナと灯都へ'); connect(1, 2, '書庫で反転星図を調べる', [accept], true); connect(1, 3, '荷を整え、写しを受け取る', [accept], true); connect(2, 3, 'セイルと旅の準備をする'); connect(3, 4, '河渡り宿へ');
  connect(4, 5, '浅瀬で避難者を救助する', [rescue, trustUp], true); connect(4, 6, 'ミナに避難を託して遺跡へ急ぐ', [hurry], true); connect(5, 6, '住民が教えた山道を進む', [receiveMedicine]); connect(6, 7, '星核片を携え、監督官と話す', [grantCrystal, moveCrystal]);
  connect(7, 8, '住民の証言を添えて共同調査を申し出る', [], true, { op: 'compare', variableId: trust.id, comparator: 'ge', value: integer(2) }); connect(7, 8, '監督官の同行を条件に調査を続ける', [], true);
  connect(8, 9, '塔のレンズと記録を照合する'); connect(9, 10, '三音で順に接続する', [learnTruth, useCrystal, repair, repairedQuest]); connect(10, 11, '街の安全を確認して帰還する', [completedQuest], false, { op: 'all', children: [condition(protection.id, bool(true)), { op: 'known', assertionId: correctedBelief.id, holderId: valdo.id }] });
  const graph = add('flow_graph', '全3章・星還りの旅', { nodeIds: nodes.map(node => node.id), edgeIds: edges.map(edge => edge.id), entryIds: [nodes[0].id], exitIds: [nodes[11].id] }); quest.data.flowIds = [graph.id];
  const fores = [
    ['北を指さないコンパス', 'なぜ澪のコンパスは異世界の石柱へ向くのか？', '故郷と異世界の既存のつながりを、血統でなく道具と技能で回収する。', 0, 8, truths[0]],
    ['三音の子守唄', 'リナの祖母の唄はなぜ装置を震わせるのか？', '口承された保守手順が最後の修復を可能にする。', 3, 10, truths[1]],
    ['開門の罪と封鎖の記録', '本当に異邦人が事故を起こしたのか？', '反転図と記録を比較し、排除の物語を証拠で改める。', 7, 9, truths[2]],
  ] as const;
  const disclosures: Entity<'disclosure'>[] = [];
  fores.forEach(([name, question, intent, clueIndex, payoffIndex, truth]) => {
    const foreshadow = add('foreshadow', name, { question: rich(question), intent: rich(intent), resolutionPolicy: 'this_work', truthAssertionIds: [truth.id], deadline: { projectId: project.projectId, chapterId: chapters[2].id }, presentationDeadline: { entityId: scenes[11].id } });
    const clue = add('disclosure', `${name}・手掛かり`, { foreshadowId: foreshadow.id, anchor: { entityId: scenes[clueIndex].id, blockId: scenes[clueIndex].data.body[clueIndex === 7 ? 0 : 1].id }, stage: 'hint', role: 'clue', targetScope: { projectId: project.projectId, graphId: graph.id } });
    const payoff = add('disclosure', `${name}・回収`, { foreshadowId: foreshadow.id, anchor: { entityId: scenes[payoffIndex].id, blockId: scenes[payoffIndex].data.body[1].id }, stage: 'reveal', role: 'payoff', targetScope: { projectId: project.projectId, graphId: graph.id } });
    foreshadow.data.clueIds = [clue.id]; foreshadow.data.payoffIds = [payoff.id]; foreshadow.data.requiredInfo = [clue.id]; disclosures.push(clue, payoff);
    project.relations.push({ id: newId(), projectId: project.projectId, revision: '0', fromId: clue.id, toId: payoff.id, relationType: 'foreshadow_payoff', direction: 'forward', validity: emptyValidity(), evidenceIds: [scenes[clueIndex].id, scenes[payoffIndex].id], status: 'confirmed', visibility: 'private' });
  });
  const relation = (from: Entity, to: Entity, type: string, evidence: Entity[], validity = emptyValidity()) => project.relations.push({ id: newId(), projectId: project.projectId, revision: '0', fromId: from.id, toId: to.id, relationType: type, direction: 'forward', validity, evidenceIds: evidence.map(item => item.id), status: 'confirmed', visibility: 'private' });
  relation(mio, lina, 'trust', [scenes[5]], { ...emptyValidity(), worldRange: { start: '34', end: null }, routeCondition: condition(route.id, enumeration('救助')) });
  relation(eda, lina, 'mentor_of', [scenes[3], scenes[10]]); relation(ordo, lina, 'mentor_of', [scenes[1]]); relation(events[6], events[10], 'causes', [scenes[6], scenes[10]]); relation(compass, lores[6], 'related', [scenes[8]]); relation(seil, source, 'reference', [scenes[2]]);
  const taskWriting = add('production_task', '全3章の本文・選択結果を推敲', { targetIds: chapters.map(chapter => chapter.id), stage: 'writing', progress: 'doing', estimate: { value: 3, unit: '時間', assumptions: ['作者1名による初回推敲の仮見積り'], scope: { projectId: project.projectId }, unknownCount: 0, source: 'サンプル制作計画' } });
  const taskReview = add('production_task', '両経路の伏線と公開範囲を再確認', { targetIds: [graph.id, ...disclosures.map(item => item.id)], stage: 'review', progress: 'todo', dependsOn: [taskWriting.id], blockingReason: '本文推敲後に二つの経路を読み直す。' });
  const taskTranslation = add('production_task', '英語台詞の意味と口調を確認', { targetIds: lines.map(line => line.id), stage: 'translation', progress: 'todo', dependsOn: [taskReview.id] });
  add('production_task', '台詞を収録し効果音を差し替える', { targetIds: [lines[10].id, cue.id], stage: 'recording', progress: 'todo', dependsOn: [taskTranslation.id] });
  add('production_task', 'ゲームへ条件と効果を実装', { targetIds: [graph.id], stage: 'implementation', progress: 'todo', dependsOn: [taskReview.id] });
  add('production_task', '読者用出力を試読して公開を判断', { targetIds: chapters.map(chapter => chapter.id), stage: 'publication', progress: 'todo', dependsOn: [taskReview.id] });
  const gameplay = add('gameplay_spec', '遺跡の三点測量パズル', { sceneId: scenes[6].id, action: rich('三つの石輪の中心を選び、塔への導線を引く。失敗時はヒントを読み直せる。'), mechanic: '探索・観察。反射速度を要求しない。', tutorial: rich('最初の石輪だけリナが目印を置く。残り二つは澪の測量メモで求める。'), reward: integer(1), questId: quest.id, taskIds: [taskWriting.id], intentionalDifference: '小説では計測過程を本文で読み、ゲームでは点を選ぶ。得られる星核片と情報は同じ。' }); quest.data.gameplaySpecIds = [gameplay.id];
  const contract = add('external_contract', '灰狼戦・ゲーム側の結果', { key: 'ash_wolf_result', owner: 'game', inputType: 'boolean', outputType: 'boolean', missingPolicy: 'unknown', description: rich('戦闘版への改作を試すための任意の外部契約。true=非致死で制圧。false=撤退。未入力は未確認で停止し、本編の非戦闘解法を勝手に変更しない。'), stubValues: [bool(true), bool(false)] });
  const externalStart = add('flow_node', '外部契約の演習・灰狼戦', { nodeType: 'choice', executionPolicy: 'manual_choice' });
  const externalEnd = add('flow_node', '外部契約の演習・完了', { nodeType: 'terminal', terminalReason: '仮値による外部契約の操作練習。本編の実ゲーム検証とは別。' });
  const externalEdge = add('flow_edge', 'ゲームの結果が成功なら進む', { fromId: externalStart.id, toId: externalEnd.id, condition: { op: 'external', contractId: contract.id }, label: '外部結果を確認して進む' });
  add('flow_graph', '補助演習・外部契約と仮値', { nodeIds: [externalStart.id, externalEnd.id], edgeIds: [externalEdge.id], entryIds: [externalStart.id], exitIds: [externalEnd.id] });
  add('collection', '主要人物・固定一覧', { mode: 'fixed', memberIds: characters.map(person => person.id), sort: { field: 'name', direction: 'asc' } });
  add('collection', '伏線の一覧・条件で更新', { mode: 'dynamic', query: { op: 'kind', value: 'foreshadow' }, sort: { field: 'name', direction: 'asc' } });
  const brief = add('creative_brief', '星還りの旅人・企画', { targetAudience: rich('人との協力、謎の回収、安心できる結末を好む中高生以上の読者。'), experience: rich('世界の規則を理解して自分で道を選ぶ。別れの寂しさと帰還の喜びを両方味わう。'), theme: rich('知識は独占せず、異なる技能を持ち寄ることで人を守る。'), tone: rich('静かな驚きと冒険。救助の緊迫感はあるが残虐描写は避ける。'), scope: rich('全3章12場面。帰還の謎・唄・事故原因はこの作品内で回収。続編を読まなければ解決しない謎は残さない。'), deliverableIds: chapters.map(chapter => chapter.id) });
  add('note', 'はじめに：サンプルの読み方と全機能の巡り方', { body: rich('この作品は編集できる独立コピーです。元のサンプルはトップから何度でも作り直せます。\n構成の章・場面で全3章12場面を読む。構成→分岐で「全3章・星還りの旅」を開き、書庫／準備、救助／急行、信頼による交渉の違いを試す。試読では開始点を本編に合わせる。外部契約の演習は別の開始点。\n年表で本編と300年前の事故を比較。関係表・図では人物の信頼と伏線→回収の証拠を見る。世界・地図・履歴で旅路、場所の親子、門の稼働状態の変化を見る。\n資料で人物・目標・口調・設定・物品・事実と認識・伏線を開く。人物票には職業・初登場章・拠点の雛形項目がある。台詞のリンクから翻訳草稿、収録計画、演出、絵コンテ、出所と実素材へたどる。\n検索で用語・別名・読み・分類を調べ、固定一覧と動的一覧をカード／表／図／年表へ切り替える。本文にはルビと資料へのリンクを付けた箇所がある。\n制作では企画、判断、依存するタスク、ゲーム仕様、媒体版を確認。相談・別案には架空のAI提案があり、本文へ自動採用されないことを確認できる。\n作品・保存で完全保存→別作品として復元を試す。素材bytesを含める。目的別出力では「読者用・全3章本文」で本文を持ち出す。汎用ランタイムJSON・単体の試遊出力は「試遊用・全3章と外部契約の演習」、翻訳・制作の出力は「制作・翻訳用・全3章」を選ぶ。出力内容と公開名を確認してから保存する。変更履歴は実際に編集した時点から増える。\n試読記録はサンプル作成時に実際の内部ランタイムで生成した経路だけを保存する。任意の外部ゲーム演習・同期・共有・認証・実収録の完了を表すものではない。同期と共有は自分の接続先を設定して試す。'), attachmentIds: attachments.map(item => item.id) });
  add('note', 'はじめに：応用操作を試す演習', { body: rich('共通世界の参照：トップからサンプルをもう一つ作り、作品名を「星還り・応用練習」へ変更する。年表→世界・地図・履歴→共通世界の固定版で、元の「星還りの旅人」を選択。固定する版は「全3章・初期設定と本文」、採用設定は「星路と魔力保存則」などを選び、「適用前の差分・影響を確認」→「確認した固定版・採用設定を保存」。現在稿でなく固定した版を参照する。別コピーの同名情報は別IDなので、原作の設定と混同せずIDと出所も確認する。\n反応系列：構成→分岐の「短い反応の系列を作る」で、01と04など二場面を選び、系列名を「リナの初回と再訪」、提示方式を初回・再訪にして差分を確認・保存する。新しい分岐図の開始点から試読し、再訪時の表示と巻戻しを比べる。本編の既存の分岐図を上書きしない。\n階層と再利用：練習コピーで資料の進行ノードの種類を呼出しにし、子の分岐図、復帰先の接続、引数を設定して章・場面・会話の階層図で参照先を確認する。固定版の場面は再利用の参照・複製・上書きで違いを比較する。循環や戻り先の未完成は試読前に診断を確認する。\n台詞の分割・統合、素材の差替え：制作の元台詞と英訳草稿・収録計画を開く。元台詞を編集して保存すると原文hashと再確認状態が変わる。元の演出と素材を確認してから翻訳の原台詞を対応し直す。収録はplannedのままで、実録音が済んだことにはしない。\n保存と履歴：メモを一行編集して保存し、作品・保存→変更履歴で変更前後を読む。復元差分を確認して戻す。完全保存をダウンロードし、トップから新しいIDの複製として復元する。同期・共有・外部受渡しは各自の接続先を設定して行い、この練習コピーに実際の秘密や認証情報を登録しない。') });
  // Use a real named occurrence rather than relying on offsets in the narrative.
  const linkBlock = scenes[0].data.body[0], linkStart = linkBlock.text.indexOf('コンパス');
  if (linkStart >= 0) linkBlock.links = [{ start: linkStart, end: linkStart + 4, target: { entityId: compass.id } }];
  // A separate text block makes the ruby range unambiguous and editable.
  scenes[0].data.body[0].ruby = [{ start: scenes[0].data.body[0].text.indexOf('澪'), end: scenes[0].data.body[0].text.indexOf('澪') + 1, text: 'みお' }];
  project = await createWorldSnapshot(project, '全3章・初期設定と本文');
  const fixed = project.snapshots.at(-1)!;
  const review = add('review', '第3章・証拠と推測の境界を読む', { target: { entityId: scenes[9].id, blockId: scenes[9].data.body[1].id }, targetVersionId: fixed.id, body: rich('セイルの訂正が、測量と記録のどの証拠によるものか読者に伝わるか確認する。これはサンプルの未解決レビューで、第三者の承認記録ではない。'), stage: 'open', quotedText: scenes[9].data.body[1].text });
  const decision = add('decision', '生贄でなく共同作業で解く', { subject: '帰還と街の防護を両立する結末', reason: rich('異邦人を犠牲にして均衡を保つ結末は採用しない。三章で提示した計測・記録・唄を組み合わせて解決する。'), targetVersionId: fixed.id, outcome: 'accepted', priority: '作品の主題', reviewIds: [review.id] });
  const currentBrief = project.entities.find(entity => entity.id === brief.id) as Entity<'creative_brief'>; currentBrief.data.decisionIds = [decision.id];
  const publicEntities = project.entities.filter(entity => ['character', 'chapter', 'scene', 'dialogue_line', 'place', 'lore', 'terminology'].includes(entity.kind));
  const publicTexts = Object.fromEntries(publicEntities.map(entity => {
    const data = entity.data as { body?: RichText; text?: RichText; summary?: RichText; reading?: string };
    const fields: PublicTextFields = {
      ...(data.body ? { body: structuredClone(data.body) } : {}),
      ...(data.text ? { text: structuredClone(data.text) } : {}),
      ...(data.summary ? { summary: structuredClone(data.summary) } : {}),
      ...(data.reading ? { reading: data.reading } : {}),
    };
    if (entity.kind === 'terminology') Object.assign(fields, {
      canonical: entity.data.canonical, language: entity.data.language ?? 'ja',
      variants: JSON.stringify(entity.data.variants ?? []), usageNotes: structuredClone(entity.data.usageNotes ?? []),
    });
    return [entity.id, fields];
  }));
  const profile = add('projection_profile', '読者用・全3章本文', {
    audience: '三章の本文を読む読者', publicTitle: '星還りの旅人',
    includedIds: publicEntities.map(entity => entity.id), allowedKinds: [...new Set(publicEntities.map(entity => entity.kind))],
    namePolicy: { defaultPolicy: { mode: 'exclude' }, byEntityId: Object.fromEntries(publicEntities.map(entity => [entity.id, { mode: 'replace' as const, replacement: entity.name }])) },
    publicTexts, includeAuthorNotes: false, excludedFields: ['authorNotes'], idPolicy: 'remap',
  });
  add('media_variant', '小説版・全3章の読者用構成', { medium: 'novel', baseSnapshotId: fixed.id, projectionProfileId: profile.id, sourceIds: chapters.map(chapter => chapter.id), body: rich('章順で12場面を読む小説版。分岐は救助経路を主とし、急行経路の判断は作者の比較資料として保持。公開前に本文と投影を確認する。'), needsReview: true });
  add('media_variant', 'ゲーム版・二つの旅程', { medium: 'game', baseSnapshotId: fixed.id, sourceIds: [graph.id, gameplay.id], body: rich('書庫と救助の選択をプレイヤーへ委ねる。外部戦闘演習は追加仕様で、本編は測量による非戦闘解決。実ゲームへの組込みは未実施。'), needsReview: true });
  for (const [label, preferred] of [['救助経路・全12場面', ['書庫で', '浅瀬で', '住民の']], ['急行経路・情報を共有して帰還', ['荷を整え', 'ミナに', '監督官の']]] as const) {
    let session = startTrial(project, { entryId: nodes[0].id });
    for (let step = 0; session.status === 'ready' && step < 30; step++) {
      const choices = getTrialChoices(project, session).filter(choice => choice.result === 'true');
      const next = choices.find(choice => preferred.some(prefix => choice.label.startsWith(prefix))) ?? choices[0];
      session = stepTrial(project, session, next ? { edgeId: next.edgeId } : {});
    }
    if (session.status !== 'terminal' || session.issues.length) throw new Error(`サンプル試読を完了できません: ${label}: ${JSON.stringify(session.issues)}`);
    const checkpointId = newId(), snapshotId = newId(), pinned = pinTrialRecord(session, { checkpointId, snapshotId });
    project.snapshots.push({ id: snapshotId, versionLabel: `内部試読固定版・${label}`, contentHash: await sha256(jsonBytes(pinned.content)), content: pinned.content, createdAt: new Date().toISOString() });
    const checkpoint = add('checkpoint', `開始状態・${label}`, pinned.checkpoint); checkpoint.id = checkpointId;
    add('trace', `作成時の内部試読・${label}`, pinned.trace);
  }
  add('collection', '本編の回帰経路・救助と急行', { mode: 'fixed', purpose: 'regression', memberIds: project.entities.filter(entity => entity.kind === 'trace').map(entity => entity.id) });
  const proposal = await previewConsultationImport(project, { versionId: fixed.id, source: '操作説明のために作成した架空のAI相談例（外部サービスへの送信なし）', targetId: scenes[11].id, text: '門の向こうに、雨上がりの道路が見えた。澪は手帳に結んだ赤い編み紐を確かめる。\n「ただいま」。その一言のあとで、妹に聞いてほしい名前がいくつも浮かんだ。\n【未採用の比較用提案】終幕の余韻を短くする案。エダの言葉と知識の引継ぎが消えるため、採用前に主題への影響を確認する。' });
  project = await confirmConsultationImport(project, proposal);
  project = addAdventureRuntimeProfile(project);
  const validation = validateProject(project);
  if (!validation.ok) throw new Error(`サンプルの参照整合性を確認できません: ${JSON.stringify(validation.issues)}`);
  return { project, assets };
}
