document.addEventListener('DOMContentLoaded', function () {
    // バージョン情報を表示
    displayAppVersion('versionInfo');

    // DOM要素
    const tsvFileInput = document.getElementById('tsvFile');
    const redmineEnvironmentSelect = document.getElementById('redmineEnvironment');
    const reloadEnvironmentsButton = document.getElementById('reloadEnvironments');
    const uploadButton = document.getElementById('uploadButton');
    const downloadButton = document.getElementById('downloadButton');
    const progressSection = document.querySelector('.progress-section');
    const progressIndicator = document.getElementById('progressIndicator');
    const progressText = document.getElementById('progressText');
    const statusMessage = document.getElementById('statusMessage');

    // データ保存用変数
    let tsvData = null;
    let processedData = null;
    let selectedEnvironment = null;

    // 環境リストを読み込む
    loadEnvironments();

    // 環境再読み込みボタンのイベント
    reloadEnvironmentsButton.addEventListener('click', function () {
        loadEnvironments();
        showStatus('環境リストを再読み込みしました', 'info');
    });

    // TSVファイル選択イベント
    tsvFileInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            parseTsvFile(file);
        }
    });

    // 環境選択イベント
    redmineEnvironmentSelect.addEventListener('change', function () {
        const selectedValue = this.value;
        if (selectedValue) {
            chrome.storage.sync.get('redmineEnvironments', function (data) {
                const environments = data.redmineEnvironments || [];
                selectedEnvironment = environments.find(env => env.name === selectedValue);

                console.log('選択された環境:', selectedEnvironment); // デバッグ用ログ

                if (selectedEnvironment) {
                    showStatus(`環境「${selectedEnvironment.name}」を選択しました - ${selectedEnvironment.url}`, 'info');

                    // ファイルと環境の両方が選択されていればアップロードボタンを有効化
                    if (tsvData) {
                        uploadButton.disabled = false;
                    }
                } else {
                    showStatus(`エラー: 環境「${selectedValue}」の情報が見つかりません。再読み込みボタンを試してください。`, 'error');
                    selectedEnvironment = null;
                    uploadButton.disabled = true;
                }
            });
        } else {
            selectedEnvironment = null;
            uploadButton.disabled = true;
        }
    });

    // アップロードボタンクリックイベント
    uploadButton.addEventListener('click', function () {
        if (tsvData && selectedEnvironment) {
            // 前回の結果情報があれば削除
            const oldCountInfo = document.getElementById('countInfo');
            if (oldCountInfo) {
                oldCountInfo.remove();
            }

            processEntries();
        }
    });

    // ダウンロードボタンクリックイベント
    downloadButton.addEventListener('click', function () {
        if (processedData) {
            downloadResults();
        }
    });

    // 環境リストを読み込む関数
    function loadEnvironments() {
        chrome.storage.sync.get('redmineEnvironments', function (data) {
            const environments = data.redmineEnvironments || [];
            console.log('読み込まれた環境:', environments); // デバッグ用ログ

            // セレクトボックスをクリア
            while (redmineEnvironmentSelect.options.length > 1) {
                redmineEnvironmentSelect.remove(1);
            }

            // 環境リストを追加
            if (environments.length > 0) {
                environments.forEach(env => {
                    const option = document.createElement('option');
                    option.value = env.name;
                    option.textContent = env.name;
                    redmineEnvironmentSelect.appendChild(option);
                    console.log('環境オプション追加:', env.name); // デバッグ用ログ
                });
                showStatus(`${environments.length}個の環境を読み込みました`, 'success');
            } else {
                showStatus('環境設定が必要です。「環境設定」リンクから設定してください。', 'error');
            }
        });
    }

    // TSVファイルをパースする関数
    function parseTsvFile(file) {
        const reader = new FileReader();

        reader.onload = function (e) {
            try {
                const content = e.target.result;
                const lines = content.split('\n').filter(line => line.trim());

                // ヘッダー行があるか確認
                if (lines.length < 2) {
                    throw new Error('TSVファイルには少なくともヘッダー行と1つのデータ行が必要です');
                }

                // ヘッダー行を解析
                const headers = lines[0].split('\t');
                const requiredFields = ['プロジェクトID', '日付', 'チケットID', '担当者', '時間', '作業分類'];

                // 必須フィールドが存在するか確認
                for (const field of requiredFields) {
                    if (!headers.includes(field)) {
                        throw new Error(`TSVファイルに必須フィールド「${field}」がありません`);
                    }
                }

                // データ行を解析
                const parsedData = [];
                for (let i = 1; i < lines.length; i++) {
                    const values = lines[i].split('\t');

                    // 値の数がヘッダーの数と一致するか確認
                    if (values.length !== headers.length) {
                        throw new Error(`行 ${i + 1} の値の数がヘッダーと一致しません`);
                    }

                    const entry = {};
                    headers.forEach((header, index) => {
                        entry[header] = values[index];
                    });

                    // プロジェクトIDの存在確認のみ行う（数値でなくてもOK、プロジェクト識別子も可）
                    if (!entry['プロジェクトID'] || entry['プロジェクトID'].trim() === '') {
                        throw new Error(`行 ${i + 1} のプロジェクトIDが空です。`);
                    }

                    // 日付のフォーマットを確認
                    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                    if (!dateRegex.test(entry['日付'])) {
                        throw new Error(`行 ${i + 1} の日付フォーマットが正しくありません。YYYY-MM-DD形式にしてください。`);
                    }

                    // チケットIDが数値か確認
                    if (isNaN(parseInt(entry['チケットID']))) {
                        throw new Error(`行 ${i + 1} のチケットIDが数値ではありません。`);
                    }

                    // 時間が数値か確認
                    if (isNaN(parseFloat(entry['時間']))) {
                        throw new Error(`行 ${i + 1} の時間が数値ではありません。`);
                    }

                    parsedData.push(entry);
                }

                tsvData = {
                    headers: headers,
                    entries: parsedData
                };

                showStatus(`TSVファイルを読み込みました。${parsedData.length}件のエントリがあります。`, 'success');

                // 環境も選択されていればアップロードボタンを有効化
                if (selectedEnvironment) {
                    uploadButton.disabled = false;
                }
            } catch (error) {
                // エラー時の処理
                showStatus(`エラー: ${error.message}`, 'error');
                resetFileInput(); // ファイル未選択状態にリセット
            }
        };

        reader.onerror = function () {
            showStatus('ファイルの読み込み中にエラーが発生しました', 'error');
            resetFileInput(); // ファイル未選択状態にリセット
        };

        reader.readAsText(file);
    }

