import { createEntity, textToRichText } from './model';
import { dialogueContentHash } from './production';
import type { Entity, EntityDataMap, EntityKind, ProjectData, ProductionStage } from './types';

const rich = textToRichText;

/** Authored production examples for this fictional sample, before its first fixed edition. */
export async function enrichAdventureProduction(project: ProjectData): Promise<void> {
  const add = <K extends EntityKind>(kind: K, name: string, data: Partial<EntityDataMap[K]>): Entity<K> => {
    const entity = createEntity(project.projectId, kind, name, data);
    entity.status = 'confirmed';
    project.entities.push(entity);
    return entity;
  };
  const find = <K extends EntityKind>(kind: K, name: string): Entity<K> => {
    const entity = project.entities.find(candidate => candidate.kind === kind && candidate.name === name);
    if (!entity) throw new Error(`制作サンプルの参照がありません: ${kind}/${name}`);
    return entity as Entity<K>;
  };
  const scene = (title: string): Entity<'scene'> => {
    const entity = project.entities.find(candidate => candidate.kind === 'scene' && candidate.name.endsWith(`　${title}`));
    if (!entity) throw new Error(`制作サンプルの場面がありません: ${title}`);
    return entity as Entity<'scene'>;
  };
  const lineOf = (target: Entity<'scene'>): Entity<'dialogue_line'> => {
    const entity = project.entities.find(candidate => candidate.kind === 'dialogue_line' && candidate.id === target.data.dialogueLineIds?.[0]);
    if (!entity) throw new Error(`制作サンプルの台詞がありません: ${target.name}`);
    return entity as Entity<'dialogue_line'>;
  };
  const chapters = project.entities.filter((entity): entity is Entity<'chapter'> => entity.kind === 'chapter');
  const originalTitles = [
    '知らない星の朝', '灰羽の契約', '白鐘書庫の反転頁', '三音を携えて',
    '銀枝橋の避難者', '救助縄の向こう側', '眠り森の三つの中心', '封鎖令の持ち主',
    '名を問う塔', '逆さの星が示すもの', '三音で灯を分ける', '帰る道、続く道',
  ];
  const scenes = originalTitles.map(scene);

  const directionSpecs = [
    ['近景から二つの月へ', '息を止めた観察から、小さな安堵へ。リナの声だけは画面外から先に届かせる。', '草の露、破れた袖、真鍮コンパスの順に寄る。針が石柱へ向いたところで固定し、空の二つの月へ切り返す。澪の混乱を大声で説明せず、測る手つきで示す。', 700, 9000],
    ['報酬より先に退路', 'オルドの指示は厳しく、相手の返事を待つ。契約を脅迫のように響かせない。', '机上の避難図を正面から見せ、その奥に前金の袋を置く。澪が手を止める動作を切らずに残す。義足は英雄的な強調でなく、椅子へ腰を下ろす日常動作で示す。', 600, 10000],
    ['反転する三本線', 'セイルの推測には間を置き、分からない箇所を早口で埋めない。', '鐘の振動で揺れる紙端から始める。コンパスと星図を同一画面に収め、澪が裏返す操作を連続して見せる。火傷を隠す袖は最後の一拍だけ残す。', 850, 11000],
    ['手紙の余白に三つの音', 'リナは歌い慣れた調子で始め、コンパスが震えた瞬間だけ声を止める。', '手紙の三つの音符と編み紐を左右に配置。音符、指、針の振動を順に映す。歌詞字幕は音名とは別の行に出し、操作手順と断定する演出はまだ避ける。', 1200, 12000],
    ['水位と灰を分けて見せる', 'ミナは患者へ話しかける声量。危険説明を叫び、恐怖を強める演技にはしない。', '川の水位が一定である目印を最初に写す。橋脚を登る灰だけを別の動きで描き、青い基点の周囲に灰が届かないことを示す。視点は避難者の高さに保つ。', 500, 10000],
    ['結び直す赤い紐', 'リナの「今日」は強調せず、背負った重みから解放される呼吸を先に置く。', '最後の住民が足場へ乗るまでは広い画角を維持。ミナの確認後、ほどけた編み紐に寄る。澪の手が入っても抱擁へ置き換えず、一緒に結ぶ具体的な行動で終える。', 1400, 12000],
    ['錯覚から計測へ', '澪の台詞は発見を誇る調子でなく、作業を仲間に共有する短い提案。', '揺れる菌光による距離の錯覚を短く示し、目盛り縄を置いた後は画角を固定。灰狼は弓を向けられる怪物として見せず、光から逃げる姿勢を残す。', 600, 11000],
    ['命令書を下げる手', 'ヴァルドは敬語を崩さず、結論の変更を弱々しさとして演じない。', '封鎖命令書、測量メモ、反転図の三枚を机の代わりの平石へ並べる。最後は人物の対立構図を解き、同じ地図を囲む画角にする。', 900, 10000],
    ['目的を二枚の札に', 'ノアは二つの選択肢を同じ抑揚で尋ね、回答後に初めて短い間を置く。', '人形の目より先に、帰還と保護の二枚の札を見せる。コンパスの工房印とセイルの家印を別カットにせず並べ、比較の根拠を読者が追えるようにする。', 1000, 10000],
    ['高窓の足元と測線', 'セイルの訂正と澪の高所への恐れを別の拍にする。訂正後すぐに勝利の音楽へ移らない。', '投影図の東西が反転する実物操作を見せた後、澪の足元へ切る。リナの手は澪を引っ張らず、本人が握るのを待つ。測線が揃ったところで初めて俯瞰へ移る。', 800, 13000],
    ['一度に開かない三導線', '歌は派手な呪文ではなく、作業をそろえる一定の拍。三つの動詞の間を確保する。', '低圧側、街の防護、帰還先の順に三本を点灯させる。同時点灯を避け、星核片の光が弱まる様子で消費を示す。灰が引く確認を操作の完了より後に置く。', 1800, 15000],
    ['手帳に残った名前', '澪の「ただいま」は普段の声。泣き声を先行させず、妹の返事を待てる終わり方にする。', '測量記録の写しを渡す手、半分の編み紐、帰還先の濡れた道路をつなぐ。最後まで手帳は画面内に残し、異世界での時間が消えた印象を避ける。', 1600, 14000],
  ] as const;
  const cues: Entity<'cue'>[] = [], frames: Entity<'storyboard_frame'>[] = [];
  directionSpecs.forEach(([name, expression, caption, waitMs, duration], index) => {
    const target = scenes[index];
    const line = lineOf(target);
    const cue = add('cue', `演出設計・${name}`, {
      anchor: { entityId: target.id, blockId: target.data.body[0].id },
      cueType: 'camera', speakerId: line.data.speakerId, expression, waitMs,
      camera: caption, mediaTime: 0, stage: '設計・映像と音声は未制作',
    });
    line.data.cueIds = [...(line.data.cueIds ?? []), cue.id];
    const frame = add('storyboard_frame', `文字絵コンテ・${name}`, {
      anchor: { entityId: target.id, blockId: target.data.body[0].id },
      mediaStartMs: 0, mediaEndMs: duration, cueIds: [cue.id], caption: rich(caption),
    });
    cues.push(cue); frames.push(frame);
  });

  const translationSpecs = [
    [1, 'Decide how you will get back. Do not put becoming a hero in the contract.', '最初の命令のあとに一拍。「英雄」は嘲笑せず、危険を背負いすぎる若者への忠告として読む。'],
    [2, 'This page is a copy. We do not know what was left out.', 'copy と left out を聞き分けられる速度にする。セイルが未確認の範囲を明示する台詞なので、we do not know を弱くしすぎない。'],
    [4, 'The medicine only buys us time.', '薬が治療薬ではないことが伝わるよう only の位置を確認。患者のそばで静かに読む短い警告。'],
    [5, 'Today, we managed to bring someone back.', '弟が戻ったと誤解させないため someone を明瞭に。安堵と喪失が同居し、祝勝の掛け声にはしない。'],
    [6, 'If our eyes cannot tell us, let us measure it.', '専門用語を増やさず、仲間と一緒に試す提案として読む。measure のあとで結論が決まったように笑わない。'],
    [7, 'If the grounds for that order are wrong, we may need to stop a different operation.', '長文は wrong のあとで息を継ぐ。命令そのものへの反抗ではなく、根拠を再検討する監督官の職責を保つ。'],
    [8, 'Please confirm your purpose. Return, or closure?', 'Return と closure の間を同じ長さにする。ノアの問いは正解を誘導しない。後の二目的の回答と組で確認。'],
    [9, 'I will put my own name to this correction.', 'own name に責任を込める。史料への署名であり、名声の獲得を喜ぶ調子にしない。'],
  ] as const;
  const translations = project.entities.filter((entity): entity is Entity<'localization'> => entity.kind === 'localization');
  const recordings = project.entities.filter((entity): entity is Entity<'recording'> => entity.kind === 'recording');
  const existingDeliveryNotes = [
    [0, 'First, let us get home alive. We can talk about where home is after that.', 'リナが知らない旅人へ水を差し出す場面。alive を勇ましく叫ばず、まず安全を確保する落ち着いた呼び掛けにする。後半は澪へ答えを急がせない間を置く。'],
    [3, 'Measure the path, share the light, and call its name.', '祖母から教わった唄の一節。Measure / share / call の三動詞を同じ拍に置く。ここでは操作を理解した説明口調でなく、歌い慣れた記憶として読む。'],
    [10, 'Protecting people never meant locking them away.', '灰が引くのを見届けたリナの気付き。監督官を責める台詞にせず、自分の「守る」という言葉も変わったことを表す。'],
    [11, 'I am home.', '帰還先で妹へ伝える日常の挨拶。長い旅の総括を足さず、息を整えて自然に話す。返事を受け止める余白を残す。'],
  ] as const;
  for (const [index, english, notes] of existingDeliveryNotes) {
    const line = lineOf(scenes[index]);
    const translation = translations.find(entity => entity.data.sourceLineId === line.id);
    const recording = recordings.find(entity => entity.data.sourceLineId === line.id);
    if (!translation || !recording) throw new Error(`既存の制作資料がありません: ${line.name}`);
    translation.data.text = rich(english);
    recording.data.notes = rich(`未収録。${notes}\n本文と訳文の対照、口調、呼吸位置を確認してから録音する。音声素材はまだ添付していない。`);
  }
  const translate = async (line: Entity<'dialogue_line'>, english: string, notes: string) => {
    const sourceHash = await dialogueContentHash(project, line);
    const translation = add('localization', `英訳草稿・${line.name}`, {
      sourceLineId: line.id, language: 'en', sourceHash, text: rich(english), stage: 'draft',
    });
    const recording = add('recording', `収録設計・${line.name}`, {
      sourceLineId: line.id, translationId: translation.id, language: 'en', sourceHash,
      notes: rich(`未収録。${notes}\n訳文と人物の口調を確認してから録音する。ここには音声ファイルを添付していない。仮の三音効果音は台詞音声と分ける。`), stage: 'planned',
    });
    translation.data.recordingIds = [recording.id];
    translations.push(translation); recordings.push(recording);
  };
  for (const [index, english, notes] of translationSpecs) await translate(lineOf(scenes[index]), english, notes);

  const newSceneTranslations = [
    ['北門で名を書く', '名前が読めなくても、人を消しはしません。呼ばれて分かる音を教えてください。', 'We will not cross anyone off just because we cannot read their name. Tell us what name you would recognize when called.', 'トマが異邦人の名前を受付簿へ残す場面。読めない文字を責めず、本人が認識できる呼び名を確認する声。cross anyone off は人を記録から除外しないという意味で使う。'],
    ['市場の二つの尺度', '同じ値にならなくてもいい。どの向きで測ったかを残して。', 'The readings do not have to match. Record the orientation used for each measurement.', 'タマラが観測条件を揃えるために促す台詞。違う数値を許容することと、誤差を放置することは別。measurement の語尾まで急がずに読む。'],
    ['診療所の二時間', '二時間効くと言っても、二時間見なくていい薬ではありません。', 'Just because it lasts for two hours does not mean we can leave the patient unchecked for that long.', 'イサクが薬効時間と患者の見守りを区別する注意。叱責ではなく、ミナと調査隊へ継続観察の必要を伝える。two hours のあとで一拍置く。'],
    ['森番の消えない線', '狼が見えなくなった。それだけなら、よそへ追いやっただけかもしれん。', 'The wolf has disappeared. That alone may only mean we drove it somewhere else.', 'アーヴィンの留保を may に残す。救助した一行を否定する口調ではなく、森に残る者として観察を続ける理由を落ち着いて述べる。'],
    ['二つの目的を分ける', '目的と解除条件を確認します。守るために、移動を永久に止めますか。', 'Please confirm the purpose and the conditions for lifting the restriction. Should I stop movement permanently in order to protect people?', 'ノアが命令の目的と解除条件を確かめる問い。permanently の重さを明瞭にし、正解を先に知って相手を試す演技にはしない。'],
    ['名で署名する台帳', '命令は取り消します。命令があった記録まで、消すことはしません。', 'We will revoke the order. We will not erase the record that it was given.', 'ニアが訂正を台帳へ残す手順を読み上げる。revoking the order と erasing the record を対比し、叔父をかばって過去を隠す調子にしない。'],
  ] as const;
  for (const [title, japanese, english, notes] of newSceneTranslations) {
    const line = lineOf(scene(title));
    if (line.data.text.map(block => block.text).join('\n') !== japanese) throw new Error(`英訳草稿と原台詞の対応を確認してください: ${title}`);
    await translate(line, english, notes);
  }

  // All four earlier draft records belong to this same, not-yet-fixed authored edition.
  // Their source hashes include the newly attached direction cues.
  for (const entity of project.entities) {
    if (entity.kind !== 'localization' && entity.kind !== 'recording') continue;
    const line = project.entities.find(candidate => candidate.kind === 'dialogue_line' && candidate.id === entity.data.sourceLineId) as Entity<'dialogue_line'> | undefined;
    if (!line) throw new Error(`制作資料の原台詞がありません: ${entity.name}`);
    entity.data.sourceHash = await dialogueContentHash(project, line);
  }

  const terminologySpecs = [
    ['灯都ルーメン', 'とうとるーめん', ['灯都', 'ルーメン'], 'Lumen, the City of Lamps', '街の正式名。地の文で初出時は「灯都ルーメン」、会話では「ルーメン」を許す。人口約八千という規模を都城全体の人口と取り違えない。'],
    ['白鐘書庫', 'はくしょうしょこ', ['白鐘の書庫'], 'Whitebell Archive', '公開資料と保守日誌を保管する施設。library より記録保全の役割が伝わる Archive を採る。王立施設という設定は追加しない。'],
    ['銀枝川', 'ぎんしかわ', ['銀枝の川'], 'Silverbranch River', '灰の流れと水位は別の現象。英訳でも flood だけで両方をまとめず、water と ash を区別する。'],
    ['眠り森', 'ねむりもり', ['眠りの森'], 'Slumberwood', '森の名称。眠気を強制する魔法があるという意味には広げない。距離を誤認させる原因は水晶菌の光。'],
    ['星見塔', 'ほしみとう', ['星見の塔'], 'Starwatch Tower', '測量と星路の保守施設。占星術師の予言塔や王宮と誤訳しない。ノアは塔を管理する保守人形。'],
    ['星還りの門', 'ほしかえりのもん', ['帰還門'], 'Starhome Gate', '街の防護と異世界への帰還を切り替える地下装置。門そのものを人が瞬時に好きな場所へ行ける能力として扱わない。'],
    ['灰の洪水', 'はいのこうずい', ['灰流', '灰の逆流'], 'ash surge', '余剰魔力が低地へ流れる現象。水の洪水ではないため ash flood は比較表現に限り、操作説明は ash surge に統一する。'],
    ['順次接続', 'じゅんじせつぞく', ['段階接続'], 'sequential connection', '低圧側の確認、街への分配、接続先の指定を順に行う。単なる時間差の一斉開門という説明にしない。'],
    ['一斉閉鎖', 'いっせいへいさ', ['同時閉鎖'], 'simultaneous shutdown', '三百年前の事故を起こした操作。順次接続と対比する重要語。通常の避難のための通行止めまで同じ原因としない。'],
    ['黎明暦', 'れいめいれき', ['エルセリア暦'], 'Dawn Calendar', '六か月各三十日、一日二十四刻。日本側の年齢や制作タスクの現実の日付を、この暦で換算した年数として読まない。'],
    ['星路局', 'せいろきょく', ['王都星路局'], 'Starway Bureau', '遺跡管理の行政組織。ヴァルド個人と組織全体を同一視しない。封鎖解除の現地裁量にも根拠と記録が必要。'],
    ['保守人形', 'ほしゅにんぎょう', ['保守機'], 'maintenance automaton', 'ノアの機能を表す呼称。外見年齢から人間の子どもと決めつけない一方、人格を無視した道具呼ばわりを地の文の定義にしない。'],
  ] as const;
  const terms = terminologySpecs.map(([canonical, reading, variants, english, usage]) => add('terminology', canonical, {
    canonical, reading, variants: [...variants], language: 'ja',
    usageNotes: rich(`推奨英訳：${english}。\n${usage}`),
  }));

  const mainTask = find('production_task', '全3章の本文・選択結果を推敲');
  mainTask.data.estimate = {
    range: { min: 12, max: 18 }, unit: '時間', assumptions: ['全36場面を作者1名が読み、場面間の因果と移動時間も確認する仮見積り', '外部校閲・実録音・ゲーム実装の時間は別タスク'],
    scope: { projectId: project.projectId }, unknownCount: 0, source: '拡充サンプルの制作計画',
  };
  const task = (name: string, stage: ProductionStage, targets: Entity[], dependencies: Entity<'production_task'>[], hours: number, assumption: string) => add('production_task', name, {
    targetIds: targets.map(entity => entity.id), stage, progress: 'todo', dependsOn: dependencies.map(entity => entity.id),
    estimate: { value: hours, unit: '時間', assumptions: [assumption, '操作説明用の仮見積り。実作業の完了記録ではない。'], scope: { projectId: project.projectId }, unknownCount: 0, source: '星還りの旅人・制作工程表' },
  });
  const chapterReviews = chapters.map((chapter, index) => task(
    ['第1章・生活と調査準備の因果を校閲', '第2章・救助分担と星核片の移動を校閲', '第3章・記録訂正と帰還条件を校閲'][index], 'review', [chapter], [mainTask], [3, 4, 4][index],
    ['異世界の日常と物価が契約・装備・旅支度の選択へ効いているかを章順で読む。', '救助経路と急行経路の担当者、薬効時間、遺跡への移動、星核片の受渡しを追う。', '各伏線の回収より前に必要な情報が提示され、街の安全確認後に帰還するかを読む。'][index],
  ));
  const events = project.entities.filter((entity): entity is Entity<'event'> => entity.kind === 'event');
  const routeEntities = project.entities.filter((entity): entity is Entity<'travel_route'> => entity.kind === 'travel_route');
  const historyTask = task('年表・十日間と同時進行の照合', 'verification', events, chapterReviews, 5, '過去の災厄と今回の灰流を区別し、別の場所で動く人物の到着時刻・連絡経路も確認する。');
  const travelTask = task('地図・親子場所と所要時間の照合', 'verification', routeEntities, [historyTask], 3, '町内の施設と地域間の移動を分け、地図の正規化座標を距離の実測値として扱わない。');
  const items = project.entities.filter((entity): entity is Entity<'item'> => entity.kind === 'item');
  const itemTask = task('物品・個体の所有と消費の棚卸し', 'verification', items, [chapterReviews[1], chapterReviews[2]], 4, '種類と個体を分け、受領・預託・返却・消費を場面の記述と状態履歴で照合する。');
  const voiceRules = project.entities.filter((entity): entity is Entity<'voice_rule'> => entity.kind === 'voice_rule');
  const voiceTask = task('全人物の一人称と話し分けを確認', 'review', voiceRules, chapterReviews, 3, '澪の根拠提示、リナの率直さ、セイルの留保、ノアの目的確認を一律の口調へ均さない。');
  const terminologyTask = task('星路・灰流・暦の英語表記を確定', 'translation', terms, [historyTask, voiceTask], 2, '固有名と操作語の訳語表を台詞と照合し、設定を追加する意訳がないかを確認する。');
  const translationTask = task('英訳草稿を日本語本文と対照', 'translation', translations, [terminologyTask], 4, '台詞単独でなく、同じ場面の相手の反応と情報の公開順も読む。草稿の段階を承認済みに変更する前に差分を確認する。');
  const directionTask = task('文字絵コンテを三章の視点へ統一', 'review', frames, [voiceTask, itemTask], 3, '反転図・灰と水位・三導線の順序が画像なしでも作業指示として理解できるかを確認する。');
  const recordingTask = task('全台詞の収録台本と呼吸位置を準備', 'recording', recordings, [translationTask, directionTask], 3, '計画レコードのみを作る工程。録音、音声整音、声優の承認は別作業として残す。');
  const cueTask = task('三音と環境音の仮演出を確認', 'implementation', cues, [directionTask], 2, '三音は順次操作の合図として配置。音が聞こえない場合にも光と文字で操作順が分かる設計を確認する。');
  const graph = find('flow_graph', '全3章・星還りの旅');
  const rescueTask = task('救助経路を先頭から帰還まで試読', 'verification', [graph], [chapterReviews[2], itemTask, travelTask], 2, '書庫・浅瀬救助・住民の証言を選び、信頼の増加と修復後の帰還を確認する。保存された内部試読は参照資料であり、この制作タスクの完了印にはしない。');
  const fastTask = task('急行経路の共有情報と委任先を試読', 'verification', [graph], [rescueTask], 2, '書庫と直接救助を省いたときも、写しと委任された避難対応が成立し、必要な伏線情報が失われないかを確認する。');
  const accessTask = task('字幕・色以外の手掛かり・待ち時間を確認', 'verification', [...cues, ...terms], [cueTask, fastTask], 2, '灰の危険と三音の操作を色と音だけで区別させない。字幕の読み時間と手動進行の設計を確認する。');
  task('翻訳・収録の原文変更追従を確認', 'verification', [...translations, ...recordings], [translationTask, recordingTask], 2, '練習用コピーで原台詞を変更し、原文ハッシュの差と再確認状態を確認する。本編を変更して検証済みのように扱わない。');
  task('読者版とゲーム版の内容差を確認', 'publication', chapters, [accessTask, fastTask], 3, '小説は章順、試遊は分岐順という差を確認する。制作メモや未採用AI案を含めず、公開範囲を最後に見直す。');
  task('音声・画像の実素材を別途制作して受領', 'recording', [...recordings, ...frames], [recordingTask, directionTask], 8, '現在は文字絵コンテと収録計画。完成画像や台詞音声は存在せず、出所・許諾・内容を確認してから添付する。');

  const quest = find('quest', '星還りの道を開く');
  const gameplaySpecs = [
    [scenes[1], '契約書の危険と退路を選ぶ', '報酬、撤退条件、連絡先の三欄を読む。依頼を受ける前に空欄を指摘し、オルドへ確認する。', '資料を読む探索操作。読了速度に報酬差を付けない。', '最初に避難図の位置を示す。金額だけを選んだ場合は撤退条件が未確認と表示し、読み直せる。', '小説では対話で確認する内容を、ゲームでは契約欄を選ぶ操作へ置き換える。交渉成功を運にしない。'],
    [scenes[4], '灰と水位から避難の担当を決める', '水位標、灰の前縁、安全な青い基点を観察して、直接救助かミナへの委任を選ぶ。委任時は薬と避難図を渡す相手を確認する。', '観察して役割を割り振る選択。どちらも責任を持って完了できる。', '川の増水と灰流を別の表示にする。選択前に担当者と退路を常に確認できる。', '本文と同じ二経路。急行を失敗ルートにせず、信頼の獲得方法と救助の担い手が違うことを表す。'],
    [scenes[9], '反転図と観測値を照合する', '塔の投影を反転し、三つの基点を測量メモへ重ねる。事実、推測、後世の追記を別の欄に分類してから訂正を提出する。', '図と記録の照合。高所の場面にも制限時間や反射入力を課さない。', '一つ目の基点はセイルと確認し、残りは記録の出所を開いて選ぶ。誤分類は理由を読んで戻せる。', '小説では実測の一致を読む。ゲームでも反転だけで全て解決した扱いにせず、命令ログとの照合を要求する。'],
    [scenes[10], '三導線を順番に接続する', '低圧側の確認、街への分配、帰還先の名前の指定を順に選ぶ。星核片の残量と街の安全報告を確認してから門へ進む。', '手順を理解して進めるパズル。早押しや音程当てにはしない。', '子守唄の歌詞、動詞、導線の番号を対応させる。音を消しても文字と点灯順で分かる。', '内部試読は定義済みの条件と効果を実行する。ここに書いたインタラクティブな図操作は改作時の実装仕様で、実装済みゲームの証拠ではない。'],
  ] as const;
  const newGameplay = gameplaySpecs.map(([target, name, action, mechanic, tutorial, difference]) => add('gameplay_spec', name, {
    sceneId: target.id, action: rich(action), mechanic, tutorial: rich(tutorial), questId: quest.id,
    taskIds: [find('production_task', 'ゲームへ条件と効果を実装').id, accessTask.id], intentionalDifference: difference,
  }));
  quest.data.gameplaySpecIds = [...(quest.data.gameplaySpecIds ?? []), ...newGameplay.map(entity => entity.id)];
  add('collection', '制作練習・台詞から英訳と収録へ', { mode: 'fixed', memberIds: [...translations, ...recordings, ...cues, ...frames].map(entity => entity.id), sort: { field: 'kind', direction: 'asc' } });
  add('note', '制作資料の読み方：実装・収録に渡すまで', { body: rich('各章の本文、台詞、演出、文字絵コンテは同じ場面を参照します。例えば第2章の橋では、水位は変わらず灰だけが上ることを、本文・画面構成・英訳の ash surge で揃えています。\n英訳はすべて草稿、収録はすべて計画です。台詞の原文ハッシュは話者と演出も含むため、声の調子や待ち時間を編集したときも翻訳・収録を再確認します。現在添付している三音は仮効果音で、人の台詞を録音した素材ではありません。\n制作タスクは本文推敲→章別校閲→年表と移動・物品照合→用語と訳文→演出と収録準備→経路確認→公開確認の依存関係を持ちます。見積りはこの架空作品を題材にした計画値で、作業実績や第三者の承認を意味しません。\nゲーム仕様は本文のどの行為をどんな操作へ変えるかを示します。条件と効果を持つ内部試読と、別途実装が必要な図操作・録音・画像制作を分けて確認してください。文字絵コンテに完成画像は添付されていません。') });
}
