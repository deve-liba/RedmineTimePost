// バージョン情報を管理するファイル
const APP_VERSION = '1.0.2';

// バージョン情報を取得する関数
function getAppVersion() {
    return APP_VERSION;
}

// バージョン情報を表示する関数
function displayAppVersion(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = `v${APP_VERSION}`;
    }
}

// バージョン履歴
const VERSION_HISTORY = [
    {
        version: '1.0.2',
        date: '2025-10-02',
        changes: [
            'TSVファイルにコメント列を追加（作業分類の右隣に指定可能）',
            'コメント列は省略可能に対応',
            'CRLF改行コード対応（LFとCRLFの両方に対応）'
        ]
    },
    {
        version: '1.0.1',
        date: '2025-06-04',
        changes: [
            '入力フィールドのクリア機能を改善',
            '成功・失敗カウンターの表示を修正',
            'バージョン情報表示機能を追加'
        ]
    },
    {
        version: '1.0.0',
        date: '2025-05-20',
        changes: [
            '初回リリース',
            '複数Redmine環境対応',
            'TSVファイルによる一括時間計上',
            '処理結果ダウンロード機能'
        ]
    }
];

// バージョン履歴を取得する関数
function getVersionHistory() {
    return VERSION_HISTORY;
}