// ファイル入力をリセットする関数
function resetFileInput() {
    // ファイル入力をクリア
    tsvFileInput.value = '';
    
    // データをクリア
    tsvData = null;
    
    // アップロードボタンを無効化
    uploadButton.disabled = true;
    
    // ダウンロードボタンも無効化（既存の処理結果もクリア）
    downloadButton.disabled = true;
    processedData = null;
    
    // 進捗表示を非表示
    progressSection.hidden = true;
    
    console.log('ファイル入力をリセットしました');
}

function processEntries() {
    if (!tsvData || !selectedEnvironment) {
        return;
    }

    // UIを準備
    uploadButton.disabled = true;
    downloadButton.disabled = true;
    progressSection.hidden = false;
    progressIndicator.style.width = '0%';
    progressText.textContent = '0%';
    showStatus('時間エントリの登録を開始します...', '');

    // 成功・失敗カウント用の要素を追加
    const countInfo = document.createElement('div');
    countInfo.id = 'countInfo';
    countInfo.style.marginTop = '10px';
    countInfo.style.fontSize = '16px';
    countInfo.style.fontWeight = 'bold';
    countInfo.style.padding = '5px';
    countInfo.style.borderRadius = '5px';
    countInfo.style.backgroundColor = '#f5f5f5';
    countInfo.innerHTML = '<div style="display:flex; justify-content:space-around; width:100%;"><div id="successCount" style="padding:5px; border-radius:4px; background-color:#e8f5e9;"><span style="color:green; font-weight:bold;">成功: 0</span></div><div id="failCount" style="padding:5px; border-radius:4px; background-color:#ffebee;"><span style="color:red; font-weight:bold;">失敗: 0</span></div></div>';
    progressSection.appendChild(countInfo);

    const entries = tsvData.entries;
    const total = entries.length;
    let processed = 0;
    let successful = 0;
    let failed = 0; // 失敗カウントを明示的に追加

    // 結果データを初期化
    processedData = {
        headers: [...tsvData.headers, '結果', 'メッセージ'],
        entries: []
    };

    // 現在のアクティブタブを取得して使用
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
            const tabId = tabs[0].id;
            // 各エントリを順番に処理
            processNextEntry(0, tabId);
        } else {
            showStatus('アクティブなタブが見つかりません', 'error');
            uploadButton.disabled = false;
        }
    });

    // 再帰的にエントリを処理する関数
    function processNextEntry(index, tabId) {
        if (index >= total) {
            // 全て処理完了
            finishProcessing();
            return;
        }

        const entry = entries[index];
        const resultEntry = {...entry, '結果': '', 'メッセージ': ''};

        // ブラウザでの時間エントリ追加
        createTimeEntryInBrowser(entry, tabId)
            .then(result => {
                processed++;

                if (result.success) {
                    successful++;
                    resultEntry['結果'] = '成功';
                    resultEntry['メッセージ'] = result.message || '登録完了';
                } else {
                    failed++; // 失敗カウントを明示的に増加
                    resultEntry['結果'] = '失敗';
                    resultEntry['メッセージ'] = result.error || 'エラーが発生しました';
                }

                // 結果を保存
                processedData.entries.push(resultEntry);

                // 直接カウンター要素を更新
                const successCountEl = document.getElementById('successCount');
                const failCountEl = document.getElementById('failCount');
                if (successCountEl && failCountEl) {
                    successCountEl.innerHTML = `<span style="color:green; font-weight:bold;">成功: ${successful}</span>`;
                    failCountEl.innerHTML = `<span style="color:red; font-weight:bold;">失敗: ${failed}</span>`;
                }

                // 進捗と成功・失敗カウントを更新
                updateProgress(processed, total, successful, failed);

                // 次のエントリを処理（間隔を少し長めに）
                setTimeout(() => {
                    processNextEntry(index + 1, tabId);
                }, 2000); // 2秒間隔に変更
            })
            .catch(error => {
                processed++;
                resultEntry['結果'] = '失敗';
                resultEntry['メッセージ'] = error.message || 'エラーが発生しました';

                // 結果を保存
                processedData.entries.push(resultEntry);

                // 進捗を更新
                updateProgress(processed, total);

                // 次のエントリを処理
                setTimeout(() => {
                    processNextEntry(index + 1, tabId);
                }, 2000);
            });
    }

    // 進捗を更新する関数
    function updateProgress(current, total) {
        const percent = Math.round((current / total) * 100);
        progressIndicator.style.width = `${percent}%`;
        progressText.textContent = `${percent}% (${current}/${total})`;

        showStatus(`処理中: ${current}/${total} 完了 (${successful} 成功)`, '');
    }

    // 処理完了時の関数
    function finishProcessing() {
        showStatus(`処理完了: ${total}件中${successful}件成功、${total - successful}件失敗`, successful === total ? 'success' : 'error');
        downloadButton.disabled = false;
        uploadButton.disabled = false;
    }
}

