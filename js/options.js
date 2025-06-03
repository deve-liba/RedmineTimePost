document.addEventListener('DOMContentLoaded', function() {
  // DOM要素
  const environmentsList = document.getElementById('environmentsList');
  const addEnvironmentForm = document.getElementById('addEnvironmentForm');
  const environmentNameInput = document.getElementById('environmentName');
  const redmineUrlInput = document.getElementById('redmineUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const statusMessage = document.getElementById('statusMessage');

  // 保存された環境を読み込む
  loadEnvironments();

  // 環境追加フォーム送信イベント
  addEnvironmentForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const name = environmentNameInput.value.trim();
    const url = redmineUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim(); // APIキーは保持するが必須ではない

    if (!name || !url) {
      showStatus('環境名とRedmine URLを入力してください', 'error');
      return;
    }

    // URLの検証（接続テストは行わない）
    try {
      new URL(url); // URLの形式チェック
      addEnvironment(name, url, apiKey);
      addEnvironmentForm.reset();
    } catch (error) {
      showStatus('無効なURLです。正しいRedmine URLを入力してください。', 'error');
    }
  });

  // 環境を読み込み表示する関数
  function loadEnvironments() {
    chrome.storage.sync.get('redmineEnvironments', function(data) {
      const environments = data.redmineEnvironments || [];
      environmentsList.innerHTML = '';

      if (environments.length === 0) {
        environmentsList.innerHTML = '<li>登録された環境はありません</li>';
        return;
      }

      environments.forEach((env, index) => {
        const item = document.createElement('li');
        item.className = 'environment-item';
        item.innerHTML = `
          <div>
            <strong>${env.name}</strong> 
            <span class="url">${env.url}</span>
            <div class="actions">
              <button class="test" data-index="${index}">接続テスト</button>
              <button class="delete" data-index="${index}">削除</button>
            </div>
          </div>
        `;
        environmentsList.appendChild(item);
      });

      // 削除ボタンにイベントリスナーを追加
      document.querySelectorAll('.delete').forEach(button => {
        button.addEventListener('click', function() {
          const index = parseInt(this.getAttribute('data-index'));
          deleteEnvironment(index);
        });
      });

      // テストボタンにイベントリスナーを追加
      document.querySelectorAll('.test').forEach(button => {
        button.addEventListener('click', function() {
          const index = parseInt(this.getAttribute('data-index'));
          testEnvironmentConnection(index);
        });
      });
    });
  }

  // 環境を追加する関数
  function addEnvironment(name, url, apiKey) {
    chrome.storage.sync.get('redmineEnvironments', function(data) {
      const environments = data.redmineEnvironments || [];

      // 既存の環境名との重複チェック
      const exists = environments.some(env => env.name === name);
      if (exists) {
        showStatus(`環境名「${name}」は既に使用されています`, 'error');
        return;
      }

      // 末尾のスラッシュを削除
      const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;

      environments.push({
        name: name,
        url: cleanUrl,
        apiKey: apiKey // APIキーは今後の拡張のために保持
      });

      chrome.storage.sync.set({redmineEnvironments: environments}, function() {
        showStatus(`環境「${name}」を追加しました`, 'success');
        loadEnvironments();
      });
    });
  }

  // 環境を削除する関数
  function deleteEnvironment(index) {
    chrome.storage.sync.get('redmineEnvironments', function(data) {
      const environments = data.redmineEnvironments || [];

      if (index >= 0 && index < environments.length) {
        const name = environments[index].name;
        environments.splice(index, 1);

        chrome.storage.sync.set({redmineEnvironments: environments}, function() {
          showStatus(`環境「${name}」を削除しました`, 'success');
          loadEnvironments();
        });
      }
    });
  }

  // 環境接続をテストする関数
  function testEnvironmentConnection(index) {
    chrome.storage.sync.get('redmineEnvironments', function(data) {
      const environments = data.redmineEnvironments || [];

      if (index >= 0 && index < environments.length) {
        const env = environments[index];
        showStatus(`環境「${env.name}」の接続をテストしています...`, '');

        // 新しいタブでRedmineを開いてテスト
        chrome.tabs.create({ url: env.url }, function(tab) {
          // 数秒待ってタブの状態をチェック
          setTimeout(() => {
            chrome.tabs.get(tab.id, function(tabInfo) {
              if (chrome.runtime.lastError) {
                showStatus(`環境「${env.name}」への接続に失敗しました: ${chrome.runtime.lastError.message}`, 'error');
              } else if (tabInfo && !tabInfo.discarded) {
                showStatus(`環境「${env.name}」への接続に成功しました`, 'success');

                // 確認後タブを閉じる
                setTimeout(() => {
                  chrome.tabs.remove(tab.id);
                }, 2000);
              } else {
                showStatus(`環境「${env.name}」への接続に失敗しました`, 'error');
              }
            });
          }, 3000);
        });
      }
    });
  }

  // Redmine接続をテストする関数
  function testConnection(url) {
    return new Promise((resolve, reject) => {
      // Redmineのホームページにアクセスできるかをテスト
      fetch(`${url}`, {
        method: 'GET',
        mode: 'no-cors' // CORSエラーを回避
      })
      .then(() => {
        // no-corsモードではレスポンスの中身を見れないので、リクエストが投げられたら成功とみなす
        resolve(true);
      })
      .catch(error => {
        reject(error);
      });
    });
  }

  // ステータスメッセージを表示する関数
  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = type;

    // 成功メッセージは3秒後に消える
    if (type === 'success') {
      setTimeout(() => {
        statusMessage.textContent = '';
        statusMessage.className = '';
      }, 3000);
    }
  }
});
