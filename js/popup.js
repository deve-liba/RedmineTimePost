document.addEventListener('DOMContentLoaded', function () {
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

    const entries = tsvData.entries;
    const total = entries.length;
    let processed = 0;
    let successful = 0;

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
                    resultEntry['結果'] = '失敗';
                    resultEntry['メッセージ'] = result.error || 'エラーが発生しました';
                }

                // 結果を保存
                processedData.entries.push(resultEntry);

                // 進捗を更新
                updateProgress(processed, total);

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
                                            
                                            // IDまたは名前で検索
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
                                                           userIdOrName.includes(optionText.replace(/[<>]/g, '').trim()) ||
                                                           (userIdOrName === '自分' && optionText.includes('自分'));
                                                });
                                                if (userOption) {
                                                    userField.value = userOption.value;
                                                    userSet = true;
                                                    console.log('ユーザー設定（名前）:', userOption.value, userOption.textContent.trim());
                                                }
                                            }
                                            
                                            if (!userSet) {
                                                console.warn(`ユーザー「${userIdOrName}」が見つかりませんでした`);
                                            }
                                        }

                                        // 5. 作業分類フィールド
                                        const activityField = document.getElementById('time_entry_activity_id');
                                        if (activityField) {
                                            let activitySet = false;
                                            
                                            console.log('作業分類選択肢:', Array.from(activityField.options).map(opt => 
                                                `${opt.value}: ${opt.textContent.trim()}`
                                            ));
                                            
                                            if (!isNaN(parseInt(activityIdOrName))) {
                                                // 数値IDの場合
                                                const activityId = parseInt(activityIdOrName);
                                                const activityOption = Array.from(activityField.options).find(option => parseInt(option.value) === activityId);
                                                if (activityOption) {
                                                    activityField.value = activityOption.value;
                                                    activitySet = true;
                                                    console.log('作業分類設定（ID）:', activityOption.value, activityOption.textContent.trim());
                                                }
                                            } else {
                                                // 名前の場合
                                                let activityOption = Array.from(activityField.options).find(option =>
                                                    option.textContent.trim() === activityIdOrName
                                                );
                                                
                                                if (!activityOption) {
                                                    activityOption = Array.from(activityField.options).find(option =>
                                                        option.textContent.includes(activityIdOrName) ||
                                                        activityIdOrName.includes(option.textContent.trim())
                                                    );
                                                }
                                                
                                                if (activityOption) {
                                                    activityField.value = activityOption.value;
                                                    activitySet = true;
                                                    console.log('作業分類設定（名前）:', activityOption.value, activityOption.textContent.trim());
                                                }
                                            }
                                            
                                            if (!activitySet) {
                                                const availableOptions = Array.from(activityField.options).map(opt => 
                                                    `${opt.value}: ${opt.textContent.trim()}`
                                                ).join(', ');
                                                return {success: false, error: `作業分類「${activityIdOrName}」が見つかりません。利用可能: ${availableOptions}`};
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

                                        // フォーム送信
                                        setTimeout(() => {
                                            console.log('フォーム送信実行');
                                            const submitButton = form.querySelector('input[type="submit"][name="commit"]') || 
                                                               form.querySelector('input[type="submit"]') ||
                                                               form.querySelector('button[type="submit"]');
                                            
                                            if (submitButton) {
                                                submitButton.click();
                                            } else {
                                                form.submit();
                                            }
                                        }, 1000);

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
                                    resolve({
                                        success: result.success,
                                        message: result.message || '時間エントリを登録しました',
                                        error: result.error
                                    });
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