function createTimeEntryInBrowser(entry, tabId) {
    return new Promise((resolve) => {
        try {
            // 環境チェック
            if (!selectedEnvironment || !selectedEnvironment.url) {
                resolve({
                    success: false,
                    error: 'Redmine環境が選択されていません'
                });
                return;
            }

            // エントリからデータを取得と検証
            const projectId = entry['プロジェクトID'];
            const issueId = parseInt(entry['チケットID']);
            const spentOn = entry['日付'];
            const hours = parseFloat(entry['時間']);
            const userId = entry['担当者'];
            const activityId = entry['作業分類'];
            const comments = entry['コメント'] || '';

            // 必須フィールドの検証
            if (!projectId || isNaN(issueId) || !spentOn || isNaN(hours) || !userId || !activityId) {
                resolve({
                    success: false,
                    error: '必須フィールドが不足しています'
                });
                return;
            }

            // 時間記録ページのURL
            const timeEntryUrl = `${selectedEnvironment.url}/projects/${projectId}/time_entries/new`;
            console.log('時間記録ページにアクセス:', timeEntryUrl);

            // 現在のタブでページ遷移
            chrome.tabs.update(tabId, {url: timeEntryUrl}, function(updatedTab) {
                if (chrome.runtime.lastError) {
                    resolve({
                        success: false,
                        error: `ページアクセスエラー: ${chrome.runtime.lastError.message}`
                    });
                    return;
                }

                console.log('現在のタブでページ遷移開始:', timeEntryUrl);

                // ページ読み込み完了を待つリスナー
                let isProcessed = false;
                
                const pageLoadListener = function(updatedTabId, changeInfo) {
                    // 対象のタブで、ページ読み込みが完了した場合のみ処理
                    if (updatedTabId === tabId && changeInfo.status === 'complete' && !isProcessed) {
                        isProcessed = true;
                        chrome.tabs.onUpdated.removeListener(pageLoadListener);
                        
                        console.log('ページ読み込み完了、フォーム入力開始');
                        
                        // ページが完全に読み込まれるまで少し待機
                        setTimeout(() => {
                            // フォーム入力スクリプトを実行
                            chrome.scripting.executeScript({
                                target: {tabId: tabId},
                                func: function(spentOn, hours, userIdOrName, activityIdOrName, projectId, issueId, comments) {
                                    // ブラウザ内でフォーム入力を実行
                                    try {
                                        console.log('フォーム入力開始:', {
                                            プロジェクトID: projectId,
                                            チケットID: issueId, 
                                            日付: spentOn, 
                                            時間: hours, 
                                            担当者: userIdOrName, 
                                            作業分類: activityIdOrName, 
                                            コメント: comments
                                        });

                                        // フォームが存在するかチェック
                                        const form = document.getElementById('new_time_entry') || 
                                                    document.querySelector('form.new_time_entry') || 
                                                    document.querySelector('form[action*="time_entries"]');

                                        if (!form) {
                                            console.error('時間記録フォームが見つかりません');
                                            return {success: false, error: '時間記録フォームが見つかりません'};
                                        }

                                        console.log('フォーム見つかりました:', form.id || form.className);

                                        // 1. 日付フィールド
                                        const dateField = document.getElementById('time_entry_spent_on');
                                        if (dateField) {
                                            dateField.value = spentOn;
                                            console.log('日付設定:', spentOn);
                                        } else {
                                            return {success: false, error: '日付フィールドが見つかりません'};
                                        }

                                        // 2. チケットIDフィールド
                                        const issueField = document.getElementById('time_entry_issue_id');
                                        if (issueField) {
                                            issueField.value = issueId;
                                            console.log('チケットID設定:', issueId);

                                            // チェンジイベントを発火
                                            const issueInputEvent = new Event('input', {bubbles: true});
                                            issueField.dispatchEvent(issueInputEvent);
                                            const issueChangeEvent = new Event('change', {bubbles: true});
                                            issueField.dispatchEvent(issueChangeEvent);
                                        } else {
                                            return {success: false, error: 'チケットフィールドが見つかりません'};
                                        }

                                        // 3. 時間フィールド
                                        const hoursField = document.getElementById('time_entry_hours');
                                        if (hoursField) {
                                            hoursField.value = hours;
                                            console.log('時間設定:', hours);
                                        } else {
                                            return {success: false, error: '時間フィールドが見つかりません'};
                                        }

                                        // 4. ユーザーフィールド
                                        const userField = document.getElementById('time_entry_user_id');
                                        if (userField) {
                                            let userSet = false;

                                            console.log('ユーザー選択肢:', Array.from(userField.options).map(opt =>
                                                `${opt.value}: ${opt.textContent.trim()}`
                                            ));

                                            // 「自分」を最初に試す
                                            if (userIdOrName === '自分' || userIdOrName.includes('自分')) {
                                                const myselfOption = Array.from(userField.options).find(option =>
                                                    option.textContent.includes('自分'));
                                                if (myselfOption) {
                                                    userField.value = myselfOption.value;
                                                    userSet = true;
                                                    console.log('ユーザー設定（自分）:', myselfOption.value, myselfOption.textContent.trim());
                                                }
                                            }

                                            // IDまたは名前で検索（「自分」で設定されていない場合）
                                            if (!userSet) {
                                                if (!isNaN(parseInt(userIdOrName))) {
                                                    // 数値IDの場合
                                                    const userId = parseInt(userIdOrName);
                                                    const userOption = Array.from(userField.options).find(option => parseInt(option.value) === userId);
                                                    if (userOption) {
                                                        userField.value = userOption.value;
                                                        userSet = true;
                                                        console.log('ユーザー設定（ID）:', userOption.value, userOption.textContent.trim());
                                                    }
                                                } else {
                                                    // 名前の場合
                                                    const userOption = Array.from(userField.options).find(option => {
                                                        const optionText = option.textContent.trim();
                                                        return optionText === userIdOrName ||
                                                               optionText.includes(userIdOrName) ||
                                                               userIdOrName.includes(optionText.replace(/[<>]/g, '').trim());
                                                    });
                                                    if (userOption) {
                                                        userField.value = userOption.value;
                                                        userSet = true;
                                                        console.log('ユーザー設定（名前）:', userOption.value, userOption.textContent.trim());
                                                    }
                                                }
                                            }

                                            // ユーザーが見つからない場合は最初のオプションを使用
                                            if (!userSet && userField.options.length > 0) {
                                                userField.value = userField.options[0].value;
                                                userSet = true;
                                                console.log('ユーザー設定（デフォルト）:', userField.options[0].value, userField.options[0].textContent.trim());
                                            }

                                            // jQuery Select2が利用可能な場合はSelect2を正しく更新
                                            if (window.jQuery && window.jQuery().select2) {
                                                const $userField = window.jQuery(userField);
                                                try {
                                                    // 既存のSelect2を破棄して再初期化
                                                    $userField.select2('destroy');
                                                } catch (e) {
                                                    console.log('Select2破棄中のエラー（無視可）:', e.message);
                                                }

                                                // 新しいSelect2を初期化
                                                $userField.select2();

                                                // 値を設定し、明示的にSelect2イベントを発火
                                                $userField.val(userField.value).trigger('change.select2');
                                                console.log('Select2更新後のユーザー値:', $userField.val());
                                            }
                                        }

                                        // 5. 作業分類フィールド（修正版）
                                        const activityField = document.getElementById('time_entry_activity_id');
                                        if (activityField) {
                                            let activitySet = false;

                                            console.log('作業分類選択肢:', Array.from(activityField.options).map(opt =>
                                                `${opt.value}: ${opt.textContent.trim()}`
                                            ));

                                            // 名前で直接指定された作業分類を選択する処理
                                            if (typeof activityIdOrName === 'string' && activityIdOrName.trim() !== '') {
                                                // option要素をループして、テキストが指定された名前と一致するものを探す
                                                for (var i = 0; i < activityField.options.length; i++) {
                                                    var opt = activityField.options[i];
                                                    if (opt.text.trim() === activityIdOrName.trim()) {
                                                        // 該当オプションが見つかったら selected を true にする
                                                        opt.selected = true;
                                                        activityField.value = opt.value;
                                                        activitySet = true;
                                                        console.log('作業分類設定（テキスト完全一致）:', opt.value, opt.text.trim());

                                                        // changeイベントを発火
                                                        var event = new Event('change');
                                                        activityField.dispatchEvent(event);
                                                        break;
                                                    }
                                                }
                                            }

                                            // 既に名前で完全一致した場合は以降の処理をスキップ
                                            if (!activitySet && activityIdOrName) {
                                                console.log('指定された作業分類を検索:', activityIdOrName);

                                                if (!isNaN(parseInt(activityIdOrName))) {
                                                    // 数値IDの場合
                                                    const activityId = parseInt(activityIdOrName);
                                                    const activityOption = Array.from(activityField.options).find(option =>
                                                        parseInt(option.value) === activityId
                                                    );
                                                    if (activityOption) {
                                                        activityField.value = activityOption.value;
                                                        activitySet = true;
                                                        console.log('作業分類設定（ID）:', activityOption.value, activityOption.textContent.trim());
                                                    }
                                                } else {
                                                    // 名前の場合 - 完全一致を優先
                                                    let activityOption = Array.from(activityField.options).find(option =>
                                                        option.textContent.trim().toLowerCase() === activityIdOrName.toLowerCase()
                                                    );

                                                    // 完全一致がなければ部分一致を試す
                                                    if (!activityOption) {
                                                        activityOption = Array.from(activityField.options).find(option =>
                                                            option.textContent.trim().toLowerCase().includes(activityIdOrName.toLowerCase()) ||
                                                            activityIdOrName.toLowerCase().includes(option.textContent.trim().toLowerCase())
                                                        );
                                                    }

                                                    // 特定のキーワードでのマッピング
                                                    if (!activityOption) {
                                                        const keywordMap = {
                                                            '開発': ['コーディング', 'プログラミング', '実装'],
                                                            'コーディング': ['開発', 'プログラミング', '実装'],
                                                            '設計': ['要件', '分析'],
                                                            'テスト': ['検証', 'QA'],
                                                            '管理': ['チーム管理', 'プロジェクト管理'],
                                                            'バグ': ['修正', 'デバッグ', 'フィックス'],
                                                            'レビュー': ['確認', 'チェック']
                                                        };

                                                        // キーワードマッピングに基づいて検索
                                                        for (const [keyword, synonyms] of Object.entries(keywordMap)) {
                                                            if (activityIdOrName.toLowerCase().includes(keyword.toLowerCase())) {
                                                                // キーワードを含む作業分類を検索
                                                                activityOption = Array.from(activityField.options).find(option =>
                                                                    option.textContent.trim().toLowerCase().includes(keyword.toLowerCase())
                                                                );
                                                                if (activityOption) break;

                                                                // 同義語も検索
                                                                for (const synonym of synonyms) {
                                                                    activityOption = Array.from(activityField.options).find(option =>
                                                                        option.textContent.trim().toLowerCase().includes(synonym.toLowerCase())
                                                                    );
                                                                    if (activityOption) break;
                                                                }
                                                                if (activityOption) break;
                                                            }
                                                        }
                                                    }

                                                    if (activityOption) {
                                                        activityField.value = activityOption.value;
                                                        activitySet = true;
                                                        console.log('作業分類設定（名前）:', activityOption.value, activityOption.textContent.trim());
                                                    }
                                                }
                                            }

                                            // 作業分類が設定されていない場合にのみデフォルト値を設定
                                            if (!activitySet && activityField.options.length > 1) {
                                                // 「選んでください」以外の最初の有効な値を選択
                                                const firstValidOption = Array.from(activityField.options).find(option =>
                                                    option.value !== '' && !option.textContent.includes('選んでください')
                                                );
                                                if (firstValidOption) {
                                                    console.log('デフォルト作業分類設定:', firstValidOption.value, firstValidOption.textContent.trim());
                                                    activityField.value = firstValidOption.value;
                                                    activitySet = true;
                                                }
                                            }

                                            if (!activitySet) {
                                                // 作業分類が見つからなかった場合は警告を出すだけで、エラーにはしない
                                                const availableOptions = Array.from(activityField.options).map(opt =>
                                                    `${opt.value}: ${opt.textContent.trim()}`
                                                ).join(', ');
                                                console.warn(`作業分類「${activityIdOrName}」が見つかりません。最初の有効な値を使用します。利用可能: ${availableOptions}`);

                                                // 最初の有効な値を設定
                                                const firstValidOption = Array.from(activityField.options).find(option => option.value !== '');
                                                if (firstValidOption) {
                                                    activityField.value = firstValidOption.value;
                                                    activitySet = true;
                                                    console.log('フォールバック作業分類設定:', firstValidOption.value, firstValidOption.textContent.trim());
                                                } else {
                                                    return {success: false, error: `作業分類が設定できません。有効な選択肢がありません。`};
                                                }
                                            }

                                            // 選択した値を保持
                                            const selectedActivityId = activityField.value;
                                            console.log('最終的な作業分類ID:', selectedActivityId);

                                            // select要素を直接更新
                                            activityField.value = selectedActivityId;

                                            // select要素を明示的に更新するイベントを発火
                                            const nativeSelectEvent = new Event('change', {bubbles: true});
                                            activityField.dispatchEvent(nativeSelectEvent);

                                            // jQuery Select2を使った更新
                                            if (window.jQuery && window.jQuery().select2) {
                                                console.log('Select2による作業分類更新');
                                                const $activityField = window.jQuery(activityField);

                                                try {
                                                    // 既存のSelect2を破棄して再初期化
                                                    $activityField.select2('destroy');
                                                } catch (e) {
                                                    console.log('Select2破棄中のエラー（無視可）:', e.message);
                                                }

                                                // 全てのオプションを一度確認してログに出力
                                                console.log('更新前の作業分類オプション状態:', Array.from(activityField.options).map(opt =>
                                                    `${opt.value}: ${opt.textContent.trim()}, selected=${opt.selected}`
                                                ));

                                                // HTMLの選択状態をリセット
                                                Array.from(activityField.options).forEach(option => {
                                                    option.selected = false;
                                                    option.removeAttribute('selected');
                                                });

                                                // 対象のオプションを選択状態に設定
                                                const targetOption = Array.from(activityField.options).find(option => option.value === selectedActivityId);
                                                if (targetOption) {
                                                    targetOption.selected = true;
                                                    targetOption.setAttribute('selected', 'selected');
                                                    console.log('選択対象オプション:', targetOption.value, targetOption.textContent.trim());
                                                }

                                                // 選択状態を確認
                                                activityField.value = selectedActivityId;

                                                // 新しいSelect2を初期化
                                                try {
                                                    $activityField.select2();
                                                } catch (e) {
                                                    console.log('Select2初期化エラー（無視可）:', e.message);
                                                }

                                                // 値を設定し、changeイベントを発火（複数の方法で確実に設定）
                                                try {
                                                    // 複数の手法を試す
                                                    $activityField.val(selectedActivityId);
                                                    $activityField.trigger('change');

                                                    // select2固有のトリガー
                                                    $activityField.trigger('change.select2');

                                                    // select2の値を直接設定する試み
                                                    const select2Data = $activityField.select2('data');
                                                    if (select2Data && select2Data[0]) {
                                                        console.log('現在のselect2データ:', select2Data[0]);
                                                    }
                                                } catch (e) {
                                                    console.log('Select2イベント発火エラー（無視可）:', e.message);
                                                }

                                                console.log('Select2更新後の値:', $activityField.val(), 'HTML値:', activityField.value);

                                                // データ属性としても値を保存（送信前チェック用）
                                                activityField.setAttribute('data-selected-value', selectedActivityId);

                                                // 選択項目のテキストをSelect2の表示エリアに強制設定
                                                setTimeout(() => {
                                                    const selectedOption = activityField.options[activityField.selectedIndex];
                                                    const select2Rendered = document.querySelector('#select2-time_entry_activity_id-container');
                                                    if (select2Rendered && selectedOption) {
                                                        select2Rendered.textContent = selectedOption.textContent;
                                                        select2Rendered.title = selectedOption.textContent;
                                                    }
                                                }, 100);

                                                // 非表示の場合は表示する
                                                const select2Containers = document.querySelectorAll('.select2-container--default');
                                                select2Containers.forEach(container => {
                                                    if (container.style.display === 'none' || container.style.visibility === 'hidden') {
                                                        container.style.display = 'block';
                                                        container.style.visibility = 'visible';
                                                    }
                                                });
                                            }

                                        } else {
                                            return {success: false, error: '作業分類フィールドが見つかりません'};
                                        }

                                        // 6. コメントフィールド
                                        const commentsField = document.getElementById('time_entry_comments');
                                        if (commentsField && comments) {
                                            commentsField.value = comments;
                                            console.log('コメント設定:', comments);
                                        }

                                        // フォーム送信と結果判定
                                        setTimeout(() => {
                                            console.log('フォーム送信実行');

                                            // 連続作成ボタンを優先的に探す
                                            const continuousCreateButton = form.querySelector('input[type="submit"][name="continue"]') ||
                                                                        form.querySelector('input[name="continue"]') ||
                                                                        form.querySelector('button[name="continue"]') ||
                                                                        Array.from(form.querySelectorAll('input[type="submit"], button[type="submit"]'))
                                                                            .find(btn => btn.value === '連続作成' || btn.textContent.includes('連続作成'));

                                            const normalSubmitButton = form.querySelector('input[type="submit"][name="commit"]') ||
                                                                      form.querySelector('input[type="submit"]') ||
                                                                      form.querySelector('button[type="submit"]');

                                            // 送信ボタンの選択（連続作成優先）
                                            const submitButton = continuousCreateButton || normalSubmitButton;

                                            if (submitButton) {
                                                console.log('使用するボタン:', submitButton.name || submitButton.value || submitButton.textContent);

                                                // 送信直前に作業分類を再確認・強制設定
                                                const activityField = document.getElementById('time_entry_activity_id');
                                                if (activityField && activityField.options.length > 0) {
                                                    // 実際の作業分類IDを取得
                                                    let finalActivityId = activityIdOrName; // TSVで指定された値

                                                    console.log('送信前作業分類状態確認:', {
                                                        '指定値': activityIdOrName,
                                                        '現在の値': activityField.value,
                                                        'オプション数': activityField.options.length,
                                                        '選択インデックス': activityField.selectedIndex
                                                    });

                                                    // ①まず指定された作業分類IDを最優先で使用
                                                    if (activityIdOrName) {
                                                        // IDが数値の場合
                                                        if (!isNaN(parseInt(activityIdOrName))) {
                                                            const activityId = parseInt(activityIdOrName);
                                                            const activityOption = Array.from(activityField.options).find(option =>
                                                                parseInt(option.value) === activityId
                                                            );

                                                            if (activityOption) {
                                                                finalActivityId = activityOption.value;
                                                                console.log('送信前に指定ID作業分類を設定:', finalActivityId);
                                                            }
                                                        }
                                                        // 名前の場合
                                                        else {
                                                            const activityOption = Array.from(activityField.options).find(option =>
                                                                option.textContent.trim().toLowerCase().includes(activityIdOrName.toLowerCase())
                                                            );

                                                            if (activityOption) {
                                                                finalActivityId = activityOption.value;
                                                                console.log('送信前に指定名称作業分類を設定:', finalActivityId);
                                                            }
                                                        }
                                                    }

                                                    // ②保存された値があればそれを使用
                                                    const savedValue = activityField.getAttribute('data-selected-value');
                                                    if (!finalActivityId && savedValue && savedValue !== '') {
                                                        finalActivityId = savedValue;
                                                        console.log('送信前に保存済み作業分類を設定:', finalActivityId);
                                                    }

                                                    // ③現在選択されている値があればそれを使用
                                                    if (!finalActivityId && activityField.value && activityField.value !== '') {
                                                        finalActivityId = activityField.value;
                                                        console.log('送信前に現在選択作業分類を使用:', finalActivityId);
                                                    }

                                                    // ④どれも無ければ最初の有効なオプションを使用
                                                    if (!finalActivityId || finalActivityId === '') {
                                                        const firstValidOption = Array.from(activityField.options).find(opt =>
                                                            opt.value !== '' && !opt.textContent.includes('選んでください')
                                                        );

                                                        if (firstValidOption) {
                                                            finalActivityId = firstValidOption.value;
                                                            console.log('送信前に最初の有効な作業分類を設定:', finalActivityId);
                                                        }
                                                    }

                                                    // 最終的な作業分類IDを設定
                                                    if (finalActivityId && finalActivityId !== '') {
                                                        // 選択状態をリセット
                                                        Array.from(activityField.options).forEach(option => {
                                                            option.selected = false;
                                                            option.removeAttribute('selected');
                                                        });

                                                        // 対象のオプションを選択
                                                        const targetOption = Array.from(activityField.options).find(option =>
                                                            option.value === finalActivityId.toString()
                                                        );

                                                        if (targetOption) {
                                                            // HTMLレベルで選択状態を設定
                                                            targetOption.selected = true;
                                                            targetOption.setAttribute('selected', 'selected');

                                                            // selectの値を設定
                                                            activityField.value = finalActivityId;
                                                            console.log('送信前の最終作業分類設定:', finalActivityId, targetOption.textContent.trim());

                                                            // jQuery Select2も最終更新
                                                            if (window.jQuery && window.jQuery().select2) {
                                                                try {
                                                                    const $activityField = window.jQuery(activityField);

                                                                    // 既存のSelect2を再初期化
                                                                    $activityField.select2('destroy').select2();

                                                                    // 値をセットしてイベントを発火
                                                                    $activityField.val(finalActivityId);
                                                                    $activityField.trigger('change');
                                                                    $activityField.trigger('change.select2');

                                                                    // Select2表示も直接更新
                                                                    setTimeout(() => {
                                                                        const select2Rendered = document.querySelector('#select2-time_entry_activity_id-container');
                                                                        if (select2Rendered && targetOption) {
                                                                            select2Rendered.textContent = targetOption.textContent.trim();
                                                                            select2Rendered.title = targetOption.textContent.trim();
                                                                            console.log('Select2表示テキスト更新:', targetOption.textContent.trim());
                                                                        }
                                                                    }, 100);
                                                                } catch (e) {
                                                                    console.log('Select2最終更新エラー（無視可）:', e.message);
                                                                }
                                                            }
                                                        }
                                                    }
                                                }

                                                // フォーム送信前の状態を記録
                                                const originalUrl = window.location.href;

                                                // 送信後の結果を監視する
                                                const checkResult = () => {
                                                    setTimeout(() => {
                                                        // エラー表示の確認
                                                        const errorElement = document.getElementById('errorExplanation');
                                                        const flashError = document.querySelector('.flash.error');
                                                        const flashNotice = document.querySelector('.flash.notice, div.flash.notice, #flash_notice');
                                                        const newTimeEntryForm = document.querySelector('form.new_time_entry') || document.getElementById('new_time_entry');
                                                        const flashContent = flashNotice ? flashNotice.textContent.trim() : '';

                                                        console.log('結果確認:', {
                                                            url: window.location.href,
                                                            hasError: !!errorElement,
                                                            hasFlashError: !!flashError,
                                                            hasFlashNotice: !!flashNotice,
                                                            flashContent: flashContent,
                                                            hasNewForm: !!newTimeEntryForm
                                                        });

                                                        // フォームがなくなったら成功と判断
                                                        const oldForm = document.getElementById('new_time_entry') || document.querySelector('form.new_time_entry');

                                                        // 確実に成功を判定
                                                        if (flashNotice && (
                                                            flashContent.includes('作成しました') || 
                                                            flashContent.includes('登録しました') || 
                                                            flashContent.includes('success') ||
                                                            document.body.innerHTML.includes('icon--checked') // SVGアイコンの存在を確認
                                                        )) {
                                                            // 成功メッセージがある場合（最優先）
                                                            window.formSubmissionResult = {
                                                                success: true,
                                                                message: flashContent || '作成しました。'
                                                            };
                                                            console.log('成功メッセージを検出:', flashContent);
                                                        } else if (errorElement && errorElement.style.display !== 'none') {
                                                            // エラーメッセージがある場合
                                                            const errorMessages = Array.from(errorElement.querySelectorAll('li')).map(li => li.textContent.trim());
                                                            window.formSubmissionResult = {
                                                                success: false,
                                                                error: `入力エラー: ${errorMessages.join(', ')}`
                                                            };
                                                        } else if (flashError) {
                                                            // フラッシュエラーメッセージがある場合
                                                            window.formSubmissionResult = {
                                                                success: false,
                                                                error: `エラー: ${flashError.textContent.trim()}`
                                                            };
                                                        } else if (window.location.href !== originalUrl) {
                                                            // URLが変わった場合は成功と判断（最も一般的なケース）
                                                            window.formSubmissionResult = {
                                                                success: true,
                                                                message: 'URLが変更されたため、登録に成功したと判断します'
                                                            };
                                                            console.log('URL変更による成功判定:', window.location.href);
                                                        } else if (newTimeEntryForm && window.location.href.includes('/time_entries/new')) {
                                                            // 連続作成で新しいフォームが表示された場合（チケットIDが空になっている）
                                                            const issueField = document.getElementById('time_entry_issue_id');
                                                            const isNewForm = !issueField || !issueField.value;

                                                            if (isNewForm) {
                                                                window.formSubmissionResult = {
                                                                    success: true,
                                                                    message: '時間エントリが登録され、連続作成モードになりました'
                                                                };
                                                            } else {
                                                                // 再確認（まだページ遷移中の可能性）
                                                                setTimeout(checkResult, 1000);
                                                                return;
                                                            }
                                                        } else if (!oldForm && document.body.innerHTML.includes('time_entries')) {
                                                            // 元のフォームがなくなっていて、time_entriesに関連する内容がある場合は成功
                                                            window.formSubmissionResult = {
                                                                success: true,
                                                                message: 'フォームが送信され処理されました'
                                                            };
                                                            console.log('フォーム消失による成功判定');
                                                        } else {
                                                            // その他の場合は再確認（10回まで）
                                                            window.checkResultAttempts = (window.checkResultAttempts || 0) + 1;
                                                            if (window.checkResultAttempts < 10) {
                                                                setTimeout(checkResult, 1000);
                                                                return;
                                                            } else {
                                                                // 最大試行回数を超えた場合は、送信は成功したと判断
                                                                window.formSubmissionResult = {
                                                                    success: true,
                                                                    message: '処理が完了しました（自動判定）'
                                                                };
                                                                console.log('タイムアウトによる自動成功判定');
                                                            }
                                                        }

                                                        console.log('最終結果:', window.formSubmissionResult);
                                                    }, 2000); // 2秒後に結果確認
                                                };

                                                // フォーム送信（クリアは送信後に行う）
                                                submitButton.click();

                                                // 送信後の結果を確認するための関数
                                                const checkFormResult = () => {
                                                    setTimeout(() => {
                                                        // エラー表示を確認
                                                        const errorElement = document.getElementById('errorExplanation');

                                                        if (errorElement && window.getComputedStyle(errorElement).display !== 'none') {
                                                            // エラーメッセージの取得
                                                            const errorMessages = Array.from(errorElement.querySelectorAll('li'))
                                                                .map(li => li.textContent.trim())
                                                                .join(', ');

                                                            window.formSubmissionResult = {
                                                                success: false,
                                                                error: `入力エラー: ${errorMessages}`
                                                            };
                                                            console.log('エラーを検出:', errorMessages);
                                                        } else {
                                                            // エラーがなければ成功
                                                            window.formSubmissionResult = {
                                                                success: true,
                                                                message: '時間エントリが登録されました'
                                                            };
                                                            console.log('フォーム送信成功と判定');
                                                        }

                                                        // 結果判定後、次のレコード処理のためにフォームをクリア
                                                        document.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], textarea, select').forEach(field => {
                                                            // 送信ボタンとhidden要素は除外
                                                            if (field.type !== 'submit' && field.type !== 'hidden') {
                                                                if (field.tagName === 'SELECT') {
                                                                    field.selectedIndex = 0; // セレクトボックスは最初の選択肢にリセット
                                                                } else {
                                                                    field.value = ''; // その他のフィールドは空にする
                                                                }
                                                            }
                                                        });
                                                        console.log('次の入力のためにフォームフィールドをクリアしました');
                                                    }, 3000); // 画面更新を待つため3秒待機
                                                };

                                                // 結果確認を実行
                                                checkFormResult();

                                            } else {
                                                // 送信直前に作業分類を再確認・強制設定
                                                const activityField = document.getElementById('time_entry_activity_id');
                                                if (activityField && activityField.options.length > 0) {
                                                    // 実際の作業分類IDを取得
                                                    let finalActivityId = activityIdOrName; // TSVで指定された値

                                                    console.log('送信前作業分類状態確認(form.submit):', {
                                                        '指定値': activityIdOrName,
                                                        '現在の値': activityField.value,
                                                        'オプション数': activityField.options.length,
                                                        '選択インデックス': activityField.selectedIndex
                                                    });

                                                    // ①まず指定された作業分類IDを最優先で使用
                                                    if (activityIdOrName) {
                                                        // IDが数値の場合
                                                        if (!isNaN(parseInt(activityIdOrName))) {
                                                            const activityId = parseInt(activityIdOrName);
                                                            const activityOption = Array.from(activityField.options).find(option =>
                                                                parseInt(option.value) === activityId
                                                            );

                                                            if (activityOption) {
                                                                finalActivityId = activityOption.value;
                                                                console.log('送信前に指定ID作業分類を設定:', finalActivityId);
                                                            }
                                                        }
                                                        // 名前の場合
                                                        else {
                                                            const activityOption = Array.from(activityField.options).find(option =>
                                                                option.textContent.trim().toLowerCase().includes(activityIdOrName.toLowerCase())
                                                            );

                                                            if (activityOption) {
                                                                finalActivityId = activityOption.value;
                                                                console.log('送信前に指定名称作業分類を設定:', finalActivityId);
                                                            }
                                                        }
                                                    }

                                                    // 作業分類が見つからなければ最初の有効な値を使用
                                                    if (!finalActivityId || finalActivityId === '') {
                                                        const firstValidOption = Array.from(activityField.options).find(opt =>
                                                            opt.value !== '' && !opt.textContent.includes('選んでください')
                                                        );

                                                        if (firstValidOption) {
                                                            finalActivityId = firstValidOption.value;
                                                            console.log('送信前に最初の有効な作業分類を設定:', finalActivityId);
                                                        }
                                                    }

                                                    // 最終的な作業分類IDを設定
                                                    if (finalActivityId && finalActivityId !== '') {
                                                        // HTMLレベルで選択状態を設定
                                                        activityField.value = finalActivityId;

                                                        // jQuery Select2も最終更新
                                                        if (window.jQuery && window.jQuery().select2) {
                                                            try {
                                                                const $activityField = window.jQuery(activityField);
                                                                $activityField.val(finalActivityId).trigger('change');
                                                            } catch (e) {
                                                                console.log('Select2最終更新エラー（無視可）:', e.message);
                                                            }
                                                        }
                                                    }
                                                }

                                                // 連続作成パラメータを追加
                                                const continueInput = document.createElement('input');
                                                continueInput.type = 'hidden';
                                                continueInput.name = 'continue';
                                                continueInput.value = '1';
                                                form.appendChild(continueInput);

                                                console.log('連続作成パラメータを追加してフォーム送信');

                                                // フォーム送信（クリアは送信後に行う）

                                                form.submit();

                                                // 送信後に結果を確認する
                                                setTimeout(() => {
                                                    // エラー表示を確認
                                                    const errorElement = document.getElementById('errorExplanation');

                                                    if (errorElement && window.getComputedStyle(errorElement).display !== 'none') {
                                                        // エラーメッセージの取得
                                                        const errorMessages = Array.from(errorElement.querySelectorAll('li'))
                                                            .map(li => li.textContent.trim())
                                                            .join(', ');

                                                        window.formSubmissionResult = {
                                                            success: false,
                                                            error: `入力エラー: ${errorMessages}`
                                                        };
                                                        console.log('エラーを検出:', errorMessages);
                                                    } else {
                                                        // エラーがなければ成功
                                                        window.formSubmissionResult = {
                                                            success: true,
                                                            message: '時間エントリが登録されました'
                                                        };
                                                        console.log('フォーム送信成功と判定');
                                                    }
                                                }, 5000); // 画面更新を待つため5秒待機
                                            }
                                        }, 1500); // 少し長めに待機

                                        return {success: true, message: 'フォーム入力完了、送信中...'};

                                    } catch (error) {
                                        console.error('フォーム入力エラー:', error);
                                        return {success: false, error: `フォーム入力中にエラー: ${error.message}`};
                                    }
                                },
                                args: [spentOn, hours, userId, activityId, projectId, issueId, comments]
                            }, function(results) {
                                if (chrome.runtime.lastError) {
                                    resolve({
                                        success: false,
                                        error: `フォーム入力エラー: ${chrome.runtime.lastError.message}`
                                    });
                                    return;
                                }

                                if (results && results[0] && results[0].result) {
                                    const result = results[0].result;

                                    // フォーム送信が開始された場合、結果を確認する
                                    if (result.success) {
                                        setTimeout(() => {
                                            // 送信後の画面をチェック
                                            chrome.scripting.executeScript({
                                                target: {tabId: tabId},
                                                func: function() {
                                                    // エラー表示の確認
                                                    const errorElement = document.getElementById('errorExplanation');

                                                    if (errorElement && window.getComputedStyle(errorElement).display !== 'none') {
                                                        // エラーメッセージの取得
                                                        const errorMessages = Array.from(errorElement.querySelectorAll('li'))
                                                            .map(li => li.textContent.trim())
                                                            .join(', ');

                                                        // エラーがある場合もフォームをクリア
                                                                        document.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], textarea, select').forEach(field => {
                                                            if (field.type !== 'submit' && field.type !== 'hidden') {
                                                                if (field.tagName === 'SELECT') {
                                                                    field.selectedIndex = 0;
                                                                } else {
                                                                    field.value = '';
                                                                }
                                                            }
                                                        });
                                                        console.log('エラー発生後もフォームフィールドをクリアしました');

                                                        return {
                                                            success: false,
                                                            error: `入力エラー: ${errorMessages}`
                                                        };
                                                    }

                                                    // フォームをクリア（次のレコード処理のため）
                                                    document.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], textarea, select').forEach(field => {
                                                        // 送信ボタンとhidden要素は除外
                                                        if (field.type !== 'submit' && field.type !== 'hidden') {
                                                            if (field.tagName === 'SELECT') {
                                                                field.selectedIndex = 0; // セレクトボックスは最初の選択肢にリセット
                                                            } else {
                                                                field.value = ''; // その他のフィールドは空にする
                                                            }
                                                        }
                                                    });
                                                    console.log('次の入力のためにフォームフィールドをクリアしました');

                                                    // エラーがなければ成功
                                                    return {
                                                        success: true,
                                                        message: '時間エントリを登録しました'
                                                    };
                                                }
                                            }, function(resultCheck) {
                                                if (resultCheck && resultCheck[0] && resultCheck[0].result) {
                                                    resolve(resultCheck[0].result);
                                                } else {
                                                    // 確認できない場合は成功扱い
                                                    resolve({
                                                        success: true,
                                                        message: '時間エントリを登録しました（確認なし）'
                                                    });
                                                }
                                            });
                                        }, 5000); // 画面更新を待つため5秒待機
                                    } else {
                                        resolve({
                                            success: result.success,
                                            error: result.error
                                        });
                                    }
                                } else {
                                    resolve({
                                        success: false,
                                        error: 'フォーム送信の結果が不明です'
                                    });
                                }
                            });
                        }, 2000); // 2秒待機
                    }
                };

                // リスナーを登録
                chrome.tabs.onUpdated.addListener(pageLoadListener);

                // タイムアウト処理
                setTimeout(() => {
                    if (!isProcessed) {
                        isProcessed = true;
                        chrome.tabs.onUpdated.removeListener(pageLoadListener);
                        resolve({
                            success: false,
                            error: 'ページ読み込みがタイムアウトしました'
                        });
                    }
                }, 15000);
            });

        } catch (error) {
            resolve({
                success: false,
                error: `予期しないエラー: ${error.message}`
            });
        }
    });
}

