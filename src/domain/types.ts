/** Scenario contract 1.0.0. IDs, revisions and world ticks stay lossless strings. */
export const FORMAT_VERSION = '1.0.0' as const;
export type ID = string;
export type Tick = string;
export type Revision = string;
export type RealTime = string;
export type MediaTime = number;
export type Status = 'confirmed' | 'provisional' | 'needs_review' | 'rejected' | 'alternate';
export type Visibility = 'private' | 'team' | 'projection';
export type Scope = 'scene' | 'chapter' | 'character' | 'run' | 'across_runs';
export type TruthValue = 'true' | 'false' | 'unknown';
export type TypedValue =
  | { type: 'boolean'; value: boolean }
  | { type: 'integer'; value: number }
  | { type: 'enum' | 'text' | 'ref'; value: string }
  | { type: 'unknown'; value: null; reason: string };
export type CustomValue = string | number | boolean | null | { type: 'ref'; value: ID } | { type: 'date'; value: string };
export interface Ruby { start: number; end: number; text: string }
export interface ContentAnchor { entityId: ID; blockId?: ID | null; lineId?: ID | null; start?: number | null; end?: number | null; sourceVersionId?: ID | null; positionStatus?: 'unresolved'; positionReason?: string; quotedText?: string }
export interface TextLink { start: number; end: number; target: ContentAnchor }
export type UnresolvedTextAnnotation =
  | { kind: 'ruby'; originalText: string; reason: string; reading: string }
  | { kind: 'link'; originalText: string; reason: string; target: ContentAnchor };
export interface Block { id: ID; kind: 'paragraph' | 'heading' | 'list_item' | 'quote'; text: string; ruby?: Ruby[]; links?: TextLink[]; unresolvedAnnotations?: UnresolvedTextAnnotation[] }
export type RichText = Block[];
export type TimeSpec =
  | { mode: 'instant'; at: Tick; calendarId: string }
  | { mode: 'interval'; start: Tick; end: Tick; calendarId: string }
  | { mode: 'uncertain'; earliest: Tick; latest: Tick; calendarId: string; precision: string }
  | { mode: 'relative'; anchorEventId: ID; anchorPoint: 'start' | 'end'; minOffset: Tick; maxOffset: Tick }
  | { mode: 'unknown'; reason: string };
export interface TimeRange { start: Tick | null; end: Tick | null }
export type Comparator = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' | 'in';
export type Condition =
  | { op: 'constant'; value: boolean }
  | { op: 'all' | 'any'; children: Condition[] }
  | { op: 'not'; child: Condition }
  | { op: 'compare'; variableId: ID; comparator: Comparator; value: TypedValue | TypedValue[] }
  | { op: 'item'; itemId: ID; quantity: number }
  | { op: 'known'; assertionId: ID; holderId: ID }
  | { op: 'visited'; entityId: ID; count: number }
  | { op: 'external'; contractId: ID };
export type Expression = Condition
  | { op: 'value'; value: TypedValue }
  | { op: 'variable'; variableId: ID }
  | { op: 'add' | 'subtract' | 'multiply'; left: Expression; right: Expression }
  | { op: 'if'; condition: Condition; then: Expression; else: Expression };
export interface Validity { worldRange: TimeRange | null; routeCondition: Condition | null; presentationAnchor: ContentAnchor | null }
export interface TargetScope { projectId: ID; graphId?: ID | null; chapterId?: ID | null; routeCondition?: Condition | null; targetSnapshotId?: ID | null }
export interface Alias { id: ID; text: string; reading: string; validity: Validity; audienceHolderIds: ID[]; isPublicDefault: boolean }
export interface Participant { characterId: ID; role: 'actor' | 'witness' | 'mentioned' | 'informed' | 'custom'; evidenceIds?: ID[]; knowledgeEffectIds?: ID[] }
export interface ScenarioException { reason: string; targetScope: TargetScope; validity: Validity; evidenceIds: ID[] }
export interface RuntimeExclusion { variableId: ID; value: TypedValue; otherValue: TypedValue; reason: string; exceptions?: ScenarioException[] | null }
export type TimeConstraint =
  | { type: 'before'; targetEventId: ID }
  | { type: 'same_start'; targetEventId: ID }
  | { type: 'end_gap'; targetEventId: ID; minimumTicks: Tick; maximumTicks: Tick };
