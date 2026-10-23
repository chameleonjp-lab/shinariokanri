import type { ManualAudience } from '../manuals/format';
import { Icon } from './components';

export function LibraryHelp({ busy, ready, onSample, onManual }: { busy: boolean; ready: boolean; onSample: () => void; onManual: (audience: ManualAudience) => void }) {
  return <div className="library-help">
    <section className="sample-introduction" aria-labelledby="adventure-sample-title">
      <span className="eyebrow">全3章36場面・設定と物語を読み込むサンプル</span>
      <h2 id="adventure-sample-title">星還りの旅人</h2>
      <p>異世界へ迷い込んだ測量士・澪が、冒険者リナと失われた星路をたどる。帰還の鍵と街を守る誓いが、三つの章で結び直される。</p>
      <p>人物24人・場所24か所・物品35件。来歴や相互関係、旅の経路、道具の役割を細かく設定しています。</p>
      <ol className="sample-chapters" aria-label="サンプルで体験できること"><li>人物の来歴・場所・物品</li><li>年表・36場面の本文・分岐</li><li>伏線の回収・台詞・制作</li></ol>
      <p>300年前の事故から10日間の旅へ。街の暮らし、救助と調査、道具の受け渡し、離れた場所で進む避難を、年表・本文・地図でたどれます。作品内の「はじめに」メモに体験手順をまとめています。</p>
      <button type="button" className="button primary" disabled={busy || !ready} onClick={onSample}>全3章のサンプルを開く<Icon name="arrow" size={18}/></button>
      <p className="sample-save-note">充実版を開くたびに、新しい作品としてこの端末へ保存します。保存済みの作品はそのまま残り、どちらも自由に編集できます。</p>
    </section>
    <section className="manual-introduction" aria-labelledby="manual-introduction-title">
      <span className="eyebrow">いつでも使い方を確認</span>
      <h2 id="manual-introduction-title">目的から探すマニュアル</h2>
      <p>はじめての作品作りから、分岐の検査、共同作業、AIへの相談まで。各機能の用途と操作を説明します。</p>
      <div className="manual-actions"><button type="button" className="button secondary" onClick={() => onManual('human')}><Icon name="note"/>人間向けマニュアル</button><button type="button" className="button secondary" onClick={() => onManual('ai')}><Icon name="spark"/>AI向けマニュアル</button></div>
      <p>目次・検索・全文コピー・保存に対応。作品内メニューからも開けます。</p>
    </section>
  </div>;
}