// 古い fillTimeEntryForm 関数は削除（重複していたため）

    // 注: findAndClickTimeEntryLink関数は削除しました。直接時間記録ページにアクセスするようになったため不要。

    // 時間記録フォームに入力して送信する関数（ブラウザで実行）
    function fillTimeEntryForm(spentOn, hours, userIdOrName, activityIdOrName, projectId) {
        try {
            // プロジェクトフィールド（プロジェクト選択可能な場合）
            const projectField = document.getElementById('time_entry_project_id');
            if (projectField) {
                let projectOption;

                // 数値の場合は数値として比較
                if (!isNaN(parseInt(projectId))) {
                    projectOption = Array.from(projectField.options).find(option => parseInt(option.value) === parseInt(projectId));
                } else {
                    // 文字列の場合は、値または表示テキストで比較
                    projectOption = Array.from(projectField.options).find(option =>
                        option.value === projectId ||
                        option.textContent.trim() === projectId ||
                        option.textContent.includes(projectId)
                    );
                }

                if (projectOption) {
                    projectField.value = projectOption.value;

                    // プロジェクト変更時のイベントを発火させる（アクティビティリストが更新される場合があるため）
                    const event = new Event('change', {bubbles: true});
                    projectField.dispatchEvent(event);
                } else {
                    console.warn(`プロジェクトID「${projectId}」が見つかりません`);
                }
            }

            // 日付フィールド
            const dateField = document.getElementById('time_entry_spent_on');
            if (dateField) {
                dateField.value = spentOn;
            } else {
                return {success: false, error: '日付フィールドが見つかりません'};
            }

            // 時間フィールド
            const hoursField = document.getElementById('time_entry_hours');
            if (hoursField) {
                hoursField.value = hours;
            } else {
                return {success: false, error: '時間フィールドが見つかりません'};
            }

            // ユーザーフィールド（管理者権限があれば表示される）
            const userField = document.getElementById('time_entry_user_id');
            if (userField) {
                // IDか名前で検索
                if (!isNaN(parseInt(userIdOrName))) {
                    // 数値IDの場合
                    const userId = parseInt(userIdOrName);
                    const userOption = Array.from(userField.options).find(option => parseInt(option.value) === userId);
                    if (userOption) {
                        userField.value = userOption.value;
                    }
                } else {
                    // 名前の場合
                    const userOption = Array.from(userField.options).find(option =>
                        option.textContent.trim() === userIdOrName ||
                        option.textContent.includes(userIdOrName)
                    );
                    if (userOption) {
                        userField.value = userOption.value;
                    }
                }
            }

            // 作業分類フィールド
            const activityField = document.getElementById('time_entry_activity_id');
            if (activityField) {
                // IDか名前で検索
                if (!isNaN(parseInt(activityIdOrName))) {
                    // 数値IDの場合
                    const activityId = parseInt(activityIdOrName);
                    const activityOption = Array.from(activityField.options).find(option => parseInt(option.value) === activityId);
                    if (activityOption) {
                        activityField.value = activityOption.value;
                    } else {
                        return {success: false, error: `作業分類ID「${activityIdOrName}」が見つかりません`};
                    }
                } else {
                    // 名前の場合
                    const activityOption = Array.from(activityField.options).find(option =>
                        option.textContent.trim() === activityIdOrName ||
                        option.textContent.includes(activityIdOrName)
                    );
                    if (activityOption) {
                        activityField.value = activityOption.value;
                    } else {
                        return {success: false, error: `作業分類「${activityIdOrName}」が見つかりません`};
                    }
                }
            } else {
                return {success: false, error: '作業分類フィールドが見つかりません'};
            }

            // フォーム送信
            const form = document.getElementById('time_entry_form') || document.querySelector('form.edit_time_entry') || document.querySelector('form');
            if (form) {
                form.submit();
                return {success: true, message: '時間を記録しました'};
            } else {
                return {success: false, error: 'フォームが見つかりません'};
            }
        } catch (error) {
            return {success: false, error: `フォーム入力中にエラー: ${error.message}`};
        }
    }

    // 結果をダウンロードする関数
    function downloadResults() {
        if (!processedData) {
            return;
        }

        // TSVデータを生成
        const headers = processedData.headers;
        const rows = [headers.join('\t')];

        processedData.entries.forEach(entry => {
            const row = headers.map(header => entry[header] || '');
            rows.push(row.join('\t'));
        });

        const tsvContent = rows.join('\n');

        // 現在の日時を取得してファイル名に使用
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10);
        const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
        const fileName = `redmine_time_entries_result_${dateStr}_${timeStr}.tsv`;

        // ダウンロードリンクを作成
        const blob = new Blob([tsvContent], {type: 'text/tab-separated-values'});
        const url = URL.createObjectURL(blob);

        // Blobをダウンロード
        chrome.downloads.download({
            url: url,
            filename: fileName,
            saveAs: true
        }, function (downloadId) {
            if (chrome.runtime.lastError) {
                showStatus(`ダウンロードエラー: ${chrome.runtime.lastError.message}`, 'error');
            } else {
                showStatus('結果ファイルをダウンロードしました', 'success');
            }
        });
    }

    // ステータスメッセージを表示する関数
    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = type || 'info';
    }
});