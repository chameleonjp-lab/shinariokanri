import { ENTITY_KINDS, KIND_LABELS } from '../domain/model';

export interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'rich' | 'ref' | 'refs' | 'enum' | 'time' | 'participants' | 'condition' | 'typed' | 'json' | 'number' | 'boolean' | 'date';
  kinds?: string[];
  options?: [string, string][];
  hint?: string;
  required?: boolean;
  min?: number;
  max?: number;
}
const text = (key: string, label: string, hint?: string): FieldSpec => ({ key, label, type: 'text', hint });
const rich = (key: string, label: string): FieldSpec => ({ key, label, type: 'rich' });
const ref = (key: string, label: string, ...kinds: string[]): FieldSpec => ({ key, label, type: 'ref', kinds });
const refs = (key: string, label: string, ...kinds: string[]): FieldSpec => ({ key, label, type: 'refs', kinds });
const select = (key: string, label: string, options: [string, string][]): FieldSpec => ({ key, label, type: 'enum', options });
const json = (key: string, label: string, hint?: string): FieldSpec => ({ key, label, type: 'json', hint });
const time = (key: string, label: string): FieldSpec => ({ key, label, type: 'time' });
const num = (key: string, label: string, min?: number, max?: number): FieldSpec => ({ key, label, type: 'number', min, max });
const body = [rich('summary', '要約'), rich('body', '本文'), rich('authorNotes', '作者メモ')];