export interface Trigger { id?: ID; event: 'enter' | 'talk' | 'battle_result' | 'manual' | 'custom'; eventKey: string; repeat: 'once' | 'repeatable'; scope?: Scope; deadline?: TimeSpec | null }
export type Policy = 'manual_choice' | 'first_match' | 'all_match';
export interface Reuse { mode: 'reference' | 'clone' | 'override'; sourceId: ID; pinnedSnapshotId: ID; overrideFields: string[]; bindings?: Record<ID, ID> | null }
export interface Parameter { key: string; type: 'boolean' | 'integer' | 'enum'; default?: TypedValue | null }
export interface Transition { from: TypedValue; to: TypedValue; reason?: string; exception?: boolean; exceptionDetails?: ScenarioException | null }
export interface ResetRule { on: 'scene_end' | 'chapter_end' | 'run_end' | 'new_loop' | 'full_reset'; value: TypedValue; reason?: string }
export interface Allowed { min?: number; max?: number; values?: (string | boolean)[] }
export type UnresolvedReference = { unresolved: { label: string; reason: string } };
export type ResolutionPolicy = 'this_work' | 'sequel' | 'intentional_open' | 'red_herring' | 'undecided' | 'rejected';
export interface RuntimeItem { instanceId: ID; typeId: ID; quantity: number; ownerId: ID | null; locationId: ID | null; consumed: boolean; reason?: string }
export interface RuntimeAssertion { assertionId: ID; holderId: ID | null; truth: TruthValue; sourceEffectId?: ID }
export interface RuntimeCallFrame { graphId: ID; returnNodeId: ID; parameters: Record<string, TypedValue> }
export interface RuntimeState {
  contentVersionId: ID; variableValues: Record<ID, TypedValue>; itemInstances: RuntimeItem[]; assertions: RuntimeAssertion[];
  seenIds: ID[]; visitCounts: Record<ID, number>; onceTriggers: string[]; rngSeed: string; rngPosition: number;
  callStack: RuntimeCallFrame[]; presentationPosition: ID | null; loopNumber: number; provenance: 'full_play' | 'partial' | 'imported' | 'stub';
  resetCauses?: { variableId: ID; on: ResetRule['on']; before: TypedValue; after: TypedValue; reason: string }[];
}
export interface PresentationConditionResult { targetId: ID; value: TruthValue; reasons: string[] }
export interface TraceStep { nodeId: ID; edgeIds: ID[]; before: RuntimeState; after: RuntimeState; presentationState?: RuntimeState | null; conditionResults?: PresentationConditionResult[] | null; operation?: 'advance' | 'stub'; occurrenceId?: string; worldTick?: Tick; externalMode?: 'stub' | 'actual' | 'mixed'; externalValues?: Record<ID, TypedValue> }
export interface PresentationOccurrence { entityId: ID; occurrenceId: string; before: RuntimeState; after: RuntimeState; presentationState?: RuntimeState | null; conditionResults: PresentationConditionResult[]; externalValues?: Record<ID, TypedValue>; worldTick?: Tick }
export interface ReadingPath { chapterIds: ID[]; sceneIds: ID[]; selection?: 'chapters' | 'scenes' | null; occurrences: PresentationOccurrence[] }
export interface CoverageCount { checked: number; total: number; excluded?: number; unknown?: number; byProvenance?: Partial<Record<RuntimeState['provenance'], { checked: number; total: number }>>; byExternalMode?: Partial<Record<'internal' | 'stub' | 'actual' | 'mixed', { checked: number; total: number }>> }
export interface Coverage { scenes: CoverageCount; dialogue: CoverageCount; choices: CoverageCount; conditionTrue: CoverageCount; conditionFalse: CoverageCount; declaredTests: CoverageCount }
export interface MapPin { id: ID; placeId: ID; x: number; y: number; label?: string }
export interface FieldDefinition {
  key: string; label: string; type: 'text' | 'number' | 'boolean' | 'enum' | 'date' | 'ref'; required: boolean; nullable: boolean;
  default: CustomValue; allowedValues?: string[]; targetKinds?: EntityKind[]; help?: string;
}
export type Query =
  | { op: 'all' | 'any'; children: Query[] }
  | { op: 'kind'; value: EntityKind }
  | { op: 'text'; value: string }
  | { op: 'status'; value: Status }
  | { op: 'participant'; characterId: ID }
  | { op: 'production'; value: ProductionProgress }
  /** Matches a chapter and scenes directly assigned to it. Compose with kind/text/status in all/any. */
  | { op: 'chapter'; chapterId: ID }
  /** Matches a foreshadow, its qualifying disclosures, and the explicit scene/anchor target. */
  | { op: 'foreshadow'; foreshadowId?: ID; resolutionPolicy?: ResolutionPolicy; role?: 'clue' | 'payoff'; stage?: DisclosureData['stage'] };
