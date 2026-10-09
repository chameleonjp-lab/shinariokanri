import {Component,useEffect,useSyncExternalStore,type ReactNode} from 'react';
import {clearDiagnostics,currentDiagnosticAccount,diagnosticAccount,diagnosticRecords,recordDiagnostic,subscribeDiagnostics} from '../diagnostics';
import {registerAuthorCache} from './StoreContext';
import {downloadBytes} from './components';
registerAuthorCache(account=>clearDiagnostics(account));
export function DiagnosticPanel({accountId}:{accountId:string|null}){
  useEffect(()=>diagnosticAccount(accountId),[accountId]);
  const rows=useSyncExternalStore(subscribeDiagnostics,()=>diagnosticRecords(accountId));
  return <details className="settings-card" aria-label="任意持出し診断"><summary>この作業の診断を確認・持出し</summary><p>実エラーのコード、操作ID、版、公開build情報、画面寸法とOS・ブラウザーの種類/版だけを保持します。本文・氏名・アカウントID・stack・認証情報は含めません。ファイルの内容を確認して本人が持ち出します。</p><p>{rows.length}件 · この作業中の最新20件</p>{rows.map((row,index)=><p key={index}>{row.code} · 操作 {row.operationId??'該当なし'} · 版 {row.revision??'未取得'} · {row.recordedAt}</p>)}<button className="button secondary" disabled={!rows.length} onClick={()=>downloadBytes(new TextEncoder().encode(JSON.stringify({format:'scenario-diagnostics',records:rows},null,2)),`scenario-diagnostics-${Date.now()}.json`,'application/json')}>確認した診断をファイルに持出す</button><button className="button subtle" disabled={!rows.length} onClick={()=>clearDiagnostics(accountId)}>この作業の診断を消す</button></details>;
}
export class WorkspaceErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error:unknown){recordDiagnostic(error,{code:'UI_RENDER_FAILED'});}
  render(){return this.state.failed?<main className="settings-card"><h1>画面を表示できませんでした</h1><p>保存済み作品と保持した入力を再読込して確認してください。</p><button className="button primary" onClick={()=>location.reload()}>保持した作品と入力を再読込</button><DiagnosticPanel accountId={currentDiagnosticAccount()}/></main>:this.props.children;}
}