export const FIELD_SPECS: Record<string, FieldSpec[]> = {
  character: [text('reading', '読み'), ...body, time('birth', '生年月日'), time('death', '没年月日'), json('aliases', '別名と公開範囲'), refs('goals', '目標', 'goal'), refs('voiceRules', '口調ルール', 'voice_rule')],
  group: [select('groupType', 'グループの種類', [['display', '表示グループ'], ['faction', '世界内組織'], ['plot_thread', '筋'], ['category', '分類']]), refs('members', '所属する人物', 'character'), ref('parentId', '親グループ', 'group'), rich('summary', '要約')],
  event: [rich('summary', '要約'), time('time', '世界内日時'), select('laneRole', '年表レーン', [['common', '共通レーン'], ['participants', '参加人物のレーン'], ['both', '両方に表示']]), { key: 'participants', label: '参加者と役割', type: 'participants' }, ref('locationId', '場所', 'place'), refs('itemIds', '物品', 'item'), rich('authorNotes', '作者メモ'), json('constraints', '日時制約')],
  place: [text('reading', '読み'), ref('parentId', '上位の場所', 'place'), rich('body', '場所の説明'), refs('mapIds', '地図', 'map'), json('aliases', '別名')],
  item: [select('itemMode', '物品の扱い', [['type', '種類'], ['instance', '個体']]), ref('typeId', 'この個体の種類', 'item'), rich('body', '説明'), json('properties', '性質')],
  note: [rich('body', 'メモ'), refs('attachmentIds', '添付', 'attachment'), refs('convertedToIds', '変換先'), ref('originNoteId', '元のメモ', 'note')],
  chapter: [rich('summary', '章の要約'), refs('sceneIds', '場面の順序', 'scene'), text('structureRole', '構成上の役割'), rich('authorNotes', '作者メモ')],
  scene: [...body, ref('chapterId', '章', 'chapter'), refs('eventIds', '対応する世界内出来事', 'event'), ref('povId', '視点人物', 'character'), refs('threadIds', '筋', 'group'), rich('goals', '目標'), rich('conflicts', '葛藤'), rich('results', '変化・結果'), rich('newInformation', '新しい情報'), num('tension', '緊張度', 0, 10), num('importance', '重要度', 0, 10)],
  goal: [ref('ownerId', '目標の主体', 'character'), rich('description', '目標'), refs('evidenceSceneIds', '根拠となる場面', 'scene'), json('validity', '有効な時点・経路')],
  flow_node: [select('nodeType', 'ノードの種類', [['entry', '入口'], ['scene', '場面'], ['choice', '選択'], ['automatic', '自動進行'], ['call', '呼出し'], ['exit', '出口'], ['terminal', '終端']]), ref('sceneId', '本文の場面', 'scene'), text('terminalReason', '意図した終了の理由'), select('executionPolicy', '進行規則', [['manual_choice', '手動で選ぶ'], ['first_match', '優先順で最初の真'], ['all_match', '真の候補をすべて実行']]), { key: 'gate', label: '入口条件', type: 'condition' }, ref('fallbackId', '進行できない場合の行き先', 'flow_node'), ref('childGraphId', '呼出し先の分岐', 'flow_graph'), json('trigger', 'トリガー'), json('reuse', '共通場面の再利用')],
  flow_edge: [ref('fromId', '出発ノード', 'flow_node'), ref('toId', '行き先ノード', 'flow_node'), text('label', '選択肢の文言'), select('edgeType', '進行の種類', [['choice', '選択肢'], ['automatic', '自動進行'], ['call_return', '呼出しから戻る']]), { key: 'condition', label: '選択条件', type: 'condition' }, refs('effectIds', '適用する効果の順序', 'effect'), num('priority', '優先値')],
  flow_graph: [refs('nodeIds', 'ノード', 'flow_node'), refs('edgeIds', '接続', 'flow_edge'), refs('entryIds', '入口', 'flow_node'), refs('exitIds', '出口', 'flow_node'), ref('parentGraphId', '親の分岐', 'flow_graph'), json('parameters', '呼出しパラメーター')],
  dialogue_line: [ref('speakerId', '話者', 'character'), rich('text', '台詞'), ref('choiceEdgeId', '選択肢', 'flow_edge'), refs('cueIds', '演出', 'cue')],
  quest: [text('key', '一意のキー'), ref('stateVariableId', 'クエスト状態', 'variable'), rich('description', '説明'), refs('flowIds', '分岐', 'flow_graph'), json('transitionRules', '許容する状態遷移')],
  lore: [text('reading', '読み'), rich('body', '設定本文'), refs('assertionIds', '事実・証言', 'assertion'), refs('sourceIds', '資料', 'source'), json('aliases', '別名')],
  variable: [text('key', '一意の状態キー', '表示名とは別に保存します。'), select('valueType', '値の種類', [['boolean', '真偽'], ['integer', '整数'], ['enum', '列挙']]), select('scope', '有効範囲', [['run', '一回の試読'], ['across_runs', '周回をまたぐ'], ['scene', '場面'], ['chapter', '章'], ['character', '人物']]), { key: 'initial', label: '初期値', type: 'typed' }, json('allowed', '値の範囲・候補', '整数は min/max、列挙は values の配列を指定します。'), ref('ownerId', '対象人物', 'character'), rich('description', '説明'), json('derived', '算出式'), json('transitionRules', '許容する状態遷移'), json('resetRules', 'リセット規則')],
  effect: [select('operation', '操作', [['set', '値を設定'], ['add', '整数を加算'], ['grant', '物品を取得'], ['consume', '物品を消費'], ['move', '物品を移動'], ['assert', '知識・事実を追加'], ['mark_seen', '既読にする'], ['reset', 'リセット']]), ref('targetId', '操作の対象'), { key: 'value', label: '適用する値', type: 'typed' }, { key: 'condition', label: '効果の条件', type: 'condition' }, text('reason', '操作の理由'), ref('instanceId', '物品の個体', 'item')],
  assertion: [ref('subjectId', '対象'), text('predicate', '事実・認識の項目'), { key: 'value', label: '値', type: 'typed' }, select('truthKind', '情報の種類', [['author_truth', '作者が定めた真実'], ['testimony', '証言'], ['belief', '人物の認識'], ['hypothesis', '仮説']]), ref('holderId', '認識を持つ人物', 'character'), refs('sourceIds', '出所'), text('reason', '根拠・説明'), json('validity', '時点・経路'), json('evidenceLocation', '本文の根拠位置')],
  foreshadow: [rich('question', '読者に残す問い'), rich('intent', '作者の意図'), select('resolutionPolicy', '回収方針', [['this_work', '今作で回収'], ['sequel', '続編で回収'], ['intentional_open', '意図した未回収'], ['red_herring', 'ミスリード'], ['undecided', '未定'], ['rejected', '不採用']]), refs('clueIds', '手掛かり', 'disclosure'), refs('payoffIds', '回収', 'disclosure'), refs('requiredInfo', '必須の情報', 'disclosure'), refs('truthAssertionIds', '真実', 'assertion'), json('deadline', '回収対象・期限'), json('exceptions', '理由付きの例外')],
  disclosure: [ref('foreshadowId', '伏線', 'foreshadow'), json('anchor', '提示位置', '本文の entityId と任意の blockId / lineId を指定します。'), select('stage', '開示段階', [['hint', '手掛かり'], ['suspicion', '疑い'], ['reinforce', '補強'], ['reveal', '真相'], ['alternative', '代替説明']]), select('role', '役割', [['clue', '手掛かり'], ['payoff', '回収']]), { key: 'condition', label: '提示条件', type: 'condition' }, refs('knowledgeEffects', '知識への効果', 'effect')],
  checkpoint: [ref('contentVersionId', '作品版', 'snapshot'), select('origin', '開始状態の由来', [['full_play', '通し試読'], ['partial', '途中開始'], ['imported', '取り込み']]), json('runtimeState', '保存する試読状態'), ref('traceId', '経路記録', 'trace')],
  trace: [ref('contentVersionId', '作品版', 'snapshot'), ref('startCheckpointId', '開始状態', 'checkpoint'), json('steps', '経路記録'), text('seed', '抽選種'), select('externalMode', '外部値の証跡', [['stub', '仮値'], ['actual', '実測'], ['mixed', '混在']])],
  attachment: [text('displayName', '表示名'), text('mediaType', 'メディア形式'), text('contentHash', 'SHA-256'), num('byteSize', '容量（bytes）', 0), text('assetPath', '安全な素材パス'), text('licenseNote', '利用条件'), select('stage', '素材の状態', [['reference', '参考'], ['temporary', '仮素材'], ['final', '確定素材']]), ref('provenanceId', '出所', 'source')],
  source: [select('sourceType', '資料の種類', [['web', 'Web'], ['file', 'ファイル'], ['book', '書籍'], ['observation', '観察']]), text('locator', 'URL・書誌情報'), text('excerptLocation', '参照した箇所'), rich('interpretation', '作者の解釈'), ref('attachmentId', '添付', 'attachment'), { key: 'redistributionAllowed', label: '出力への再配布を許可する', type: 'boolean' }],
  cue: [json('anchor', '本文位置'), text('cueType', '演出の種類'), ref('attachmentId', '素材', 'attachment'), ref('speakerId', '話者', 'character'), text('expression', '表情'), num('waitMs', '待機（ms）', 0), num('mediaTime', '演出時刻（ms）', 0), text('stage', '演出の状態')],
  storyboard_frame: [json('anchor', '本文位置'), num('mediaStartMs', '開始（ms）', 0), num('mediaEndMs', '終了（ms）', 0), rich('caption', '説明'), ref('referenceAssetId', '参考素材', 'attachment'), ref('finalAssetId', '完成素材', 'attachment'), refs('cueIds', '演出', 'cue')],
  localization: [ref('sourceLineId', '原文の台詞', 'dialogue_line'), text('language', '言語コード'), text('sourceHash', '確認した原文のSHA-256'), rich('text', '翻訳本文'), select('stage', '翻訳工程', [['draft', '翻訳中'], ['reviewed', '確認済み'], ['needs_review', '再確認待ち']]), refs('recordingIds', '収録', 'recording')],
  recording: [ref('sourceLineId', '原文の台詞', 'dialogue_line'), text('language', '言語コード'), text('sourceHash', '確認した原文のSHA-256'), ref('translationId', '翻訳', 'localization'), ref('attachmentId', '録音素材', 'attachment'), rich('notes', '収録メモ'), select('stage', '収録工程', [['planned', '計画'], ['recorded', '収録済み'], ['reviewed', '確認済み'], ['needs_review', '再確認待ち']])],
  terminology: [text('canonical', '標準表記'), text('reading', '読み'), text('language', '言語コード'), rich('usageNotes', '用法'), json('variants', '表記の候補'), ref('voiceOwnerId', '口調の対象', 'character')],
  map: [ref('placeId', '地図の場所', 'place'), select('coordinateSystem', '座標系', [['normalized', '0〜1の正規化座標']]), ref('attachmentId', '画像', 'attachment'), ref('parentMapId', '親の地図', 'map'), json('pins', '場所のピン')],
  travel_route: [ref('fromPlaceId', '出発地', 'place'), ref('toPlaceId', '目的地', 'place'), select('direction', '移動の向き', [['one_way', '一方向'], ['two_way', '双方向']]), text('method', '移動方法'), text('minimumTicks', '最短時間（tick）'), text('maximumTicks', '最長時間（tick）'), refs('evidence', '根拠'), json('validity', '時点・経路')],
  template: [select('targetKind', '対象の情報の種類', ENTITY_KINDS.map(kind => [kind, KIND_LABELS[kind]])), text('description', '説明'), json('fields', '型付きの入力項目')],
  collection: [select('mode', '一覧の方式', [['fixed', '固定した選択'], ['dynamic', '条件で絞り込み']]), refs('memberIds', '固定した対象'), json('query', '検索条件'), json('sort', '並び順')],
  review: [json('target', '確認対象'), ref('targetVersionId', '対象版', 'snapshot'), rich('body', '指摘'), text('quotedText', '元の文章'), rich('resolution', '対応内容'), select('stage', '確認工程', [['open', '未対応'], ['fixed', '修正済み'], ['verified', '確認済み']])],
  creative_brief: [rich('targetAudience', '対象の読者・プレイヤー'), rich('experience', '体験'), rich('theme', 'テーマ'), rich('tone', '雰囲気'), rich('scope', '作品の範囲'), refs('deliverableIds', '成果物'), refs('decisionIds', '企画判断', 'decision')],
  decision: [text('subject', '判断の対象'), rich('reason', '判断理由'), ref('targetVersionId', '対象版', 'snapshot'), select('outcome', '判断', [['accepted', '採用'], ['rejected', '不採用'], ['deferred', '保留']]), text('priority', '優先度'), refs('reviewIds', 'レビュー', 'review')],
  gameplay_spec: [ref('sceneId', '場面', 'scene'), rich('action', 'プレイ行動'), text('mechanic', '仕組み'), rich('tutorial', '説明・導入'), { key: 'reward', label: '報酬', type: 'typed' }, ref('questId', 'クエスト', 'quest'), refs('taskIds', '制作タスク', 'production_task'), text('intentionalDifference', '原案との意図した違い')],
  production_task: [refs('targetIds', '制作対象'), select('stage', '工程', [['writing', '執筆'], ['review', 'レビュー'], ['implementation', '実装'], ['translation', '翻訳'], ['recording', '収録'], ['verification', '確認'], ['publication', '公開']]), select('progress', '進捗', [['todo', '未着手'], ['doing', '進行中'], ['done', '完了'], ['needs_review', '確認待ち']]), { key: 'deadline', label: '制作期限', type: 'date' }, refs('dependsOn', '先に必要なタスク', 'production_task'), text('blockingReason', '止まっている理由'), json('estimate', '見積もりと仮定')],
  media_variant: [select('medium', '媒体', [['game', 'ゲーム'], ['novel', '小説'], ['video', '動画'], ['audio', '音声'], ['promotion', '広報'], ['custom', 'その他']]), ref('baseSnapshotId', '元の確定版', 'snapshot'), rich('body', 'この媒体の本文'), ref('projectionProfileId', '出力範囲', 'projection_profile'), refs('sourceIds', '参照元'), { key: 'needsReview', label: '改訂に伴う確認待ち', type: 'boolean' }],
  voice_rule: [ref('characterId', '人物', 'character'), text('firstPerson', '一人称'), text('addressing', '呼びかけ'), text('phrasing', '言い回し'), rich('examples', '例文'), json('validity', '有効な時点・経路'), json('exceptions', '理由付きの例外')],
  external_contract: [text('key', '一意のキー'), select('owner', '値の管理元', [['tool', 'このツール'], ['game', 'ゲーム']]), text('inputType', '入力型'), text('outputType', '出力型'), select('missingPolicy', '未取得の場合', [['unknown', '不明にする'], ['block', '進行を止める']]), rich('description', '契約の説明'), json('stubValues', '宣言した仮値'), text('version', '契約版')],
  snapshot: [text('versionLabel', '版の名称'), text('contentHash', '内容のSHA-256'), { key: 'immutable', label: '確定した不変版', type: 'boolean' }, refs('parentVersionIds', '元の版', 'snapshot')],
  projection_profile: [text('audience', '出力対象者'), text('publicTitle', '公開用の作品名'), refs('includedIds', '公開する対象'), json('allowedKinds', '公開するkind'), json('namePolicy', '公開用の名前', 'byEntityId に対象IDと {mode: "replace", replacement: "公開名"} を指定します。'), json('publicTexts', '公開用の本文', '対象IDごとに body / summary / text の公開文を指定します。'), json('publicValues', '公開用の値'), json('excludedFields', '出力から除く項目'), { key: 'includeAuthorNotes', label: '作者メモを含める', type: 'boolean' }],
};

export const DATA_GROUPS: { label: string; kinds: string[] }[] = [
  { label: '人物と世界', kinds: ['character', 'group', 'place', 'item', 'lore', 'note', 'goal', 'map', 'travel_route', 'voice_rule', 'terminology'] },
  { label: '構成と本文', kinds: ['chapter', 'scene', 'dialogue_line', 'event', 'flow_graph', 'flow_node', 'flow_edge', 'quest'] },
  { label: '状態と伏線', kinds: ['variable', 'effect', 'assertion', 'foreshadow', 'disclosure', 'checkpoint', 'trace', 'external_contract'] },
  { label: '制作と資料', kinds: ['production_task', 'creative_brief', 'decision', 'gameplay_spec', 'media_variant', 'source', 'attachment', 'cue', 'storyboard_frame', 'localization', 'recording', 'review'] },
  { label: '整理と出力', kinds: ['collection', 'template', 'snapshot', 'projection_profile'] },
];