export interface Sort { field: 'name' | 'createdAt' | 'updatedAt' | 'kind'; direction: 'asc' | 'desc' }
export interface Estimate { value?: number; range?: { min: number; max: number }; unit: string; assumptions: string[]; scope: TargetScope; unknownCount: number; source: string; speed?: number }
export interface RealDate { date: string; timeZone: string }
export type NamePolicy = { mode: 'alias'; aliasId: ID } | { mode: 'replace'; replacement: string } | { mode: 'exclude' } | { mode: 'anonymize'; publicId: ID; publicName: string };
export interface NamePolicyMap { defaultPolicy?: NamePolicy; byEntityId?: Record<ID, NamePolicy> }
export interface PublicTextFields { mechanic?:string;intentionalDifference?:string;action?:RichText;tutorial?:RichText;excerptLocation?:string;estimateUnit?:string;resetReason?: string; exclusionReason?: string; exceptionReason?: string; camera?: string; parameters?:string;variants?:string;estimateAssumptions?:string;estimateSource?:string;blockingReason?:string;firstPerson?:string;addressing?:string;phrasing?:string;examples?:RichText;
  summary?: RichText; body?: RichText; text?: RichText; description?: RichText; question?: RichText; intent?: RichText; caption?: RichText;
  usageNotes?: RichText; interpretation?: RichText; label?: string; reading?: string; terminalReason?: string; reason?: string;
  key?: string; canonical?: string; language?: string; locale?: string; sourceHash?: string; expression?: string; method?: string;
  locator?: string; predicate?: string; cueType?: string; precision?: string; displayName?: string; relationType?: string; eventKey?: string;
}
export type ProductionStage = 'writing' | 'review' | 'implementation' | 'translation' | 'recording' | 'verification' | 'publication';
export type ProductionProgress = 'todo' | 'doing' | 'done' | 'needs_review';
export interface CharacterData { reading?: string | null; aliases?: Alias[] | null; summary?: RichText | null; body?: RichText | null; authorNotes?: RichText | null; birth?: TimeSpec | null; death?: TimeSpec | null; goals?: ID[] | null; voiceRules?: ID[] | null }
export interface GroupData { groupType: 'display' | 'faction' | 'plot_thread' | 'category'; members?: ID[] | null; parentId?: ID | null; summary?: RichText | null }
export interface EventData { summary: RichText; time: TimeSpec; laneRole: 'common' | 'participants' | 'both'; participants?: Participant[] | null; locationId?: ID | null; itemIds?: ID[] | null; authorNotes?: RichText | null; constraints?: TimeConstraint[] | null }
export interface PlaceData { parentId?: ID | null; reading?: string | null; aliases?: Alias[] | null; body?: RichText | null; mapIds?: ID[] | null; changes?: ID[] | null }
export interface ItemData { itemMode: 'type' | 'instance'; typeId?: ID | null; body?: RichText | null; properties?: CustomValue | null; changes?: ID[] | null }
export interface GameHandoffEvidence {approval:{entityId:ID;sourceVersionId:ID};sourceVersionId:ID;verificationVersionId:ID;profileVersionId:ID;sourceRevision:Revision;profileId:ID;packageHash:string;receiptHash:string;mode:'stub'|'actual'|'mixed';rawJson:string;idMappings:{entityId:ID;sourceVersionId:ID;publicId:string}[];projectionBindings:{entityId:ID;sourceVersionId:ID;editionVersionId:ID;publicId:string}[];citationBindings:{sourceVersionId:ID;publicVersionId:string}[];worldVersions:{sourceVersionId:ID;contentHash:string}[]}
export interface NoteData { handoffReceipt?:GameHandoffEvidence|null; body: RichText; attachmentIds?: ID[] | null; convertedToIds?: ID[] | null; originNoteId?: ID | null }
export interface ChapterData { sceneIds: ID[]; summary?: RichText | null; authorNotes?: RichText | null; structureRole?: string | null }
export interface SceneData { summary: RichText; body: RichText; authorNotes: RichText; eventIds: ID[]; dialogueLineIds?: ID[] | null; chapterId?: ID | null; threadIds?: ID[] | null; povId?: ID | null; goals?: RichText | null; conflicts?: RichText | null; results?: RichText | null; newInformation?: RichText | null; tension?: number | null; importance?: number | null; blockIds?: ID[] | null; reuse?: Reuse | null }
export interface GoalData { ownerId: ID; description: RichText; changes?: ID[] | null; evidenceSceneIds?: ID[] | null; validity?: Validity | null }
export interface FlowNodeData { nodeType: 'scene' | 'choice' | 'automatic' | 'call' | 'entry' | 'exit' | 'terminal'; sceneId?: ID | null; childGraphId?: ID | null; terminalReason?: string | null; trigger?: Trigger | null; gate?: Condition | null; executionPolicy?: Policy | null; fallbackId?: ID | null; reuse?: Reuse | null }
export interface FlowEdgeData { fromId: ID; toId: ID | UnresolvedReference; edgeType: 'choice' | 'automatic' | 'call_return'; label?: string | null; condition?: Condition | null; effectIds?: ID[] | null; priority?: number | null; choiceLineId?: ID | null }
export interface FlowGraphData { nodeIds: ID[]; edgeIds: ID[]; entryIds: ID[]; exitIds: ID[]; parentGraphId?: ID | null; parameters?: Parameter[] | null }
export interface DialogueLineage { mode: 'split' | 'merge' | 'copy'; baseRevision: Revision; reason: string; segments: { source: ContentAnchor; target: ContentAnchor }[] }
export interface DialogueData { text: RichText; speakerId?: ID | null; choiceEdgeId?: ID | null; cueIds?: ID[] | null; originLineIds?: ID[] | null; replacedByLineIds?: ID[] | null; lineage?: DialogueLineage | null; claimAssertionIds?: ID[] | null; assertionIntent?: 'statement' | 'lie' | 'misunderstanding' | 'quotation' | null; assertionReason?: string | null }
export interface QuestData { key: string; stateVariableId: ID; description?: RichText | null; flowIds?: ID[] | null; transitionRules?: Transition[] | null; gameplaySpecIds?: ID[] | null }
export interface LoreData { body: RichText; assertionIds?: ID[] | null; sourceIds?: ID[] | null; reading?: string | null; aliases?: Alias[] | null }
export interface VariableData { key: string; valueType: 'boolean' | 'integer' | 'enum'; scope: Scope; initial: TypedValue; allowed: Allowed; description?: RichText | null; ownerId?: ID | null; derived?: Expression | null; externalContractId?: ID | null; resetRules?: ResetRule[] | null; transitionRules?: Transition[] | null; exclusions?: RuntimeExclusion[] | null; externalUseDeclared?: boolean | null }
export interface EffectData { operation: 'set' | 'add' | 'grant' | 'consume' | 'move' | 'assert' | 'mark_seen' | 'reset'; targetId: ID; value?: TypedValue | null; condition?: Condition | null; instanceId?: ID | null; reason?: string | null; exceptionDetails?: ScenarioException | null }
export interface AssertionData { subjectId: ID; predicate: string; value: TypedValue | ID; truthKind: 'author_truth' | 'testimony' | 'belief' | 'hypothesis'; holderId?: ID | null; sourceIds?: ID[] | null; evidenceLocation?: ContentAnchor | null; validity?: Validity | null; reason?: string | null }
export interface ForeshadowData { question: RichText; intent: RichText; resolutionPolicy: ResolutionPolicy; truthAssertionIds?: ID[] | null; clueIds?: ID[] | null; payoffIds?: ID[] | null; requiredInfo?: ID[] | null; alternativeInfo?: Record<ID, ID[]> | null; deadline?: TargetScope | null; presentationDeadline?: ContentAnchor | null; exceptions?: ScenarioException[] | null }
export interface DisclosureData { foreshadowId: ID; anchor: ContentAnchor; stage: 'hint' | 'suspicion' | 'reinforce' | 'reveal' | 'alternative'; role: 'clue' | 'payoff'; condition?: Condition | null; knowledgeEffects?: ID[] | null; targetScope?: TargetScope | null }
export interface CheckpointData { worldTick?: Tick | null; contentVersionId: ID; runtimeState: RuntimeState; presentationState?: RuntimeState | null; presentationResults?: PresentationConditionResult[] | null; contentRevision?: Revision | null; origin?: 'full_play' | 'partial' | 'imported' | null; traceId?: ID | null; migration?: { sourceCheckpointId: ID; sourceVersionId: ID; baseRevision: Revision; method: 'migrate' | 'recreate' } | null }
export interface TraceData { contentVersionId: ID; startCheckpointId: ID; steps: TraceStep[]; contentRevision?: Revision | null; initialExternalValues?: Record<ID, TypedValue> | null; initialStubBaseState?: RuntimeState | null; initialStubValues?: { variables?: Record<ID, TypedValue>; external?: Record<ID, TypedValue> } | null; initialWorldTick?: Tick | null; seed?: string | null; engineVersion?: string | null; externalMode?: 'stub' | 'actual' | 'mixed' | null; coverage?: Coverage | null; regressionDeclarations?: { projectRevision: Revision; traceIds: ID[] } | null; reconfirmation?: { sourceTraceId: ID; sourceVersionId: ID; baseRevision: Revision; startCheckpointId?: ID | null } | null; mode?: 'flow' | 'chapters' | null; readingPath?: ReadingPath | null }
export interface AttachmentData { mediaType: string; contentHash: string; byteSize: number; assetPath: string; displayName?: string | null; provenanceId?: ID | null; licenseNote?: string | null; stage?: 'reference' | 'temporary' | 'final' | null; revisionHistory?: ID[] | null }
export interface SourceData { sourceType: 'web' | 'file' | 'book' | 'observation'; locator: string; accessedAt?: RealTime | null; excerptLocation?: string | null; interpretation?: RichText | null; attachmentId?: ID | null; redistributionAllowed?: boolean | null }
export interface CueData { anchor: ContentAnchor; cueType: string; attachmentId?: ID | null; speakerId?: ID | null; expression?: string | null; waitMs?: MediaTime | null; camera?: CustomValue | null; mediaTime?: MediaTime | null; stage?: string | null }
export interface StoryboardData { anchor: ContentAnchor; mediaStartMs: MediaTime; mediaEndMs?: MediaTime | null; referenceAssetId?: ID | null; finalAssetId?: ID | null; cueIds?: ID[] | null; caption?: RichText | null }
export interface LocalizationData { sourceLineId: ID; language: string; sourceHash: string; text: RichText; stage?: 'draft' | 'reviewed' | 'needs_review' | null; reviewedBy?: ID | null; recordingIds?: ID[] | null }
export interface RecordingData { sourceLineId: ID; language: string; sourceHash: string; translationId?: ID | null; attachmentId?: ID | null; notes?: RichText | null; stage?: 'planned' | 'recorded' | 'reviewed' | 'needs_review' | null; reviewedBy?: ID | null }
export interface TerminologyData { canonical: string; reading: string; variants?: string[] | null; language?: string | null; usageNotes?: RichText | null; validity?: Validity | null; exceptions?: ScenarioException[] | null; voiceOwnerId?: ID | null }
export interface MapData { placeId: ID; coordinateSystem: 'normalized'; attachmentId?: ID | null; parentMapId?: ID | null; pins?: MapPin[] | null }
export interface TravelRouteData { fromPlaceId: ID; toPlaceId: ID; direction: 'one_way' | 'two_way'; method?: string | null; minimumTicks?: Tick | null; maximumTicks?: Tick | null; evidence?: ID[] | null; validity?: Validity | null }
export interface TemplateData { targetKind: EntityKind; fields: FieldDefinition[]; description?: string | null; version?: Revision | null; defaults?: Record<string, CustomValue> | null }
export interface CollectionData { mode: 'dynamic' | 'fixed'; query?: Query | null; memberIds?: ID[] | null; sort?: Sort | null; purpose?: 'regression' | null }
export interface ReviewData { target: ContentAnchor | ID; targetVersionId: ID; body: RichText; stage: 'open' | 'fixed' | 'verified'; assigneeId?: ID | null; quotedText?: string | null; resolution?: RichText | null }
export interface CreativeBriefData { targetAudience: RichText; experience: RichText; theme: RichText; tone: RichText; scope: RichText; deliverableIds?: ID[] | null; decisionIds?: ID[] | null }
export interface DecisionData { subject: string; reason: RichText; targetVersionId: ID; outcome: 'accepted' | 'rejected' | 'deferred'; priority?: string | null; requirementIds?: string[] | null; reviewIds?: ID[] | null }
export interface GameplaySpecData { sceneId: ID; action: RichText; mechanic?: string | null; tutorial?: RichText | null; reward?: TypedValue | null; questId?: ID | null; taskIds?: ID[] | null; intentionalDifference?: string | null }
export interface ProductionTaskData { targetIds: ID[]; stage: ProductionStage; progress: ProductionProgress; assigneeId?: ID | null; deadline?: RealDate | null; dependsOn?: ID[] | null; estimate?: Estimate | null; blockingReason?: string | null }
export interface MediaVariantData { previousVariantId?: ID | null; confirmationRecipientIds?: ID[] | null; medium: 'game' | 'novel' | 'video' | 'audio' | 'promotion' | 'custom'; baseSnapshotId: ID; body?: RichText | null; releaseAt?: RealTime | null; projectionProfileId?: ID | null; sourceIds?: ID[] | null; needsReview?: boolean | null }
export interface VoiceRuleData { characterId: ID; validity: Validity; firstPerson?: string | null; addressing?: string | null; phrasing?: string | null; examples?: RichText | null; exceptions?: ScenarioException[] | null }
export interface ExternalContractData { key: string; owner: 'tool' | 'game'; inputType: string; outputType: string; missingPolicy: 'unknown' | 'block'; description?: RichText | null; stubValues?: TypedValue[] | null; adapterProfileIds?: ID[] | null; version?: string | null }
export interface SnapshotData { versionLabel: string; contentHash: string; immutable: true; parentVersionIds?: ID[] | null; releasedAt?: RealTime | null; referencedWorldVersionIds?: ID[] | null }
export interface ProjectionProfileData { blockSources?:Record<ID,ID>|null;citedVersions?:{sourceVersionId:ID;profileId:ID;publicVersionId:ID}[]|null;audience: string; includedIds: ID[]; namePolicy: NamePolicy | NamePolicyMap; allowedKinds?: EntityKind[] | null; excludedFields?: string[] | null; routeScope?: TargetScope | null; includeAuthorNotes?: boolean | null; publicTitle?: string | null; publicTexts?: Record<ID, PublicTextFields> | null; allowedFields?: Partial<Record<EntityKind, string[]>> | null; allowedRelationIds?: ID[] | null; idPolicy?: 'remap' | 'preserve' | null; publicIds?: Record<ID, ID> | null; sourceVersionId?: ID | null; publicValues?: Record<ID, Record<string, string>> | null; includedStatuses?: Status[] | null; publicVersionLabel?: string | null; approvedAttachmentIds?: ID[] | null }
export interface EntityDataMap {
  character: CharacterData; group: GroupData; event: EventData; place: PlaceData; item: ItemData; note: NoteData; chapter: ChapterData;
  scene: SceneData; goal: GoalData; flow_node: FlowNodeData; flow_edge: FlowEdgeData; flow_graph: FlowGraphData; dialogue_line: DialogueData;
  quest: QuestData; lore: LoreData; variable: VariableData; effect: EffectData; assertion: AssertionData; foreshadow: ForeshadowData;
  disclosure: DisclosureData; checkpoint: CheckpointData; trace: TraceData; attachment: AttachmentData; source: SourceData; cue: CueData;
  storyboard_frame: StoryboardData; localization: LocalizationData; recording: RecordingData; terminology: TerminologyData; map: MapData;
  travel_route: TravelRouteData; template: TemplateData; collection: CollectionData; review: ReviewData; creative_brief: CreativeBriefData;
  decision: DecisionData; gameplay_spec: GameplaySpecData; production_task: ProductionTaskData; media_variant: MediaVariantData;
  voice_rule: VoiceRuleData; external_contract: ExternalContractData; snapshot: SnapshotData; projection_profile: ProjectionProfileData;
}
export type EntityKind = keyof EntityDataMap;
export type Entity<K extends EntityKind = EntityKind> = K extends EntityKind ? {
  id: ID; projectId: ID; kind: K; revision: Revision; name: string; status: Status; visibility: Visibility;
  retainIfUnreferenced?: boolean | null;
  projectionProfileId?: ID | null; templateId?: ID | null; createdAt: RealTime; updatedAt: RealTime; deletedAt?: RealTime | null; deletionOperationId?: ID | null;
  customValues: Record<string, CustomValue>; data: EntityDataMap[K];
} : never;
export interface Relation { id: ID; projectId: ID; revision: Revision; fromId: ID; toId: ID; relationType: string; direction: 'forward' | 'symmetric'; validity: Validity; evidenceIds: ID[]; status: Status; visibility: Visibility; projectionProfileId?: ID | null; deletedAt?: RealTime | null; deletionOperationId?: ID | null }
export interface RelationTypeDefinition { key: string; label: string; fromKinds: EntityKind[]; toKinds: EntityKind[]; allowSelf: boolean; allowSymmetric: boolean }
export interface CalendarMonth { name: string; days: number }
export type CalendarDefinition = { id: string; name: string; kind: 'gregorian'; originLabel: string; ticksPerDay: Tick } | { id: string; name: string; kind: 'repeating'; originLabel: string; ticksPerDay: Tick; years: { months: CalendarMonth[] }[] };
export interface WorldReference { projectId: ID; immutableSnapshotId: ID; contentHash: string }
export interface SavedView { id: ID; name: string; view: string; entityIds: ID[]; settings: Record<string, string | number | boolean | null> }
export interface ViewState { userId: string; deviceClass: 'phone' | 'tablet' | 'desktop'; viewId: string; positions: Record<ID, { x: number; y: number }>; sortIds: ID[]; collapsedIds: ID[]; zoom: number; filters: Record<string, string | boolean>; lastOpenedId: ID | null }
export interface ProjectData {
  projectId: ID; name: string; formatVersion: typeof FORMAT_VERSION; revision: Revision; calendarId: string; mainStart: Tick;
  calendars: CalendarDefinition[]; worldReferences: WorldReference[]; entities: Entity[]; relations: Relation[];
  snapshots: ProjectSnapshot[]; history: CommandRecord[]; views: SavedView[]; authorAlternatives?: AuthorAlternative[];
}
export type ProjectContent = Omit<ProjectData, 'history' | 'snapshots' | 'authorAlternatives'>;
export interface ProjectSnapshot { id: ID; versionLabel: string; contentHash: string; createdAt: RealTime; content: ProjectContent }
export type ContentState = Omit<ProjectData, 'history'>;
export interface CommandRecord { operationId: ID; projectId: ID; baseRevision: Revision; revision: Revision; targetIds: ID[]; reason: string; createdAt: RealTime; before: ContentState; after: ContentState; compensatesOperationId?: ID; idMap?: Record<ID, ID>; importOrigin?: { sourceProjectId: ID; sourceOperationId: ID; importOperationId: ID } }
/** Branch snapshots live with ProjectData/ContentState and never recurse into immutable ProjectContent. */
export interface StructurePlan { chapterId: ID; templateId: string; beatLabels: string[]; assignments: Record<string, ID> }
export interface AlternativeVersion { id: ID; parentVersionId: ID | null; label: string; createdAt: RealTime; content: ProjectContent; contentHash?: string; structurePlan?: StructurePlan }
export interface AlternativeApplyReceipt {
  id: ID; createdAt: RealTime; alternativeVersionId?: ID; sourceSnapshotId?: ID | null; selectedChangeKeys?: string[];
  fromCanonicalRevision: Revision; appliedRevision?: Revision;
  patches: Array<{ key: string; scope: 'project' | 'entity' | 'relation' | 'presentation'; itemId?: ID; path: string[]; label: string; before: { present: boolean; value?: unknown }; after: { present: boolean; value?: unknown } }>;
}
export interface AuthorAlternative {
  id: ID; projectId: ID; name: string; status: 'active' | 'provisional' | 'needs_review' | 'rejected' | 'accepted';
  baseRevision: Revision; sourceSnapshotId?: ID | null; baseContent: ProjectContent; baseContentHash?: string;
  versions: AlternativeVersion[]; headVersionId: ID; applyReceipts: AlternativeApplyReceipt[]; integrityHash?: string; createdAt: RealTime; updatedAt: RealTime;
}
export type DomainErrorCode = 'VALIDATION_FAILED' | 'REFERENCE_INVALID' | 'TIME_CONSTRAINT_CONFLICT' | 'CONDITION_UNKNOWN' | 'TRANSITION_BLOCKED' | 'LOCAL_SAVE_FAILED' | 'QUOTA_EXCEEDED' | 'SYNC_CONFLICT' | 'AUTH_REQUIRED' | 'FORBIDDEN' | 'FORMAT_UNSUPPORTED' | 'INTEGRITY_FAILED' | 'IMPORT_LIMIT' | 'ANALYSIS_LIMIT' | 'EXPORT_UNSUPPORTED';
export interface ValidationIssue { code: DomainErrorCode; path: string; message: string }
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };
export interface RuntimeContext { state: RuntimeState; currentPresentation?: { project: ProjectData; target: { nodeId?: ID; sceneId?: ID }; anchor: ContentAnchor }; effectPresentations?: { project: ProjectData; target: { nodeId?: ID; sceneId?: ID }; anchor: ContentAnchor }[]; variables?: Entity<'variable'>[]; entities?: Entity[]; referenceEntities?: Entity[]; externalValues?: Record<ID, TypedValue>; ruleContext?: { projectId: ID; graphId?: ID; chapterId?: ID; worldTick?: Tick; sourceVersionId?: ID; anchorBindings?: Record<ID, ID> }; ruleContexts?: Record<ID, NonNullable<RuntimeContext['ruleContext']>> }
export interface ConditionResult { value: TruthValue; reasons: string[] }
